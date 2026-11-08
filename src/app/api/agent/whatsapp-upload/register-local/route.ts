import { NextResponse } from "next/server";
import crypto from "node:crypto";
import sharp from "sharp";
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
  // doc.id becomes part of a storage path written with the admin client; keep it a plain UUID.
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (documents.some((doc) => typeof doc?.id !== "string" || !uuidPattern.test(doc.id))) {
    return NextResponse.json({ error: "Invalid document reference." }, { status: 400 });
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
        if (!doc.previewBase64) {
          console.warn(`[register-local] No previewBase64 for document ${doc.id} (${doc.filename}), skipping preview upload`);
          return;
        }
        let rawBuffer: Buffer | null = null;
        let uploadContentType = "image/jpeg";

        if (doc.previewBase64.startsWith("data:")) {
          const commaIdx = doc.previewBase64.indexOf(",");
          if (commaIdx !== -1) {
            const meta = doc.previewBase64.slice(5, commaIdx);
            const mime = meta.split(";")[0]?.toLowerCase() || "image/jpeg";
            uploadContentType = mime === "image/jpg" ? "image/jpeg" : mime;
            const b64Data = doc.previewBase64.slice(commaIdx + 1).replace(/[\r\n\s]/g, "");
            try {
              rawBuffer = Buffer.from(b64Data, "base64");
            } catch {
              rawBuffer = null;
            }
          }
        }
        if (!rawBuffer) {
          try {
            const clean = doc.previewBase64.replace(/[\r\n\s]/g, "");
            rawBuffer = Buffer.from(clean, "base64");
          } catch {
            rawBuffer = null;
          }
        }

        if (!rawBuffer || rawBuffer.length === 0) {
          console.warn(`[register-local] Could not decode base64 buffer for document ${doc.id} (${doc.filename})`);
          return;
        }

        let uploadBuffer = rawBuffer;

        try {
          uploadBuffer = await sharp(rawBuffer, { limitInputPixels: 268402689 })
            .rotate()
            .toColorspace("srgb")
            .flatten({ background: "white" })
            .resize({ width: 720, height: 1020, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80, mozjpeg: true })
            .toBuffer();
          uploadContentType = "image/jpeg";
        } catch (sharpErr) {
          // If sharp optimization fails, upload original rawBuffer directly
          console.warn(`[register-local] Sharp resize fallback for ${doc.id}:`, sharpErr);
          uploadBuffer = rawBuffer;
        }

        const previewStoragePath = `shops/${shop.id}/orders/${orderId}/documents/${doc.id}/preview.jpg`;

        let uploadSucceeded = false;
        let lastUploadError: unknown;
        // 5 attempts with exponential backoff (250ms, 500ms, 1000ms, 2000ms)
        for (let attempt = 1; attempt <= 5; attempt++) {
          const { error: uploadErr } = await client.storage
            .from("print-documents")
            .upload(previewStoragePath, uploadBuffer, {
              contentType: uploadContentType,
              upsert: true,
            });

          if (!uploadErr) {
            storedPreviewPaths.push(previewStoragePath);
            uploadSucceeded = true;
            console.log(`[register-local] Uploaded preview for document ${doc.id} (${uploadBuffer.length} bytes) to ${previewStoragePath}`);
            break;
          }
          lastUploadError = uploadErr;
          if (attempt < 5) {
            await new Promise((r) => setTimeout(r, 200 * attempt));
          }
        }
        if (!uploadSucceeded) {
          console.error(
            `[register-local] Failed to upload preview for document ${doc.id} (${doc.filename}) after 5 attempts. Last error:`,
            lastUploadError,
          );
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
        hasPreview: storedPreviewPaths.includes(`shops/${shop.id}/orders/${orderId}/documents/${d.id}/preview.jpg`),
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
