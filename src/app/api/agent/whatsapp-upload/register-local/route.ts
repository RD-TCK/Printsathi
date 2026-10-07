import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { authenticateAgent } from "@/lib/agent/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createGuestOrderToken } from "@/lib/guest-order";
import { getAppUrl } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized agent." }, { status: 401 });
  }

  const { shop } = auth;
  let body: {
    customerPhone?: string;
    customerName?: string;
    documents?: Array<{
      id: string;
      filename: string;
      pageCount: number;
      sizeBytes: number;
      previewBase64?: string;
    }>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { customerPhone, customerName, documents } = body;
  if (!Array.isArray(documents) || documents.length === 0) {
    return NextResponse.json({ error: "No documents specified." }, { status: 400 });
  }

  const client = createSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ error: "Storage service unavailable." }, { status: 503 });
  }

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
  const storedPreviewPaths: string[] = [];

  try {
    // 1. Upload preview images to Supabase storage in parallel (only lightweight ~150KB thumbnails)
    await Promise.all(
      documents.map(async (doc) => {
        if (!doc.previewBase64) return;
        const matches = doc.previewBase64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return;

        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], "base64");
        const previewStoragePath = `shops/${shop.id}/orders/${orderId}/documents/${doc.id}/preview.jpg`;

        const { error: uploadErr } = await client.storage
          .from("print-documents")
          .upload(previewStoragePath, buffer, {
            contentType: mimeType || "image/jpeg",
            upsert: true,
          });

        if (!uploadErr) {
          storedPreviewPaths.push(previewStoragePath);
        }
      }),
    );

    // 2. Batch insert documents pointing to local storage
    const documentsToInsert = documents.map((doc) => ({
      id: doc.id,
      shop_id: shop.id,
      order_id: orderId,
      storage_path: `local://${doc.id}.pdf`,
      original_filename: doc.filename,
      mime_type: "application/pdf",
      size_bytes: doc.sizeBytes || 0,
      page_count: Math.max(1, doc.pageCount || 1),
      processing_status: "ready",
      normalized_storage_path: `local://${doc.id}.pdf`,
      normalized_mime_type: "application/pdf",
    }));

    const { error: insertError } = await client.from("documents").insert(documentsToInsert);
    if (insertError) {
      throw new Error("Failed to register document records in database.");
    }

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    const requestOrigin = host && !host.includes("0.0.0.0") ? `${proto}://${host}` : "";
    const baseUrl = requestOrigin || getAppUrl();
    const configUrl = `${baseUrl}/shop/${shop.public_id}?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(guestToken.token)}`;

    return NextResponse.json({
      orderId,
      orderPublicId: newOrder.public_id,
      accessToken: guestToken.token,
      shopSlug: shop.public_id,
      configUrl,
      customerPhone,
      customerName,
      documents: documents.map((d) => ({
        id: d.id,
        filename: d.filename,
        pageCount: Math.max(1, d.pageCount || 1),
        sizeBytes: d.sizeBytes,
      })),
    });
  } catch (err) {
    if (storedPreviewPaths.length > 0) {
      await client.storage.from("print-documents").remove(storedPreviewPaths);
    }
    await client.from("orders").delete().eq("id", orderId);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to register local document order." },
      { status: 500 },
    );
  }
}
