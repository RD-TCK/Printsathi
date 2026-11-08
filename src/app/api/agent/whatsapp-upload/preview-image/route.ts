import { NextResponse } from "next/server";
import sharp from "sharp";
import { authenticateAgent } from "@/lib/agent/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized agent." }, { status: 401 });
  }

  const { shop } = auth;
  let body: {
    orderId?: string;
    documentId?: string;
    previewBase64?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { orderId, documentId, previewBase64 } = body;
  if (!orderId || !documentId || !previewBase64) {
    return NextResponse.json({ error: "orderId, documentId and previewBase64 are required." }, { status: 400 });
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(orderId) || !uuidPattern.test(documentId)) {
    return NextResponse.json({ error: "Invalid UUID format." }, { status: 400 });
  }

  const client = createSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ error: "Storage service unavailable." }, { status: 503 });
  }

  let rawBuffer: Buffer | null = null;
  let uploadContentType = "image/jpeg";

  if (previewBase64.startsWith("data:")) {
    const commaIdx = previewBase64.indexOf(",");
    if (commaIdx !== -1) {
      const meta = previewBase64.slice(5, commaIdx);
      const mime = meta.split(";")[0]?.toLowerCase() || "image/jpeg";
      uploadContentType = mime === "image/jpg" ? "image/jpeg" : mime;
      const b64Data = previewBase64.slice(commaIdx + 1).replace(/[\r\n\s]/g, "");
      try {
        rawBuffer = Buffer.from(b64Data, "base64");
      } catch {
        rawBuffer = null;
      }
    }
  }
  if (!rawBuffer) {
    try {
      const clean = previewBase64.replace(/[\r\n\s]/g, "");
      rawBuffer = Buffer.from(clean, "base64");
    } catch {
      rawBuffer = null;
    }
  }

  if (!rawBuffer || rawBuffer.length === 0) {
    return NextResponse.json({ error: "Could not decode preview base64." }, { status: 400 });
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
    console.warn(`[preview-image] Sharp resize fallback for ${documentId}:`, sharpErr);
    uploadBuffer = rawBuffer;
  }

  const previewStoragePath = `shops/${shop.id}/orders/${orderId}/documents/${documentId}/preview.jpg`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { error: uploadErr } = await client.storage
      .from("print-documents")
      .upload(previewStoragePath, uploadBuffer, {
        contentType: uploadContentType,
        upsert: true,
      });

    if (!uploadErr) {
      console.log(`[preview-image] Stored preview for document ${documentId} (${uploadBuffer.length} bytes)`);
      return NextResponse.json({ success: true, path: previewStoragePath });
    }
    lastError = uploadErr;
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }

  console.error(`[preview-image] Failed to upload preview for ${documentId}:`, lastError);
  return NextResponse.json({ error: "Failed to store preview image." }, { status: 500 });
}

