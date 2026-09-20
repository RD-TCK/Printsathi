import { effectiveBillingMode } from "@/lib/subscription";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { configurationSchema, validateRanges } from "@/lib/customer-print";
import { calculatePricing, type PricingRule } from "@/lib/pricing-engine";
import { assertShopCanPrice } from "@/lib/pricing-engine";
import { hashGuestOrderToken } from "@/lib/guest-order";

export const dynamic = "force-dynamic";

const counterOrderSchema = z.object({
  shopIdentifier: z.string().min(1),
  accessToken: z.string().min(20),
  configurations: z.array(configurationSchema).min(1).max(10),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid counter order payload." }, { status: 400 });

  const parsed = counterOrderSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid order configuration." }, { status: 400 });

  const client = createSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Order service is not configured." }, { status: 503 });

  // 1. Fetch shop and check status
  const { data: shop } = await client
    .from("shops")
    .select("id, name, public_id")
    .eq("public_id", parsed.data.shopIdentifier)
    .eq("is_active", true)
    .maybeSingle();

  if (!shop) return NextResponse.json({ error: "Shop not found." }, { status: 404 });

  const [{ data: settings }, { data: subscription }] = await Promise.all([
    client.from("shop_settings").select("accepting_orders, billing_mode, payment_mode").eq("shop_id", shop.id).maybeSingle(),
    client.from("subscriptions").select("status, trial_end, current_period_end").eq("shop_id", shop.id).maybeSingle(),
  ]);

  if (settings?.payment_mode === "online") {
    return NextResponse.json(
      { error: "This shop only accepts online payments at this time." },
      { status: 409 }
    );
  }

  const billingMode = effectiveBillingMode(settings?.billing_mode, subscription);
  try {
    assertShopCanPrice({ isActive: true, acceptingOrders: settings?.accepting_orders === true });
  } catch (eligibilityError) {
    return NextResponse.json(
      { error: eligibilityError instanceof Error ? eligibilityError.message : "Shop is unavailable." },
      { status: 409 }
    );
  }

  // 2. Validate order access
  const orderId = parsed.data.configurations[0].orderId;
  const { data: tokenOrder } = await client
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("shop_id", shop.id)
    .eq("guest_access_token_hash", hashGuestOrderToken(parsed.data.accessToken))
    .maybeSingle();

  if (!tokenOrder) return NextResponse.json({ error: "Order access could not be verified." }, { status: 403 });

  const { data: order } = await client
    .from("orders")
    .select("id, public_id, shop_id, customer_id, status")
    .eq("id", orderId)
    .eq("shop_id", shop.id)
    .maybeSingle();

  if (!order || !["draft", "awaiting_payment"].includes(order.status)) {
    return NextResponse.json({ error: "Order is no longer configurable." }, { status: 409 });
  }

  // 3. Validate documents and pricing
  const { data: documents } = await client
    .from("documents")
    .select("id, order_id, page_count, original_filename")
    .eq("order_id", orderId)
    .eq("shop_id", shop.id);

  const documentMap = new Map((documents ?? []).map((doc) => [doc.id, doc]));
  const { data: rules } = await client
    .from("pricing_rules")
    .select("color_mode, paper_size, min_pages, max_pages, price_per_page")
    .eq("shop_id", shop.id)
    .eq("is_active", true);

  if (!rules?.length) {
    return NextResponse.json({ error: "This shop has not configured printing prices yet." }, { status: 409 });
  }

  const allRanges = parsed.data.configurations.flatMap((c) => c.ranges);

  let pricing;
  try {
    pricing = calculatePricing(
      allRanges,
      rules.map((rule) => ({ ...rule, price_per_page: Number(rule.price_per_page), is_active: true })) as PricingRule[],
      billingMode
    );
  } catch (pricingError) {
    return NextResponse.json(
      { error: pricingError instanceof Error ? pricingError.message : "Could not calculate pricing." },
      { status: 409 }
    );
  }

  if (new Set(parsed.data.configurations.map((c) => c.documentId)).size !== parsed.data.configurations.length) {
    return NextResponse.json({ error: "A document cannot be configured more than once." }, { status: 400 });
  }

  for (const configuration of parsed.data.configurations) {
    const document = documentMap.get(configuration.documentId);
    if (configuration.orderId !== orderId || !document || validateRanges(configuration.ranges, document.page_count)) {
      return NextResponse.json({ error: "Invalid document or page ranges." }, { status: 400 });
    }
  }

  // 4. Generate sequential token number for this shop (reuse existing if re-configuring, else assign next max)
  let tokenNumber = 1;
  const { data: currentOrderData } = await client
    .from("orders")
    .select("token_number")
    .eq("id", orderId)
    .maybeSingle();

  if (currentOrderData?.token_number && currentOrderData.token_number > 0) {
    tokenNumber = currentOrderData.token_number;
  } else {
    const { data: generatedToken, error: tokenError } = await client.rpc("generate_counter_token", {
      p_shop_id: shop.id,
    });

    if (!tokenError && typeof generatedToken === "number" && generatedToken > 0) {
      tokenNumber = generatedToken;
    } else {
      // Daily Fallback (IST Midnight reset): query highest token created today
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffset);
      const istStartOfDay = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 0, 0, 0) - istOffset);

      const { data: existingTokens } = await client
        .from("orders")
        .select("token_number")
        .eq("shop_id", shop.id)
        .eq("payment_mode", "counter")
        .gte("created_at", istStartOfDay.toISOString())
        .not("token_number", "is", null)
        .order("token_number", { ascending: false })
        .limit(1);

      if (existingTokens && existingTokens.length > 0 && typeof existingTokens[0].token_number === "number") {
        tokenNumber = existingTokens[0].token_number + 1;
      }
    }
  }

  // 5. Replace draft print jobs
  await client.from("print_jobs").delete().eq("order_id", orderId);

  for (const configuration of parsed.data.configurations) {
    const document = documentMap.get(configuration.documentId);
    if (!document || document.order_id !== orderId) continue;

    const jobId = crypto.randomUUID();
    await client.from("print_jobs").insert({
      id: jobId,
      order_id: orderId,
      shop_id: shop.id,
      customer_id: order.customer_id,
      document_id: document.id,
      status: "awaiting_payment",
      total_pages: document.page_count,
      total_amount: Number(
        calculatePricing(
          configuration.ranges,
          rules.map((rule) => ({
            ...rule,
            price_per_page: Number(rule.price_per_page),
            is_active: true,
          })) as PricingRule[],
          billingMode
        ).total.toFixed(2)
      ),
      idempotency_key: crypto.randomUUID(),
    });

    await client.from("print_job_pages").insert(
      configuration.ranges.map((range) => ({
        print_job_id: jobId,
        start_page: range.startPage,
        end_page: range.endPage,
        color_mode: range.colorMode,
        paper_size: range.paperSize,
      }))
    );
  }

  // 6. Update order with 1-hour expiry and token number
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour validity
  const { error: orderUpdateError } = await client
    .from("orders")
    .update({
      status: "awaiting_payment",
      payment_mode: "counter",
      token_number: tokenNumber,
      expires_at: expiresAt,
      total_amount: pricing.total,
      total_pages: pricing.colorPages + pricing.blackAndWhitePages,
      color_pages: pricing.colorPages,
      black_and_white_pages: pricing.blackAndWhitePages,
      pricing_snapshot: pricing.pricingRuleSnapshot,
      pricing_calculated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("shop_id", shop.id);

  if (orderUpdateError) {
    return NextResponse.json({ error: "Could not finalize counter order." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    orderId,
    publicOrderId: order.public_id,
    tokenNumber,
    expiresAt,
    totalAmount: pricing.total,
    totalPages: pricing.colorPages + pricing.blackAndWhitePages,
    colorPages: pricing.colorPages,
    blackAndWhitePages: pricing.blackAndWhitePages,
  });
}
