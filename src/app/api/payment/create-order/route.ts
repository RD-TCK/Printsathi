import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hashGuestOrderToken } from "@/lib/guest-order";
import { assertShopCanPrice, calculatePricing, type PricingRule } from "@/lib/pricing-engine";
import { createRazorpayOrder, getRazorpayClient, toPaise } from "@/lib/razorpay/server";
import type { PrintRange } from "@/lib/customer-print";

const createPaymentOrderSchema = z.object({
  orderId: z.string().uuid(),
  shopIdentifier: z.string().min(1),
  accessToken: z.string().min(10).optional(),
  idempotencyKey: z.string().optional(),
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

  const { orderId, shopIdentifier, accessToken, idempotencyKey } = parsed.data;

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
    adminClient.from("shop_settings").select("accepting_orders").eq("shop_id", shop.id).maybeSingle(),
    adminClient.from("subscriptions").select("status, trial_end").eq("shop_id", shop.id).maybeSingle(),
  ]);

  const subscriptionStatus =
    subscription?.status === "trial" && subscription.trial_end && new Date(subscription.trial_end) <= new Date()
      ? "expired"
      : (subscription?.status ?? "expired");

  try {
    assertShopCanPrice({
      isActive: shop.is_active,
      acceptingOrders: settings?.accepting_orders === true,
      subscriptionStatus,
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

  // 3. Check order status — never re-charge an already paid or completed order
  if (order.status === "paid" || order.status === "completed" || order.status === "printing") {
    return NextResponse.json(
      { error: "This order has already been paid for.", status: order.status, alreadyPaid: true },
      { status: 409 },
    );
  }

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

  let authoritativePricing;
  try {
    authoritativePricing = calculatePricing(
      ranges,
      rules.map((r) => ({ ...r, price_per_page: Number(r.price_per_page), is_active: true })) as PricingRule[],
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

  const razorpayConfig = getRazorpayClient();
  if (!razorpayConfig) {
    // If Razorpay keys are not set, process in instant test mode for development/demo
    await adminClient
      .from("orders")
      .update({
        status: "paid",
        total_amount: authoritativeTotal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await adminClient
      .from("print_jobs")
      .update({ status: "queued" })
      .eq("order_id", order.id);

    await adminClient.from("payments").insert({
      order_id: order.id,
      provider: "test_mode",
      status: "verified",
      amount: authoritativeTotal,
      currency: "INR",
      verified_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      alreadyPaid: true,
      publicOrderId: order.public_id || order.id.slice(0, 8),
      amount: authoritativeTotal,
      currency: "INR",
      isTestMode: true,
    });
  }

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
      (existingPayment.status === "created" || existingPayment.status === "pending") &&
      existingPayment.provider_order_id &&
      Number(existingPayment.amount) === authoritativeTotal &&
      (!idempotencyKey || existingPayment.idempotency_key === idempotencyKey)
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
