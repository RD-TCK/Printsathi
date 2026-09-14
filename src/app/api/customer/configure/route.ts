import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { configurationSchema, validateRanges } from "@/lib/customer-print";
import { calculatePricing, type PricingRule } from "@/lib/pricing-engine";
import { assertShopCanPrice } from "@/lib/pricing-engine";
import { hashGuestOrderToken } from "@/lib/guest-order";

const configureSchema = z.object({
  shopIdentifier: z.string().min(1),
  accessToken: z.string().min(20),
  configurations: z.array(configurationSchema).min(1).max(10),
  selectedPrinterId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid order configuration payload." }, { status: 400 });
  const parsed = configureSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid order configuration." }, { status: 400 });
  const client = createSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Order service is not configured." }, { status: 503 });
  const { data: shop } = await client
    .from("shops")
    .select("id")
    .eq("public_id", parsed.data.shopIdentifier)
    .eq("is_active", true)
    .maybeSingle();
  if (!shop) return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  const [{ data: settings }, { data: subscription }] = await Promise.all([
    client.from("shop_settings").select("accepting_orders").eq("shop_id", shop.id).maybeSingle(),
    client.from("subscriptions").select("status, trial_end").eq("shop_id", shop.id).maybeSingle(),
  ]);
  const subscriptionStatus =
    subscription?.status === "trial" && subscription.trial_end && new Date(subscription.trial_end) <= new Date()
      ? "expired"
      : (subscription?.status ?? "expired");
  try {
    assertShopCanPrice({ isActive: true, acceptingOrders: settings?.accepting_orders === true, subscriptionStatus });
  } catch (eligibilityError) {
    return NextResponse.json(
      { error: eligibilityError instanceof Error ? eligibilityError.message : "Shop is unavailable." },
      { status: 409 },
    );
  }

  // Verify shop owner printer connectivity & online printers
  const [{ data: agents }, { data: printers }] = await Promise.all([
    client
      .from("desktop_agents")
      .select("id, last_heartbeat_at")
      .eq("shop_id", shop.id)
      .eq("is_revoked", false)
      .order("last_heartbeat_at", { ascending: false })
      .limit(1),
    client.from("printers").select("id, name, is_online, status, capabilities").eq("shop_id", shop.id),
  ]);

  const activeAgent = agents?.[0];
  const isAgentOnline =
    activeAgent &&
    activeAgent.last_heartbeat_at &&
    Date.now() - new Date(activeAgent.last_heartbeat_at).getTime() < 120000;

  const onlinePrinters = (printers ?? []).filter(
    (p) => isAgentOnline && (p.is_online || p.status === "online" || p.status === "printing"),
  );

  // Validate selected printer if one was specified
  const selectedPrinterId = parsed.data.selectedPrinterId;
  if (selectedPrinterId) {
    const printerExists = (printers ?? []).some((p) => p.id === selectedPrinterId);
    if (!printerExists) {
      return NextResponse.json(
        { error: "Selected printer not found at this shop." },
        { status: 404 },
      );
    }
  }
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
    .select("id, shop_id, customer_id, status")
    .eq("id", orderId)
    .eq("shop_id", shop.id)
    .maybeSingle();
  if (!order || !["draft", "awaiting_payment"].includes(order.status))
    return NextResponse.json({ error: "Order is no longer configurable." }, { status: 409 });
  const { data: documents } = await client
    .from("documents")
    .select("id, order_id, page_count")
    .eq("order_id", orderId)
    .eq("shop_id", shop.id);
  const documentMap = new Map((documents ?? []).map((document) => [document.id, document]));
  const { data: rules } = await client
    .from("pricing_rules")
    .select("color_mode, paper_size, min_pages, max_pages, price_per_page")
    .eq("shop_id", shop.id)
    .eq("is_active", true);
  if (!rules?.length)
    return NextResponse.json({ error: "This shop has not configured printing prices yet." }, { status: 409 });
  const allRanges = parsed.data.configurations.flatMap((configuration) => configuration.ranges);
  const requestsColor = allRanges.some((r) => r.colorMode === "color");
  if (requestsColor && onlinePrinters.length > 0) {
    const hasColorPrinter = onlinePrinters.some((p) => Boolean((p.capabilities as any)?.colorSupport));
    if (!hasColorPrinter) {
      return NextResponse.json(
        { error: "No color printer is currently online at this shop. Please select Black & White printing." },
        { status: 409 },
      );
    }
  }
  let pricing;
  try {
    pricing = calculatePricing(
      allRanges,
      rules.map((rule) => ({ ...rule, price_per_page: Number(rule.price_per_page), is_active: true })) as PricingRule[],
    );
  } catch (pricingError) {
    return NextResponse.json(
      { error: pricingError instanceof Error ? pricingError.message : "Could not calculate pricing." },
      { status: 409 },
    );
  }
  await client.from("print_jobs").delete().eq("order_id", orderId);
  for (const configuration of parsed.data.configurations) {
    const document = documentMap.get(configuration.documentId);
    if (!document || document.order_id !== orderId)
      return NextResponse.json({ error: "Document does not belong to this order." }, { status: 400 });
    const rangeError = validateRanges(configuration.ranges, document.page_count);
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });
    const jobId = crypto.randomUUID();
    const { error: jobError } = await client.from("print_jobs").insert({
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
        ).total.toFixed(2),
      ),
      idempotency_key: crypto.randomUUID(),
      ...(selectedPrinterId ? { printer_id: selectedPrinterId } : {}),
    });
    if (jobError) return NextResponse.json({ error: "Could not save print configuration." }, { status: 500 });
    const { error: pagesError } = await client.from("print_job_pages").insert(
      configuration.ranges.map((range) => ({
        print_job_id: jobId,
        start_page: range.startPage,
        end_page: range.endPage,
        color_mode: range.colorMode,
        paper_size: range.paperSize,
      })),
    );
    if (pagesError) return NextResponse.json({ error: "Could not save page ranges." }, { status: 500 });
  }
  const { error: orderError } = await client
    .from("orders")
    .update({
      status: "awaiting_payment",
      total_amount: pricing.total,
      total_pages: pricing.colorPages + pricing.blackAndWhitePages,
      color_pages: pricing.colorPages,
      black_and_white_pages: pricing.blackAndWhitePages,
      pricing_snapshot: pricing.pricingRuleSnapshot,
      pricing_calculated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("shop_id", shop.id);
  if (orderError) return NextResponse.json({ error: "Could not save order totals." }, { status: 500 });
  return NextResponse.json({ orderId, status: "awaiting_payment" });
}
