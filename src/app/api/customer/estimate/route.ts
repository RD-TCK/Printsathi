import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { configurationSchema, validateRanges } from "@/lib/customer-print";
import { calculatePricing, type PricingRule } from "@/lib/pricing-engine";
import { assertShopCanPrice } from "@/lib/pricing-engine";
import { hashGuestOrderToken } from "@/lib/guest-order";
import { availablePrinters } from "@/lib/printer-availability";

const estimateSchema = z.object({
  shopIdentifier: z.string().min(1),
  accessToken: z.string().min(20),
  configurations: z.array(configurationSchema).min(1).max(10),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid print configuration payload." }, { status: 400 });
  const parsed = estimateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid print configuration." }, { status: 400 });
  const client = createSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Pricing service is not configured." }, { status: 503 });
  const { data: shop } = await client
    .from("shops")
    .select("id")
    .eq("public_id", parsed.data.shopIdentifier)
    .eq("is_active", true)
    .maybeSingle();
  if (!shop) return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  const [{ data: settings }, { data: subscription }] = await Promise.all([
    client.from("shop_settings").select("accepting_orders, billing_mode").eq("shop_id", shop.id).maybeSingle(),
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

  const [{ data: agents }, { data: printers }] = await Promise.all([
    client
      .from("desktop_agents")
      .select("id, last_heartbeat_at, is_revoked")
      .eq("shop_id", shop.id)
      .eq("is_revoked", false)
      .order("last_heartbeat_at", { ascending: false }),
    client
      .from("printers")
      .select("id, name, driver_name, desktop_agent_id, is_online, status, capabilities, last_seen_at")
      .eq("shop_id", shop.id),
  ]);
  const colorPrinterIsOnline = availablePrinters(printers ?? [], agents ?? []).some((printer) =>
    Boolean(printer.capabilities?.colorSupport),
  );
  const { data: documents } = await client
    .from("documents")
    .select("id, order_id, page_count")
    .eq("shop_id", shop.id)
    .in(
      "id",
      parsed.data.configurations.map((item) => item.documentId),
    );
  const documentMap = new Map((documents ?? []).map((document) => [document.id, document]));
  const orderIds = [...new Set(parsed.data.configurations.map((configuration) => configuration.orderId))];
  const { data: ownedOrders } = await client
    .from("orders")
    .select("id")
    .eq("shop_id", shop.id)
    .eq("guest_access_token_hash", hashGuestOrderToken(parsed.data.accessToken))
    .in("id", orderIds);
  if (ownedOrders?.length !== orderIds.length)
    return NextResponse.json({ error: "Order access could not be verified." }, { status: 403 });
  const { data: rules } = await client
    .from("pricing_rules")
    .select("color_mode, paper_size, min_pages, max_pages, price_per_page")
    .eq("shop_id", shop.id)
    .eq("is_active", true);
  if (!rules?.length)
    return NextResponse.json({ error: "This shop has not configured printing prices yet." }, { status: 409 });
  const allRanges = [];
  for (const configuration of parsed.data.configurations) {
    const document = documentMap.get(configuration.documentId);
    if (!document || document.order_id !== configuration.orderId)
      return NextResponse.json({ error: "Document does not belong to this order." }, { status: 400 });
    const rangeError = validateRanges(configuration.ranges, document.page_count);
    if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 });
    allRanges.push(...configuration.ranges);
  }
  if (allRanges.some((range) => range.colorMode === "color") && !colorPrinterIsOnline) {
    return NextResponse.json(
      { error: "No color printer is currently connected at this shop. Please select Black & White printing." },
      { status: 409 },
    );
  }
  try {
    const billingMode = (settings?.billing_mode as "customer_fee" | "shop_subscription") || "customer_fee";
    const pricing = calculatePricing(
      allRanges,
      rules.map((rule) => ({ ...rule, price_per_page: Number(rule.price_per_page), is_active: true })) as PricingRule[],
      billingMode,
    );
    return NextResponse.json({ ...pricing, totalPages: pricing.colorPages + pricing.blackAndWhitePages });
  } catch (pricingError) {
    return NextResponse.json(
      { error: pricingError instanceof Error ? pricingError.message : "Could not calculate pricing." },
      { status: 409 },
    );
  }
}
