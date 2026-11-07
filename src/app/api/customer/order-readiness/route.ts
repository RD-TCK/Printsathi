import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashGuestOrderToken } from "@/lib/guest-order";
import { areOrderDocumentsPrecached, getPrecachedDocumentsCount } from "@/lib/order-readiness-tracker";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId")?.trim();
  const accessToken = searchParams.get("accessToken")?.trim();

  if (!orderId || !accessToken) {
    return NextResponse.json({ error: "Missing orderId or accessToken." }, { status: 400 });
  }

  const client = createSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ error: "Database service unavailable." }, { status: 503 });
  }

  // 1. Verify access
  const tokenHash = hashGuestOrderToken(accessToken);
  const { data: order, error: orderError } = await client
    .from("orders")
    .select(
      "id, public_id, shop_id, status, token_number, expires_at, total_amount, total_pages, color_pages, black_and_white_pages, created_at, guest_access_token_hash",
    )
    .eq("id", orderId)
    .eq("guest_access_token_hash", tokenHash)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order access could not be verified." }, { status: 403 });
  }

  // 2. Fetch order documents
  const { data: documents, error: docsError } = await client
    .from("documents")
    .select("id, original_filename, page_count, processing_status, storage_path")
    .eq("order_id", orderId);

  if (docsError || !documents || documents.length === 0) {
    return NextResponse.json({
      ready: false,
      step: "validating",
      message: "Verifying document records...",
      tokenDetails: null,
    });
  }

  // Check document conversion / preparation status
  const allDocsReady = documents.every(
    (doc) => doc.processing_status === "ready" && doc.page_count > 0 && Boolean(doc.storage_path),
  );
  if (!allDocsReady) {
    return NextResponse.json({
      ready: false,
      step: "converting",
      message: "Converting and formatting documents for print...",
      tokenDetails: null,
    });
  }

  // 3. Verify print jobs
  const { data: printJobs, error: jobsError } = await client
    .from("print_jobs")
    .select("id, status, document_id")
    .eq("order_id", orderId);

  if (jobsError || !printJobs || printJobs.length === 0) {
    return NextResponse.json({
      ready: false,
      step: "validating",
      message: "Configuring printer page ranges...",
      tokenDetails: null,
    });
  }

  // 4. Token assigned check
  if (!order.token_number || order.token_number <= 0) {
    return NextResponse.json({
      ready: false,
      step: "validating",
      message: "Assigning counter queue position...",
      tokenDetails: null,
    });
  }

  // 5. Check if active desktop agent exists for this shop
  const cutoff = new Date(Date.now() - 65 * 1000).toISOString();
  const { data: activeAgent } = await client
    .from("desktop_agents")
    .select("id, status, last_heartbeat_at")
    .eq("shop_id", order.shop_id)
    .eq("status", "online")
    .gte("last_heartbeat_at", cutoff)
    .limit(1)
    .maybeSingle();

  const docIds = documents.map((d) => d.id);
  const orderAgeMs = Date.now() - new Date(order.created_at).getTime();

  let isAgentPrecached = true;
  if (activeAgent) {
    isAgentPrecached = areOrderDocumentsPrecached(order.id, docIds);
    // If not yet precached, allow up to 8s before fallback to avoid indefinitely blocking user
    if (!isAgentPrecached && orderAgeMs < 8000) {
      const cachedCount = getPrecachedDocumentsCount(order.id);
      return NextResponse.json({
        ready: false,
        step: "precaching",
        message: `Pre-caching print documents into shop print engine (${cachedCount}/${docIds.length})...`,
        precachedCount: cachedCount,
        totalDocuments: docIds.length,
        tokenDetails: null,
      });
    }
  }

  // 6. Everything is 100% DONE! Reveal the token number.
  return NextResponse.json({
    ready: true,
    step: "ready",
    message: "All processes complete. Ready for instant printing.",
    tokenDetails: {
      tokenNumber: order.token_number,
      publicOrderId: order.public_id,
      orderId: order.id,
      expiresAt: order.expires_at || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      totalAmount: Number(order.total_amount) || 0,
      totalPages: order.total_pages || 0,
      colorPages: order.color_pages || 0,
      blackAndWhitePages: order.black_and_white_pages || 0,
      documentNames: documents.map((d) => d.original_filename),
    },
  });
}
