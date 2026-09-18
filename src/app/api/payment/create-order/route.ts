import { effectiveBillingMode } from "@/lib/subscription";
import { availablePrinters, supportsPrint } from "@/lib/printer-availability";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hashGuestOrderToken } from "@/lib/guest-order";
import { assertShopCanPrice, calculatePricing, type PricingRule } from "@/lib/pricing-engine";
import { createRazorpayOrder, getRazorpayClient, toPaise } from "@/lib/razorpay/server";
import type { PrintRange } from "@/lib/customer-print";
import { mockPaymentsEnabled, isMockPayment } from "@/lib/mock-payments";
import { releasePaidOrder } from "@/lib/release-paid-order";

const createPaymentOrderSchema = z.object({
  orderId: z.string().uuid(),
  shopIdentifier: z.string().min(1),
  accessToken: z.string().min(10).optional(),
  idempotencyKey: z.string().optional(),
  paymentMode: z.enum(["razorpay", "mock"]).default("razorpay"),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createPaymentOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payment order request.", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { orderId, shopIdentifier, accessToken, idempotencyKey, paymentMode } = parsed.data;
  if (paymentMode === "mock" && !mockPaymentsEnabled())
    return NextResponse.json({ error: "Mock payments are disabled on this server." }, { status: 403 });

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service is not configured." }, { status: 503 });
  }

  // 1. Fetch shop and verify eligibility
  const { data: shop, error: shopError } = await adminClient
    .from("shops")
    .select("id, public_id, name, is_active")
    .eq("public_id", shopIdentifier)
    .maybeSingle();

  if (shopError || !shop) {
    return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  }

  const [{ data: settings }, { data: subscription }] = await Promise.all([
    adminClient.from("shop_settings").select("accepting_orders, billing_mode").eq("shop_id", shop.id).maybeSingle(),
    adminClient.from("subscriptions").select("status, trial_end, current_period_end").eq("shop_id", shop.id).maybeSingle(),
  ]);

  const billingMode = effectiveBillingMode(settings?.billing_mode, subscription);
  try {
    assertShopCanPrice({
      isActive: shop.is_active,
      acceptingOrders: settings?.accepting_orders === true,
    });
  } catch (eligibilityError) {
    return NextResponse.json(
      { error: eligibilityError instanceof Error ? eligibilityError.message : "Shop is currently unavailable." },
      { status: 409 },
    );
  }

  // 2. Fetch order and verify authorization
  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id, public_id, shop_id, customer_id, status, total_amount, currency, guest_access_token_hash")
    .eq("id", orderId)
    .eq("shop_id", shop.id)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Verify access either through guest token or authenticated customer
  let isAuthorized = false;
  if (accessToken && order.guest_access_token_hash) {
    if (order.guest_access_token_hash === hashGuestOrderToken(accessToken)) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    const serverClient = await createSupabaseServerClient();
    if (serverClient) {
      const {
        data: { user },
      } = await serverClient.auth.getUser();
      if (user && (order.customer_id === user.id || user.id === order.customer_id)) {
        isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: "Order access could not be verified." }, { status: 403 });
  }

  if (paymentMode === "mock") {
    const { data: payment, error } = await adminClient.from("payments")
      .select("id, provider, status, provider_payment_id, metadata").eq("order_id", order.id).maybeSingle();
    if (error) return NextResponse.json({ error: "Could not check the existing payment." }, { status: 500 });
    if (payment && payment.status === "verified") {
      try { await releasePaidOrder(adminClient, order.id); }
      catch { return NextResponse.json({ error: "Test payment recorded. Retry to release the print queue." }, { status: 503 }); }
      return NextResponse.json({ success: true, mock: true, verified: true, publicOrderId: order.public_id,
        paymentId: payment.provider_payment_id, amountRupees: Number(order.total_amount), currency: order.currency });
    }
  }

  // 3. Check order status — never re-charge an already paid or completed order
  if (["paid", "completed", "printing", "partially_printed"].includes(order.status)) {
    return NextResponse.json(
      { error: "This order has already been paid for.", status: order.status, alreadyPaid: true },
      { status: 409 },
    );
  }
  if (order.status !== "awaiting_payment")
    return NextResponse.json({ error: "Configure this order before starting payment." }, { status: 409 });

  // 4. Calculate authoritative price from database records (NEVER trust client price)
  const [{ data: rules }, { data: printJobs }] = await Promise.all([
    adminClient
      .from("pricing_rules")
      .select("color_mode, paper_size, min_pages, max_pages, price_per_page")
      .eq("shop_id", shop.id)
      .eq("is_active", true),
    adminClient.from("print_jobs").select("id, document_id, total_pages, total_amount").eq("order_id", order.id),
  ]);

  if (!rules?.length) {
    return NextResponse.json({ error: "This shop has no active pricing configured." }, { status: 409 });
  }

  if (!printJobs?.length) {
    return NextResponse.json({ error: "No print jobs found for this order." }, { status: 400 });
  }

  const { data: pages } = await adminClient
    .from("print_job_pages")
    .select("start_page, end_page, color_mode, paper_size, print_job_id")
    .in(
      "print_job_id",
      printJobs.map((j) => j.id),
    );

  if (!pages?.length) {
    return NextResponse.json({ error: "No configured page ranges found for this order." }, { status: 400 });
  }

  const ranges: PrintRange[] = pages.map((p) => ({
    startPage: p.start_page,
    endPage: p.end_page,
    colorMode: p.color_mode as "black_and_white" | "color",
    paperSize: p.paper_size as "a4" | "a3" | "letter" | "legal",
  }));

  const [inventory, agents] = await Promise.all([
    adminClient.from("printers").select("id,name,driver_name,desktop_agent_id,status,is_online,last_seen_at,capabilities").eq("shop_id", shop.id),
    adminClient.from("desktop_agents").select("id,last_heartbeat_at,is_revoked").eq("shop_id", shop.id).eq("is_revoked", false),
  ]);
  const online = availablePrinters(inventory.data || [], agents.data || []);
  if (ranges.some(range => !online.some(printer => supportsPrint(printer, range.colorMode, range.paperSize)))) {
    return NextResponse.json({ error: "The required printer is offline. Reconnect it before payment." }, { status: 409 });
  }
  let authoritativePricing;
  try {
    authoritativePricing = calculatePricing(
      ranges,
      rules.map((r) => ({ ...r, price_per_page: Number(r.price_per_page), is_active: true })) as PricingRule[],
      billingMode,
    );
  } catch (calcError) {
    return NextResponse.json(
      { error: calcError instanceof Error ? calcError.message : "Pricing calculation failed." },
      { status: 409 },
    );
  }

  const authoritativeTotal = authoritativePricing.total;
  if (authoritativeTotal <= 0) {
    return NextResponse.json({ error: "Order amount must be greater than zero." }, { status: 400 });
  }

  // Update order with authoritative total if needed
  if (Number(order.total_amount) !== authoritativeTotal) {
    await adminClient
      .from("orders")
      .update({
        total_amount: authoritativeTotal,
        total_pages: authoritativePricing.colorPages + authoritativePricing.blackAndWhitePages,
        color_pages: authoritativePricing.colorPages,
        black_and_white_pages: authoritativePricing.blackAndWhitePages,
      })
      .eq("id", order.id);
  }

  if (paymentMode === "mock") {
    const paymentId = `mock_payment_${order.id}`;
    const { error } = await adminClient.from("payments").upsert({
      id: order.id, order_id: order.id, customer_id: order.customer_id,
      provider: "mock", provider_order_id: `mock_order_${order.id}`, provider_payment_id: paymentId,
      status: "verified", amount: authoritativeTotal, currency: "INR", verified_at: new Date().toISOString(),
      payment_method: "mock", idempotency_key: `mock_${order.id}`,
      metadata: { source: "printsaathi-test-checkout-v1", money_collected: false },
    }, { onConflict: "id" });
    if (error) return NextResponse.json({ error: "Could not record test payment. Retry; no money was charged." }, { status: 409 });
    await adminClient.from("payment_transactions").insert({ payment_id: order.id, order_id: order.id,
      provider: "mock", provider_payment_id: paymentId, event_type: "mock_payment_verified", status: "verified",
      amount: authoritativeTotal, currency: "INR", raw_payload: { money_collected: false } });
    try { await releasePaidOrder(adminClient, order.id); }
    catch { return NextResponse.json({ error: "Test payment recorded. Retry to release the print queue." }, { status: 503 }); }
    return NextResponse.json({ success: true, mock: true, verified: true, publicOrderId: order.public_id,
      paymentId, amountRupees: authoritativeTotal, currency: "INR" });
  }

  const razorpayConfig = getRazorpayClient();
  if (!razorpayConfig) return NextResponse.json({ error: "Payments are not configured yet. The shop owner must add Razorpay keys before checkout is available." }, { status: 503 });

  // 5. Check existing payment records for idempotency
  const { data: existingPayment } = await adminClient
    .from("payments")
    .select("id, status, provider_order_id, provider_payment_id, amount, idempotency_key")
    .eq("order_id", order.id)
    .maybeSingle();

  if (existingPayment) {
    if (existingPayment.status === "verified") {
      return NextResponse.json(
        { error: "Payment for this order has already been verified.", alreadyPaid: true },
        { status: 409 },
      );
    }

    // If there is an active created/pending payment with the exact same amount and provider_order_id, reuse it
    if (
      (["created", "pending", "failed"].includes(existingPayment.status)) &&
      existingPayment.provider_order_id &&
      Number(existingPayment.amount) === authoritativeTotal
    ) {
      return NextResponse.json({
        success: true,
        orderId: order.id,
        publicOrderId: order.public_id,
        razorpayOrderId: existingPayment.provider_order_id,
        amount: toPaise(authoritativeTotal),
        amountRupees: authoritativeTotal,
        currency: "INR",
        keyId: razorpayConfig.keyId,
        isTestMode: razorpayConfig.isTestMode,
      });
    }
  }

  // 6. Create Razorpay order on server
  const receipt = `order_${order.public_id || order.id.slice(0, 8)}_${Date.now()}`.slice(0, 40);
  let razorpayOrder;
  try {
    razorpayOrder = await createRazorpayOrder({
      amountRupees: authoritativeTotal,
      currency: "INR",
      receipt,
      notes: {
        order_id: order.id,
        shop_id: shop.id,
        shop_public_id: shop.public_id,
        public_order_id: order.public_id || "",
      },
    });
  } catch (rzpError) {
    return NextResponse.json(
      { error: rzpError instanceof Error ? rzpError.message : "Could not create payment gateway order." },
      { status: 502 },
    );
  }

  const effectiveIdempotencyKey = idempotencyKey || crypto.randomUUID();

  // 7. Store / update payment record
  let paymentId: string;
  if (existingPayment) {
    const { data: updatedPayment, error: updateError } = await adminClient
      .from("payments")
      .update({
        provider: "razorpay",
        provider_order_id: razorpayOrder.id,
        provider_payment_id: null,
        provider_signature: null,
        status: "created",
        amount: authoritativeTotal,
        currency: "INR",
        idempotency_key: effectiveIdempotencyKey,
        error_code: null,
        error_description: null,
        metadata: {
          razorpay_order_id: razorpayOrder.id,
          receipt: razorpayOrder.receipt,
          notes: razorpayOrder.notes,
        },
      })
      .eq("id", existingPayment.id)
      .select("id")
      .single();

    if (updateError || !updatedPayment) {
      return NextResponse.json({ error: "Failed to update payment record." }, { status: 500 });
    }
    paymentId = updatedPayment.id;
  } else {
    const { data: newPayment, error: insertError } = await adminClient
      .from("payments")
      .insert({
        order_id: order.id,
        customer_id: order.customer_id,
        provider: "razorpay",
        provider_order_id: razorpayOrder.id,
        status: "created",
        amount: authoritativeTotal,
        currency: "INR",
        idempotency_key: effectiveIdempotencyKey,
        metadata: {
          razorpay_order_id: razorpayOrder.id,
          receipt: razorpayOrder.receipt,
          notes: razorpayOrder.notes,
        },
      })
      .select("id")
      .single();

    if (insertError || !newPayment) {
      return NextResponse.json({ error: "Failed to create payment record." }, { status: 500 });
    }
    paymentId = newPayment.id;
  }

  // 8. Record transaction history
  await adminClient.from("payment_transactions").insert({
    payment_id: paymentId,
    order_id: order.id,
    provider: "razorpay",
    provider_order_id: razorpayOrder.id,
    event_type: "order_created",
    status: "created",
    amount: authoritativeTotal,
    currency: "INR",
    raw_payload: razorpayOrder,
  });

  return NextResponse.json({
    success: true,
    orderId: order.id,
    publicOrderId: order.public_id,
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount, // in paise
    amountRupees: authoritativeTotal,
    currency: "INR",
    keyId: razorpayConfig.keyId,
    isTestMode: razorpayConfig.isTestMode,
  });
}
