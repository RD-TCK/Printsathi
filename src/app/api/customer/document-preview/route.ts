import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import sharp from "sharp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashGuestOrderToken } from "@/lib/guest-order";
import { extractImageFromPdf, renderPdfFirstPage } from "@/lib/pdf-preview";

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

function renderDocPlaceholderSvg(options: {
  filename: string;
  pageCount?: number | null;
  mimeType?: string | null;
}): string {
  const ext = (options.filename.split(".").pop() || "DOC").toUpperCase().slice(0, 6);
  const cleanName = options.filename.replace(/[<>&"']/g, "").trim();
  const displayName = cleanName.length > 28 ? cleanName.slice(0, 25) + "…" : cleanName;
  const pageText =
    options.pageCount && options.pageCount > 0
      ? `${options.pageCount} page${options.pageCount > 1 ? "s" : ""}`
      : "Document Ready";

  return `<svg width="480" height="600" viewBox="0 0 480 600" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="sheet" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>
    <linearGradient id="badge" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <filter id="shadow" x="30" y="30" width="420" height="540" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>
  
  <rect width="480" height="600" rx="20" fill="url(#bg)"/>
  
  <g filter="url(#shadow)">
    <rect x="60" y="50" width="360" height="500" rx="14" fill="url(#sheet)"/>
  </g>
  
  <path d="M380 50 L420 90 H380 V50 Z" fill="#cbd5e1"/>
  
  <rect x="100" y="120" width="140" height="12" rx="6" fill="#e2e8f0"/>
  <rect x="100" y="150" width="280" height="8" rx="4" fill="#f1f5f9"/>
  <rect x="100" y="170" width="260" height="8" rx="4" fill="#f1f5f9"/>
  <rect x="100" y="190" width="270" height="8" rx="4" fill="#f1f5f9"/>
  <rect x="100" y="210" width="230" height="8" rx="4" fill="#f1f5f9"/>
  <rect x="100" y="230" width="280" height="8" rx="4" fill="#f1f5f9"/>
  <rect x="100" y="250" width="200" height="8" rx="4" fill="#f1f5f9"/>
  
  <rect x="180" y="290" width="120" height="50" rx="12" fill="url(#badge)"/>
  <text x="240" y="322" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="1">${ext}</text>
  
  <text x="240" y="390" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#0f172a" text-anchor="middle">${displayName}</text>
  <text x="240" y="420" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#64748b" text-anchor="middle">${pageText}</text>
  
  <rect x="160" y="460" width="160" height="32" rx="16" fill="#f1f5f9"/>
  <text x="240" y="481" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" fill="#475569" text-anchor="middle">Ready for Printing</text>
</svg>`;
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
    .select("storage_path, original_filename, mime_type, page_count")
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
  let { data: previewBlob } = await client.storage.from("print-documents").download(previewPath);

  if (!previewBlob || previewBlob.size === 0) {
    // Retry once in case of storage replication or upload concurrency
    await new Promise((r) => setTimeout(r, 200));
    const { data: secondTry } = await client.storage.from("print-documents").download(previewPath);
    if (secondTry && secondTry.size > 0) {
      previewBlob = secondTry;
    }
  }

  if (previewBlob && previewBlob.size > 0) {
    const rawBuffer = Buffer.from(await previewBlob.arrayBuffer());
    const { buffer: optimizedBuffer, mimeType } = await optimizePreviewImage(rawBuffer, targetWidth);

    const headers = new Headers();
    headers.set("Content-Type", mimeType);
    headers.set("Cache-Control", "private, max-age=86400, stale-while-revalidate=604800");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(doc.original_filename)}"`);

    return new NextResponse(new Uint8Array(optimizedBuffer), {
      status: 200,
      headers,
    });
  }

  // If the document is stored strictly locally on the shop PC and preview was not found in cloud storage:
  if (doc.storage_path.startsWith("local://")) {
    const rawId = doc.storage_path
      .replace("local://", "")
      .replace(/\.pdf$/i, "")
      .replace(/^doc_/, "")
      .replace(/[^A-Za-z0-9_-]/g, "");

    // 1. Check local disk cache if running on Windows (e.g. localhost dev/desktop agent)
    const appData =
      process.env.LOCALAPPDATA ||
      (process.platform === "win32" ? path.join(os.homedir(), "AppData", "Local") : "");
    if (appData) {
      const cacheDir = path.join(appData, "PrintivaAgent", "document_cache");
      const directPath = path.join(cacheDir, `doc_${rawId}.pdf`);
      const altPath = path.join(cacheDir, `${rawId}.pdf`);
      const pathToRead = fs.existsSync(directPath) ? directPath : fs.existsSync(altPath) ? altPath : null;

      if (pathToRead) {
        try {
          const pdfBuf = fs.readFileSync(pathToRead);
          const rendered = await renderPdfFirstPage(pdfBuf, targetWidth || 800);
          if (rendered?.buffer) {
            // Opportunistically upload to Supabase Storage so subsequent remote/mobile requests find it instantly
            void client.storage
              .from("print-documents")
              .upload(standardPreviewPath, rendered.buffer, {
                contentType: rendered.mimeType || "image/jpeg",
                upsert: true,
              })
              .catch(() => {});

            const { buffer: optimizedBuffer, mimeType } = await optimizePreviewImage(rendered.buffer, targetWidth);
            const headers = new Headers();
            headers.set("Content-Type", mimeType);
            headers.set("Cache-Control", "private, max-age=86400, stale-while-revalidate=604800");
            headers.set("Access-Control-Allow-Origin", "*");
            headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(doc.original_filename)}"`);

            return new NextResponse(new Uint8Array(optimizedBuffer), {
              status: 200,
              headers,
            });
          }
        } catch {
          // Fall through to placeholder SVG
        }
      }
    }

    // 2. Return vector SVG document sheet so <img> tags never show broken image icons.
    // For images, set no-cache so when the thumbnail finishes uploading, the client sees it immediately.
    const svg = renderDocPlaceholderSvg({
      filename: doc.original_filename,
      pageCount: doc.page_count,
      mimeType: doc.mime_type,
    });
    const headers = new Headers();
    headers.set("Content-Type", "image/svg+xml");
    headers.set("X-Printiva-Placeholder", "1");
    headers.set(
      "Cache-Control",
      isImageDoc
        ? "no-cache, no-store, max-age=0, must-revalidate"
        : "private, max-age=60",
    );
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(doc.original_filename)}"`);

    return new NextResponse(svg, {
      status: 200,
      headers,
    });
  }

  // 2. Otherwise download the stored document file (source.pdf) from cloud
  const { data: fileBlob, error: downloadError } = await client.storage
    .from("print-documents")
    .download(doc.storage_path);

  if (downloadError || !fileBlob) {
    const svg = renderDocPlaceholderSvg({
      filename: doc.original_filename,
      pageCount: doc.page_count,
      mimeType: doc.mime_type,
    });
    const headers = new Headers();
    headers.set("Content-Type", "image/svg+xml");
    headers.set("Cache-Control", "public, max-age=300");
    headers.set("Access-Control-Allow-Origin", "*");
    return new NextResponse(svg, {
      status: 200,
      headers,
    });
  }

  const arrayBuf = await fileBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  // If this document is an image (or single-photo PDF), extract the original image stream.
  // For WhatsApp/image uploads the source.pdf is a single-page image PDF created by pdf-lib.
  // First try fast binary extraction of the embedded JPEG/PNG; if that fails (e.g. pdf-lib
  // used object streams or compressed cross-reference tables that hide the raw image bytes),
  // fall back to rendering the PDF page via sharp so we always serve a real preview instead
  // of the SVG placeholder card.
  if (isImageDoc || doc.mime_type === "application/pdf" || doc.storage_path.endsWith(".pdf")) {
    const rendered = await renderPdfFirstPage(buffer, targetWidth || 900);
    if (rendered?.buffer) {
      // Opportunistically cache preview.jpg for instant subsequent requests
      void client.storage
        .from("print-documents")
        .upload(previewPath, rendered.buffer, {
          contentType: rendered.mimeType || "image/jpeg",
          upsert: true,
        })
        .catch(() => {});

      const { buffer: optimizedBuffer, mimeType } = await optimizePreviewImage(rendered.buffer, targetWidth);

      const headers = new Headers();
      headers.set("Content-Type", mimeType);
      headers.set("Cache-Control", "private, max-age=86400, stale-while-revalidate=604800");
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(doc.original_filename)}"`);

      return new NextResponse(new Uint8Array(optimizedBuffer), {
        status: 200,
        headers,
      });
    }
  }

  if (doc.mime_type?.startsWith("image/")) {
    const { buffer: optimizedBuffer, mimeType } = await optimizePreviewImage(buffer, targetWidth);
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

  // Non-image document where no preview thumbnail could be extracted:
  // Render clean vector SVG card instead of raw PDF bytes so HTML <img> renders flawlessly.
  const svg = renderDocPlaceholderSvg({
    filename: doc.original_filename,
    pageCount: doc.page_count,
    mimeType: doc.mime_type,
  });
  const headers = new Headers();
  headers.set("Content-Type", "image/svg+xml");
  headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  headers.set("Access-Control-Allow-Origin", "*");
  return new NextResponse(svg, {
    status: 200,
    headers,
  });
}
