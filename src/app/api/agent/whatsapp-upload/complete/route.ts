import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeDocument, type NormalizedDocumentResult } from "@/lib/normalize-document";
import { getAppUrl } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized agent." }, { status: 401 });
  }

  const { shop } = auth;
  let body: {
    orderId?: string;
    guestToken?: string;
    customerPhone?: string;
    customerName?: string;
    documents?: Array<{
      id: string;
      filename: string;
      storagePath: string;
      mimetype?: string;
    }>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request payload." }, { status: 400 });
  }

  const { orderId, guestToken, customerPhone, customerName, documents } = body;
  if (!orderId || !guestToken || !Array.isArray(documents) || documents.length === 0) {
    return NextResponse.json({ error: "Missing required order details or documents." }, { status: 400 });
  }

  const client = createSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ error: "Storage service unavailable." }, { status: 503 });
  }

  const { data: existingOrder, error: orderFetchError } = await client
    .from("orders")
    .select("id, public_id, status")
    .eq("id", orderId)
    .eq("shop_id", shop.id)
    .maybeSingle();

  if (orderFetchError || !existingOrder) {
    return NextResponse.json({ error: "Order not found or access denied." }, { status: 404 });
  }

  const storedPaths: string[] = [];
  const cleanupRawPaths: string[] = [];

  try {
    const processedDocuments: Array<{
      id: string;
      filename: string;
      storagePath: string;
      pageCount: number;
      sizeBytes: number;
    }> = [];

    // Process all uploaded documents in parallel
    await Promise.all(
      documents.map(async (doc) => {
        const { data: blob, error: downloadError } = await client.storage
          .from("print-documents")
          .download(doc.storagePath);

        if (downloadError || !blob) {
          throw new Error(`Failed to read uploaded file "${doc.filename}" from storage.`);
        }

        cleanupRawPaths.push(doc.storagePath);

        const normalized: NormalizedDocumentResult = await normalizeDocument({
          name: doc.filename,
          arrayBuffer: () => blob.arrayBuffer(),
        });

        const finalStoragePath = `shops/${shop.id}/orders/${orderId}/documents/${doc.id}/source.pdf`;
        const previewStoragePath = `shops/${shop.id}/orders/${orderId}/documents/${doc.id}/preview.jpg`;

        const { error: uploadError } = await client.storage
          .from("print-documents")
          .upload(finalStoragePath, normalized.bytes, { contentType: "application/pdf", upsert: true });

        if (uploadError) {
          throw new Error(`Failed to save processed document "${doc.filename}".`);
        }
        storedPaths.push(finalStoragePath);

        if (normalized.previewImage) {
          const { error: previewError } = await client.storage
            .from("print-documents")
            .upload(previewStoragePath, normalized.previewImage, {
              contentType: normalized.previewMime || "image/jpeg",
              upsert: true,
            });
          if (!previewError) {
            storedPaths.push(previewStoragePath);
          }
        }

        processedDocuments.push({
          id: doc.id,
          filename: normalized.filename,
          storagePath: finalStoragePath,
          pageCount: normalized.pageCount,
          sizeBytes: normalized.bytes.length,
        });
      }),
    );

    // Batch insert into documents table
    const documentsToInsert = processedDocuments.map((doc) => ({
      id: doc.id,
      shop_id: shop.id,
      order_id: orderId,
      storage_path: doc.storagePath,
      original_filename: doc.filename,
      mime_type: "application/pdf",
      size_bytes: doc.sizeBytes,
      page_count: doc.pageCount,
      processing_status: "ready",
      normalized_storage_path: doc.storagePath,
      normalized_mime_type: "application/pdf",
    }));

    const { error: insertError } = await client.from("documents").insert(documentsToInsert);
    if (insertError) {
      throw new Error("Failed to register document records in database.");
    }

    // Clean up temporary raw paths if they differ from final storage path
    const rawToDelete = cleanupRawPaths.filter((p) => !storedPaths.includes(p));
    if (rawToDelete.length > 0) {
      void client.storage.from("print-documents").remove(rawToDelete);
    }

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    const requestOrigin = host && !host.includes("0.0.0.0") ? `${proto}://${host}` : "";
    const baseUrl = requestOrigin || getAppUrl();
    const configUrl = `${baseUrl}/shop/${shop.public_id}?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(guestToken)}`;

    return NextResponse.json({
      orderId,
      orderPublicId: existingOrder.public_id,
      accessToken: guestToken,
      shopSlug: shop.public_id,
      configUrl,
      customerPhone,
      customerName,
      documents: processedDocuments,
    });
  } catch (err) {
    if (storedPaths.length > 0) {
      await client.storage.from("print-documents").remove(storedPaths);
    }
    await client.from("orders").delete().eq("id", orderId);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to finalize document processing." },
      { status: 500 },
    );
  }
}
