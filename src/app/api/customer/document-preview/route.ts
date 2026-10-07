import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashGuestOrderToken } from "@/lib/guest-order";
import { extractImageFromPdf } from "@/lib/pdf-preview";

export const runtime = "nodejs";

const QuerySchema = z.object({
  documentId: z.string().uuid(),
  orderId: z.string().uuid(),
  accessToken: z.string().min(10),
  w: z.coerce.number().min(60).max(2000).optional(),
});

const imageExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ".avif",
  ".svg",
]);

async function optimizePreviewImage(
  rawBuffer: Buffer,
  targetWidth?: number,
): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const width = targetWidth ? Math.min(1600, Math.max(80, targetWidth)) : 800;
    const quality = width <= 400 ? 75 : 82;

    const optimized = await sharp(rawBuffer, { limitInputPixels: 268402689 })
      .rotate()
      .resize({ width, withoutEnlargement: true, fit: "inside" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    return { buffer: optimized, mimeType: "image/jpeg" };
  } catch {
    return { buffer: rawBuffer, mimeType: "image/jpeg" };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    documentId: url.searchParams.get("documentId"),
    orderId: url.searchParams.get("orderId"),
    accessToken: url.searchParams.get("accessToken") || url.searchParams.get("token"),
    w: url.searchParams.get("w") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Missing or invalid document preview parameters." }, { status: 400 });
  }

  const { documentId, orderId, accessToken, w: targetWidth } = parsed.data;
  const client = createSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const tokenHash = hashGuestOrderToken(accessToken);

  // Validate order ownership via guest token
  const { data: order, error: orderError } = await client
    .from("orders")
    .select("id, shop_id")
    .eq("id", orderId)
    .eq("guest_access_token_hash", tokenHash)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Unauthorized access to document." }, { status: 403 });
  }

  // Fetch document storage path
  const { data: doc, error: docError } = await client
    .from("documents")
    .select("storage_path, original_filename, mime_type")
    .eq("id", documentId)
    .eq("order_id", orderId)
    .maybeSingle();

  if (docError || !doc || !doc.storage_path) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const extMatch = doc.original_filename.match(/\.([a-z0-9]+)$/i);
  const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : "";
  const isImageDoc = imageExtensions.has(ext) || Boolean(doc.original_filename.match(/^(photo_|image_)/i));

  // 1. First, check if a direct preview.jpg exists for this document in storage
  const standardPreviewPath = `shops/${order.shop_id}/orders/${orderId}/documents/${documentId}/preview.jpg`;
  const legacyPreviewPath = doc.storage_path.replace(/source\.pdf$/, "preview.jpg");
  const previewPath = doc.storage_path.startsWith("local://") ? standardPreviewPath : legacyPreviewPath;
  const { data: previewBlob } = await client.storage.from("print-documents").download(previewPath);

  if (previewBlob && previewBlob.size > 0) {
    const rawBuffer = Buffer.from(await previewBlob.arrayBuffer());
    const { buffer: optimizedBuffer, mimeType } = await optimizePreviewImage(rawBuffer, targetWidth);

    const headers = new Headers();
    headers.set("Content-Type", mimeType);
    headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(doc.original_filename)}"`);

    return new NextResponse(new Uint8Array(optimizedBuffer), {
      status: 200,
      headers,
    });
  }

  // If the document is stored strictly locally on the shop PC and has no preview image
  if (doc.storage_path.startsWith("local://")) {
    return NextResponse.json({ error: "Preview not available for this local document." }, { status: 404 });
  }

  // 2. Otherwise download the stored document file (source.pdf) from cloud
  const { data: fileBlob, error: downloadError } = await client.storage
    .from("print-documents")
    .download(doc.storage_path);

  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: "Failed to download preview." }, { status: 502 });
  }

  const arrayBuf = await fileBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  // If this document is an image (or single-photo PDF), extract the original image stream
  if (isImageDoc || doc.mime_type === "application/pdf") {
    const extracted = await extractImageFromPdf(buffer);
    if (extracted) {
      // Opportunistically cache preview.jpg for instant subsequent requests
      void client.storage
        .from("print-documents")
        .upload(previewPath, extracted.buffer, {
          contentType: extracted.mimeType,
          upsert: true,
        })
        .catch(() => {});

      const { buffer: optimizedBuffer, mimeType } = await optimizePreviewImage(extracted.buffer, targetWidth);

      const headers = new Headers();
      headers.set("Content-Type", mimeType);
      headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(doc.original_filename)}"`);

      return new NextResponse(new Uint8Array(optimizedBuffer), {
        status: 200,
        headers,
      });
    }
  }

  const headers = new Headers();
  headers.set("Content-Type", doc.mime_type || "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(doc.original_filename)}"`);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers,
  });
}
