import { effectiveBillingMode } from "@/lib/subscription";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { configurationSchema, validateRanges } from "@/lib/customer-print";
import { calculatePricing, type PricingRule } from "@/lib/pricing-engine";
import { assertShopCanPrice } from "@/lib/pricing-engine";
import { hashGuestOrderToken } from "@/lib/guest-order";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    client
      .from("shop_settings")
      .select("accepting_orders, billing_mode, payment_mode, allow_double_sided")
      .eq("shop_id", shop.id)
      .maybeSingle(),
    client.from("subscriptions").select("status, trial_end, current_period_end").eq("shop_id", shop.id).maybeSingle(),
  ]);

  if (settings?.payment_mode === "online") {
    return NextResponse.json({ error: "This shop only accepts online payments at this time." }, { status: 409 });
  }

  const billingMode = effectiveBillingMode(settings?.billing_mode, subscription);
  try {
    assertShopCanPrice({ isActive: true, acceptingOrders: settings?.accepting_orders === true });
  } catch (eligibilityError) {
    return NextResponse.json(
      { error: eligibilityError instanceof Error ? eligibilityError.message : "Shop is unavailable." },
      { status: 409 },
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
    if (order && ["in_queue", "queued", "paid", "printing", "partially_printed", "completed"].includes(order.status)) {
      const { data: fullOrder } = await client
        .from("orders")
        .select("id, public_id, status, token_number, total_amount, total_pages, color_pages, black_and_white_pages, expires_at")
        .eq("id", orderId)
        .eq("shop_id", shop.id)
        .maybeSingle();

      if (fullOrder?.token_number) {
        return NextResponse.json({
          success: true,
          orderId: fullOrder.id,
          publicOrderId: fullOrder.public_id,
          tokenNumber: fullOrder.token_number,
          expiresAt: fullOrder.expires_at || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          totalAmount: fullOrder.total_amount || 0,
          totalPages: fullOrder.total_pages || 0,
          colorPages: fullOrder.color_pages || 0,
          blackAndWhitePages: fullOrder.black_and_white_pages || 0,
          alreadySubmitted: true,
        });
      }
    }
    return NextResponse.json({ error: "Order is no longer configurable." }, { status: 409 });
  }

  // 3. Validate documents and pricing
  const { data: documents } = await client
    .from("documents")
    .select("id, order_id, page_count, original_filename, created_at")
    .eq("order_id", orderId)
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });

  const documentMap = new Map((documents ?? []).map((doc) => [doc.id, doc]));
  const { data: rules } = await client
    .from("pricing_rules")
    .select("color_mode, paper_size, side_mode, min_pages, max_pages, price_per_page")
    .eq("shop_id", shop.id)
    .eq("is_active", true);

  if (!rules?.length) {
    return NextResponse.json({ error: "This shop has not configured printing prices yet." }, { status: 409 });
  }

  const allRanges = parsed.data.configurations.flatMap((c) => c.ranges);
  if (settings?.allow_double_sided === false && allRanges.some((r) => r.sideMode === "double_sided")) {
    return NextResponse.json(
      { error: "This shop currently does not accept double-sided printing." },
      { status: 409 },
    );
  }

  let pricing;
  try {
    pricing = calculatePricing(
      allRanges,
      rules.map((rule) => ({ ...rule, price_per_page: Number(rule.price_per_page), is_active: true })) as PricingRule[],
      billingMode,
    );
  } catch (pricingError) {
    return NextResponse.json(
      { error: pricingError instanceof Error ? pricingError.message : "Could not calculate pricing." },
      { status: 409 },
    );
  }

  if (new Set(parsed.data.configurations.map((c) => c.documentId)).size !== parsed.data.configurations.length) {
    return NextResponse.json({ error: "A document cannot be configured more than once." }, { status: 400 });
  }

  const validationAllocatedDocIds = new Set<string>();
  for (const configuration of parsed.data.configurations) {
    let document = documentMap.get(configuration.documentId);
    if (!document && documents && documents.length > 0) {
      const maxRequestedPage = Math.max(...configuration.ranges.map((r) => r.endPage), 1);
      document =
        documents.find((d) => !validationAllocatedDocIds.has(d.id) && d.page_count >= maxRequestedPage) ||
        documents.find((d) => !validationAllocatedDocIds.has(d.id)) ||
        documents[0];
    }
    if (configuration.orderId !== orderId || !document || validateRanges(configuration.ranges, document.page_count)) {
      return NextResponse.json({ error: "Invalid document or page ranges." }, { status: 400 });
    }
    validationAllocatedDocIds.add(document.id);
  }

  // 4. Generate sequential token number for this shop.
  // If the order already has a token (re-configuration), reuse it so the customer
  // keeps the same position in the queue. Otherwise call the atomic DB function
  // that uses INSERT ... ON CONFLICT DO UPDATE ... RETURNING to guarantee each
  // concurrent submission for the same shop receives a unique value.
  const { data: currentOrderData } = await client.from("orders").select("token_number").eq("id", orderId).maybeSingle();

  let tokenNumber: number;
  if (currentOrderData?.token_number && currentOrderData.token_number > 0) {
    // Re-configuration: keep the existing token number.
    tokenNumber = currentOrderData.token_number;
  } else {
    // New submission: atomically claim the next token via the DB function.
    // generate_counter_token() uses a dedicated counter row with a row-level
    // lock, so concurrent calls are serialised and never produce duplicates.
    const { data: tokenData, error: tokenError } = await client
      .rpc("generate_counter_token", { p_shop_id: shop.id })
      .single();
    if (tokenError || typeof tokenData !== "number") {
      return NextResponse.json({ error: "Could not assign a queue token. Please try again." }, { status: 500 });
    }
    tokenNumber = tokenData as number;
  }

  // 5. Replace draft print jobs
  const { data: existingJobs, error: existingJobsError } = await client.from("print_jobs").select("id").eq("order_id", orderId);
  if (existingJobsError) {
    return NextResponse.json({ error: "Could not inspect previous counter jobs." }, { status: 500 });
  }
  if (existingJobs && existingJobs.length > 0) {
    const jobIds = existingJobs.map((j) => j.id);
    const { error: deletePagesError } = await client.from("print_job_pages").delete().in("print_job_id", jobIds);
    if (deletePagesError) {
      return NextResponse.json({ error: "Could not clear previous page ranges." }, { status: 500 });
    }
  }
  const { error: deleteJobsError } = await client.from("print_jobs").delete().eq("order_id", orderId);
  if (deleteJobsError) {
    return NextResponse.json({ error: "Could not reset draft jobs." }, { status: 500 });
  }

  const normalizedRules = rules.map((rule) => ({
    ...rule,
    price_per_page: Number(rule.price_per_page),
    is_active: true,
  })) as PricingRule[];

  let insertedJobCount = 0;
  const allocatedDocIds = new Set<string>();
  const resolvedJobs: Array<{
    document: NonNullable<typeof documents>[number];
    ranges: (typeof parsed.data.configurations)[number]["ranges"];
    rawCents: number;
    printedPages: number;
    maxCopies: number;
  }> = [];

  for (const configuration of parsed.data.configurations) {
    let document = documentMap.get(configuration.documentId);
    // If exact ID not found (e.g. crop replaced the document ID right before token submit), match by unallocated order document
    if (!document && documents && documents.length > 0) {
      const maxRequestedPage = Math.max(...configuration.ranges.map((r) => r.endPage), 1);
      document =
        documents.find((d) => !allocatedDocIds.has(d.id) && d.page_count >= maxRequestedPage) ||
        documents.find((d) => !allocatedDocIds.has(d.id)) ||
        documents[0];
    }
    if (!document || document.order_id !== orderId) continue;
    allocatedDocIds.add(document.id);

    const printedPages = configuration.ranges.reduce(
      (sum, r) => sum + (r.endPage - r.startPage + 1) * Math.max(1, r.copies ?? 1),
      0,
    );
    const maxCopies = Math.max(1, ...configuration.ranges.map((r) => Math.max(1, r.copies ?? 1)));
    const rawTotal = calculatePricing(configuration.ranges, normalizedRules, billingMode).total;
    resolvedJobs.push({
      document,
      ranges: configuration.ranges,
      rawCents: Math.round((rawTotal + Number.EPSILON) * 100),
      printedPages,
      maxCopies,
    });
  }

  const targetOrderCents = Math.round((pricing.total + Number.EPSILON) * 100);
  const rawTotalCentsSum = resolvedJobs.reduce((sum, item) => sum + item.rawCents, 0);
  let allocatedCents = 0;

  const jobsToInsert: Array<Record<string, unknown>> = [];
  const pagesToInsert: Array<Record<string, unknown>> = [];

  for (let idx = 0; idx < resolvedJobs.length; idx++) {
    const item = resolvedJobs[idx];
    const jobCents =
      idx === resolvedJobs.length - 1
        ? Math.max(0, targetOrderCents - allocatedCents)
        : rawTotalCentsSum > 0
          ? Math.round((targetOrderCents * item.rawCents) / rawTotalCentsSum)
          : Math.round(targetOrderCents / resolvedJobs.length);
    allocatedCents += jobCents;

    const jobId = crypto.randomUUID();
    jobsToInsert.push({
      id: jobId,
      order_id: orderId,
      shop_id: shop.id,
      customer_id: order.customer_id,
      document_id: item.document.id,
      status: "awaiting_payment",
      total_pages: item.printedPages,
      copies: item.maxCopies,
      total_amount: Number((jobCents / 100).toFixed(2)),
      idempotency_key: crypto.randomUUID(),
    });

    for (const range of item.ranges) {
      pagesToInsert.push({
        print_job_id: jobId,
        start_page: range.startPage,
        end_page: range.endPage,
        color_mode: range.colorMode,
        paper_size: range.paperSize,
        side_mode: range.sideMode ?? "single_sided",
        copies: range.copies ?? 1,
      });
    }
    insertedJobCount++;
  }

  if (jobsToInsert.length > 0) {
    const { error: jobInsertError } = await client.from("print_jobs").insert(jobsToInsert);
    if (jobInsertError) {
      return NextResponse.json({ error: "Could not save counter print job." }, { status: 500 });
    }
  }
  if (pagesToInsert.length > 0) {
    const { error: pagesInsertError } = await client.from("print_job_pages").insert(pagesToInsert);
    if (pagesInsertError) {
      return NextResponse.json({ error: "Could not save counter page ranges." }, { status: 500 });
    }
  }

  // Fallback safety: If 0 jobs were inserted but documents exist, create default jobs
  if (insertedJobCount === 0 && documents && documents.length > 0) {
    let fallbackAllocated = 0;
    const fallbackJobsToInsert: Array<Record<string, unknown>> = [];
    const fallbackPagesToInsert: Array<Record<string, unknown>> = [];
    for (let idx = 0; idx < documents.length; idx++) {
      const doc = documents[idx];
      const jobId = crypto.randomUUID();
      const pageCount = doc.page_count || 1;
      const jobCents =
        idx === documents.length - 1
          ? Math.max(0, targetOrderCents - fallbackAllocated)
          : Math.round(targetOrderCents / documents.length);
      fallbackAllocated += jobCents;
      fallbackJobsToInsert.push({
        id: jobId,
        order_id: orderId,
        shop_id: shop.id,
        customer_id: order.customer_id,
        document_id: doc.id,
        status: "awaiting_payment",
        total_pages: pageCount,
        copies: 1,
        total_amount: Number((jobCents / 100).toFixed(2)),
        idempotency_key: crypto.randomUUID(),
      });
      fallbackPagesToInsert.push({
        print_job_id: jobId,
        start_page: 1,
        end_page: pageCount,
        color_mode: (pricing.colorPages || 0) > 0 ? "color" : "black_and_white",
        paper_size: "a4",
        side_mode: "single_sided",
        copies: 1,
      });
    }
    const { error: fallbackJobError } = await client.from("print_jobs").insert(fallbackJobsToInsert);
    if (fallbackJobError) {
      return NextResponse.json({ error: "Could not create fallback counter print job." }, { status: 500 });
    }
    const { error: fallbackPagesError } = await client.from("print_job_pages").insert(fallbackPagesToInsert);
    if (fallbackPagesError) {
      return NextResponse.json({ error: "Could not create fallback counter page ranges." }, { status: 500 });
    }
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
