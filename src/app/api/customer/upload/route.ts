import { NextResponse } from "next/server";
import { normalizeDocument } from "@/lib/normalize-document";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createGuestOrderToken } from "@/lib/guest-order";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload request format. Please choose your files and try again." }, { status: 400 });
  }
  const shopIdentifier = z.string().min(1).safeParse(form.get("shopIdentifier"));
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (!shopIdentifier.success || !files.length)
    return NextResponse.json({ error: "Select at least one document." }, { status: 400 });
  if (files.length > 10)
    return NextResponse.json({ error: "You can add up to 10 documents per order." }, { status: 400 });
  const client = createSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Secure document storage is not configured." }, { status: 503 });
  const { data: shop } = await client
    .from("shops")
    .select("id, name, is_active")
    .eq("public_id", shopIdentifier.data)
    .maybeSingle();
  const { data: settings } = await client
    .from("shop_settings")
    .select("accepting_orders, max_upload_size_bytes")
    .eq("shop_id", shop?.id ?? "")
    .maybeSingle();
  const { data: subscription } = await client
    .from("subscriptions")
    .select("status, trial_end")
    .eq("shop_id", shop?.id ?? "")
    .maybeSingle();
  const trialExpired =
    subscription?.status === "trial" && subscription.trial_end && new Date(subscription.trial_end) <= new Date();
  const acceptingOrders = settings?.accepting_orders !== false;
  const isActive = shop?.is_active !== false;
  if (!shop || !isActive || !acceptingOrders || trialExpired || !subscription || !["trial", "active"].includes(subscription.status))
    return NextResponse.json({ error: "This shop is not accepting orders." }, { status: 409 });
  const maxSize = Number(settings?.max_upload_size_bytes || 26214400);
  for (const file of files) {
    if (file.size < 1 || file.size > maxSize)
      return NextResponse.json({ error: `${file.name} exceeds the shop upload limit.` }, { status: 400 });
  }

  if (files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024)
    return NextResponse.json({ error: "Combined upload size must be under 100 MB." }, { status: 400 });
  const normalized = [];
  try { for (const file of files) normalized.push(await normalizeDocument(file)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Document conversion failed." }, { status: 400 }); }

  let customerId: string | null = null;
  const serverClient = await createSupabaseServerClient();
  if (serverClient) {
    const {
      data: { user },
    } = await serverClient.auth.getUser();
    if (user) {
      customerId = user.id;
    }
  }

  const orderIdempotency = crypto.randomUUID();
  const guestToken = createGuestOrderToken();
  const { data: order, error: orderError } = await client
    .from("orders")
    .insert({
      shop_id: shop.id,
      customer_id: customerId,
      idempotency_key: orderIdempotency,
      guest_access_token_hash: guestToken.hash,
      status: "draft",
    })
    .select("id, public_id")
    .single();
  if (orderError || !order) return NextResponse.json({ error: "Could not create the order." }, { status: 500 });
  const documents: Array<{ id: string; filename: string; pageCount: number; sizeBytes: number }> = [];
  const storedPaths: string[] = [];
  const rollback = async () => {
    if (storedPaths.length) await client.storage.from("print-documents").remove(storedPaths);
    await client.from("orders").delete().eq("id", order.id);
  };
  for (const document of normalized) {
    const documentId = crypto.randomUUID();
    const { bytes, pageCount } = document;
    const storagePath = `shops/${shop.id}/orders/${order.id}/documents/${documentId}/source.pdf`;
    const { error: uploadError } = await client.storage
      .from("print-documents")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) { await rollback(); return NextResponse.json({ error: "Could not securely store the document." }, { status: 500 }); }
    storedPaths.push(storagePath);
    const { error: documentError } = await client.from("documents").insert({
      id: documentId,
      shop_id: shop.id,
      order_id: order.id,
      customer_id: customerId,
      storage_path: storagePath,
      original_filename: document.filename,
      mime_type: "application/pdf",
      size_bytes: bytes.length,
      page_count: pageCount,
      processing_status: "ready",
      normalized_storage_path: storagePath,
      normalized_mime_type: "application/pdf",
    });
    if (documentError) { await rollback(); return NextResponse.json({ error: "Could not register the document." }, { status: 500 }); }
    documents.push({ id: documentId, filename: document.filename, pageCount, sizeBytes: bytes.length });
  }
  return NextResponse.json({
    orderId: order.id,
    orderPublicId: order.public_id,
    accessToken: guestToken.token,
    documents,
  });
}
