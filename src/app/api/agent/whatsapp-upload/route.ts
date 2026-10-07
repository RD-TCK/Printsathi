import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { authenticateAgent } from "@/lib/agent/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createGuestOrderToken } from "@/lib/guest-order";
import { normalizeDocument, type NormalizedDocumentResult } from "@/lib/normalize-document";
import { getAppUrl } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized agent." }, { status: 401 });
  }

  const { shop } = auth;
  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("formData parse error:", err);
    return NextResponse.json({ error: "Invalid multipart form data.", details: msg }, { status: 400 });
  }

  const rawFiles = form.getAll("files").filter((value): value is File => value instanceof File);
  const singleFile = form.get("file");
  const files: File[] = rawFiles.length > 0 ? rawFiles : singleFile instanceof File ? [singleFile] : [];

  if (files.length === 0) {
    return NextResponse.json({ error: "No document files provided." }, { status: 400 });
  }

  const customerPhone = (form.get("customerPhone") as string) || null;
  const customerName = (form.get("customerName") as string) || null;

  const client = createSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ error: "Storage service unavailable." }, { status: 503 });
  }

  // Normalize all documents (PDF, Word, or Image) in parallel
  let normalizedDocs: NormalizedDocumentResult[];
  try {
    normalizedDocs = await Promise.all(files.map((file) => normalizeDocument(file)));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Document normalization failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Create unified draft order for all documents
  const orderIdempotency = crypto.randomUUID();
  const guestToken = createGuestOrderToken();
  const { data: newOrder, error: orderError } = await client
    .from("orders")
    .insert({
      shop_id: shop.id,
      idempotency_key: orderIdempotency,
      guest_access_token_hash: guestToken.hash,
      status: "draft",
    })
    .select("id, public_id")
    .single();

  if (orderError || !newOrder) {
    return NextResponse.json({ error: "Could not create the draft order." }, { status: 500 });
  }

  const orderId = newOrder.id;

  const preparedDocs = normalizedDocs.map((doc) => {
    const documentId = crypto.randomUUID();
    const storagePath = `shops/${shop.id}/orders/${orderId}/documents/${documentId}/source.pdf`;
    const previewStoragePath = `shops/${shop.id}/orders/${orderId}/documents/${documentId}/preview.jpg`;
    return {
      id: documentId,
      doc,
      storagePath,
      previewStoragePath,
    };
  });

  const storedPaths: string[] = [];
  try {
    // 1. Upload files and previews to Supabase Storage in parallel
    await Promise.all(
      preparedDocs.map(async ({ storagePath, previewStoragePath, doc }) => {
        const { error: uploadError } = await client.storage
          .from("print-documents")
          .upload(storagePath, doc.bytes, { contentType: "application/pdf", upsert: false });
        if (uploadError) throw new Error("Could not store the document file.");
        storedPaths.push(storagePath);

        if (doc.previewImage) {
          const { error: previewError } = await client.storage
            .from("print-documents")
            .upload(previewStoragePath, doc.previewImage, {
              contentType: doc.previewMime || "image/jpeg",
              upsert: true,
            });
          if (!previewError) {
            storedPaths.push(previewStoragePath);
          }
        }
      }),
    );

    // 2. Batch insert into documents table
    const documentsToInsert = preparedDocs.map(({ id, storagePath, doc }) => ({
      id,
      shop_id: shop.id,
      order_id: orderId,
      storage_path: storagePath,
      original_filename: doc.filename,
      mime_type: "application/pdf",
      size_bytes: doc.bytes.length,
      page_count: doc.pageCount,
      processing_status: "ready",
      normalized_storage_path: storagePath,
      normalized_mime_type: "application/pdf",
    }));

    const { error: docInsertError } = await client.from("documents").insert(documentsToInsert);
    if (docInsertError) {
      throw new Error("Could not register document records.");
    }
  } catch (err) {
    if (storedPaths.length) {
      await client.storage.from("print-documents").remove(storedPaths);
    }
    await client.from("orders").delete().eq("id", orderId);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to store document batch." },
      { status: 500 },
    );
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const requestOrigin = host && !host.includes("0.0.0.0") ? `${proto}://${host}` : "";
  const baseUrl = requestOrigin || getAppUrl();
  const configUrl = `${baseUrl}/shop/${shop.public_id}?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(guestToken.token)}`;

  const returnDocuments = preparedDocs.map(({ id, doc }) => ({
    id,
    filename: doc.filename,
    pageCount: doc.pageCount,
    sizeBytes: doc.bytes.length,
  }));

  return NextResponse.json({
    orderId,
    orderPublicId: newOrder.public_id,
    accessToken: guestToken.token,
    shopSlug: shop.public_id,
    configUrl,
    customerPhone,
    customerName,
    documents: returnDocuments,
    // Backward compatibility for single file callers
    document: returnDocuments[0],
  });
}
