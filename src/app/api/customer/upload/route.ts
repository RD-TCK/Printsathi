import { NextResponse } from "next/server";
import { normalizeDocument } from "@/lib/normalize-document";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createGuestOrderToken, hashGuestOrderToken } from "@/lib/guest-order";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload request format. Please choose your files and try again." }, { status: 400 });
  }
  const shopIdentifier = z.string().min(1).safeParse(form.get("shopIdentifier"));
  const existingOrderId = z.string().uuid().optional().safeParse(form.get("orderId") || undefined);
  const existingAccessToken = z.string().min(10).optional().safeParse(form.get("accessToken") || undefined);
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
  const acceptingOrders = settings?.accepting_orders !== false;
  const isActive = shop?.is_active !== false;
  if (!shop || !isActive || !acceptingOrders)
    return NextResponse.json({ error: "This shop is not accepting orders." }, { status: 409 });
  const maxSize = Number(settings?.max_upload_size_bytes || 26214400);
  for (const file of files) {
    if (file.size < 1 || file.size > maxSize)
      return NextResponse.json({ error: `${file.name} exceeds the shop upload limit.` }, { status: 400 });
  }

  if (files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024)
    return NextResponse.json({ error: "Combined upload size must be under 100 MB." }, { status: 400 });
  
  let normalized: Array<{ bytes: Buffer; pageCount: number; filename: string }>;
  try {
    normalized = await Promise.all(files.map((file) => normalizeDocument(file)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Document conversion failed." }, { status: 400 });
  }

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

  let orderId: string;
  let orderPublicId: string;
  let returnAccessToken: string;
  let isNewOrder = false;

  if (existingOrderId.success && existingOrderId.data && existingAccessToken.success && existingAccessToken.data) {
    const tokenHash = hashGuestOrderToken(existingAccessToken.data);
    const { data: existingOrder } = await client
      .from("orders")
      .select("id, public_id, status")
      .eq("id", existingOrderId.data)
      .eq("shop_id", shop.id)
      .eq("guest_access_token_hash", tokenHash)
      .maybeSingle();

    if (existingOrder && existingOrder.status === "draft") {
      orderId = existingOrder.id;
      orderPublicId = existingOrder.public_id;
      returnAccessToken = existingAccessToken.data;
    } else {
      isNewOrder = true;
      const orderIdempotency = crypto.randomUUID();
      const guestToken = createGuestOrderToken();
      const { data: newOrder, error: orderError } = await client
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
      if (orderError || !newOrder) return NextResponse.json({ error: "Could not create the order." }, { status: 500 });
      orderId = newOrder.id;
      orderPublicId = newOrder.public_id;
      returnAccessToken = guestToken.token;
    }
  } else {
    isNewOrder = true;
    const orderIdempotency = crypto.randomUUID();
    const guestToken = createGuestOrderToken();
    const { data: newOrder, error: orderError } = await client
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
    if (orderError || !newOrder) return NextResponse.json({ error: "Could not create the order." }, { status: 500 });
    orderId = newOrder.id;
    orderPublicId = newOrder.public_id;
    returnAccessToken = guestToken.token;
  }

  const storedPaths: string[] = [];
  const rollback = async () => {
    if (storedPaths.length) await client.storage.from("print-documents").remove(storedPaths);
    if (isNewOrder) {
      await client.from("orders").delete().eq("id", orderId);
    }
  };

  try {
    const preparedDocs = normalized.map((doc) => {
      const documentId = crypto.randomUUID();
      const storagePath = `shops/${shop.id}/orders/${orderId}/documents/${documentId}/source.pdf`;
      return {
        id: documentId,
        doc,
        storagePath,
      };
    });

    // 1. Upload files to storage in parallel
    await Promise.all(
      preparedDocs.map(async ({ storagePath, doc }) => {
        const { error: uploadError } = await client.storage
          .from("print-documents")
          .upload(storagePath, doc.bytes, { contentType: "application/pdf", upsert: false });
        if (uploadError) throw new Error("Could not securely store the document.");
        storedPaths.push(storagePath);
      }),
    );

    // 2. Batch insert all documents in a single round-trip query instead of N serial/parallel queries
    const documentsToInsert = preparedDocs.map(({ id, storagePath, doc }) => ({
      id,
      shop_id: shop.id,
      order_id: orderId,
      customer_id: customerId,
      storage_path: storagePath,
      original_filename: doc.filename,
      mime_type: "application/pdf",
      size_bytes: doc.bytes.length,
      page_count: doc.pageCount,
      processing_status: "ready",
      normalized_storage_path: storagePath,
      normalized_mime_type: "application/pdf",
    }));

    const { error: batchInsertError } = await client.from("documents").insert(documentsToInsert);
    if (batchInsertError) throw new Error("Could not register the documents.");

    const documents = preparedDocs.map(({ id, doc }) => ({
      id,
      filename: doc.filename,
      pageCount: doc.pageCount,
      sizeBytes: doc.bytes.length,
    }));

    return NextResponse.json(
      {
        orderId,
        orderPublicId,
        accessToken: returnAccessToken,
        documents,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    await rollback();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload documents." },
      { status: 500 },
    );
  }
}
