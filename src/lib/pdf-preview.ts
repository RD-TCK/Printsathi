import sharp from "sharp";
import zlib from "node:zlib";
import path from "node:path";
import fs, { existsSync } from "node:fs";

// Polyfill DOMMatrix and Path2D for pdfjs in Node.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureCanvasPolyfills(napiCanvas: any) {
  const g = globalThis as Record<string, unknown>;
  if (napiCanvas?.DOMMatrix && !g.DOMMatrix) {
    g.DOMMatrix = napiCanvas.DOMMatrix;
  }
  if (napiCanvas?.Path2D && !g.Path2D) {
    g.Path2D = napiCanvas.Path2D;
  }
}

// In-memory cache for standard fonts and CMaps to make rendering instant and avoid repeated disk/network I/O
const standardFontCache = new Map<string, Uint8Array>();
const cmapDataCache = new Map<string, Uint8Array>();

/**
 * Resilient StandardFontDataFactory for pdfjs-dist.
 * Resolves standard fonts (Helvetica, LiberationSans, Times, Courier, etc.)
 * directly from local node_modules or falls back to official CDN in serverless lambdas.
 * This ensures 100% of PDF characters, numbers, and passenger details render crisply.
 */
class ResilientStandardFontDataFactory {
  baseUrl: string;
  constructor(options?: { baseUrl?: string }) {
    this.baseUrl =
      options?.baseUrl ||
      getStandardFontsPath() ||
      path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts");
  }

  async fetch({ filename }: { filename: string }): Promise<Uint8Array> {
    if (!filename) throw new Error("Font filename is required");
    if (standardFontCache.has(filename)) {
      return standardFontCache.get(filename)!;
    }

    // 1. Try resolving from candidate local directories
    const candidateDirs = [
      this.baseUrl,
      path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts"),
      path.resolve(__dirname, "../../node_modules/pdfjs-dist/standard_fonts"),
      path.resolve(__dirname, "../../../node_modules/pdfjs-dist/standard_fonts"),
      path.resolve(__dirname, "node_modules/pdfjs-dist/standard_fonts"),
    ];

    for (const dir of candidateDirs) {
      try {
        const fullPath = path.join(dir, filename);
        if (existsSync(fullPath)) {
          const bytes = new Uint8Array(await fs.promises.readFile(fullPath));
          standardFontCache.set(filename, bytes);
          return bytes;
        }
      } catch {
        // continue
      }
    }

    // 2. Fallback: Fetch font file from CDN (Vercel serverless / minimal containers)
    const cdnUrls = [
      `https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/${filename}`,
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/${filename}`,
    ];

    for (const url of cdnUrls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          standardFontCache.set(filename, bytes);
          return bytes;
        }
      } catch {
        // continue
      }
    }

    throw new Error(`[ResilientStandardFontDataFactory] Font file could not be loaded: ${filename}`);
  }
}

/**
 * Resilient CMapReaderFactory for pdfjs-dist.
 * Ensures international character encodings and symbol mappings render without missing glyphs.
 */
class ResilientCMapReaderFactory {
  baseUrl: string;
  isCompressed: boolean;

  constructor(options?: { baseUrl?: string; isCompressed?: boolean }) {
    this.baseUrl =
      options?.baseUrl ||
      getCmapsPath() ||
      path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps");
    this.isCompressed = options?.isCompressed !== false;
  }

  async fetch({ name }: { name: string }): Promise<{ cMapData: Uint8Array; compressionType: number }> {
    if (!name) throw new Error("CMap name is required");
    const ext = this.isCompressed ? ".bcmap" : "";
    const filename = `${name}${ext}`;
    const compressionType = this.isCompressed ? 1 : 0; // 1 = BINARY

    if (cmapDataCache.has(filename)) {
      return { cMapData: cmapDataCache.get(filename)!, compressionType };
    }

    const candidateDirs = [
      this.baseUrl,
      path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps"),
      path.resolve(__dirname, "../../node_modules/pdfjs-dist/cmaps"),
      path.resolve(__dirname, "../../../node_modules/pdfjs-dist/cmaps"),
    ];

    for (const dir of candidateDirs) {
      try {
        const fullPath = path.join(dir, filename);
        if (existsSync(fullPath)) {
          const bytes = new Uint8Array(await fs.promises.readFile(fullPath));
          cmapDataCache.set(filename, bytes);
          return { cMapData: bytes, compressionType };
        }
      } catch {
        // continue
      }
    }

    // CDN fallback for CMaps
    try {
      const res = await fetch(`https://unpkg.com/pdfjs-dist@3.11.174/cmaps/${filename}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        cmapDataCache.set(filename, bytes);
        return { cMapData: bytes, compressionType };
      }
    } catch {
      // ignore
    }

    throw new Error(`[ResilientCMapReaderFactory] CMap could not be loaded: ${filename}`);
  }
}

function getStandardFontsPath(): string {
  try {
    const candidateDirs = [
      path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts"),
      path.resolve(__dirname, "../../node_modules/pdfjs-dist/standard_fonts"),
      path.resolve(__dirname, "../../../node_modules/pdfjs-dist/standard_fonts"),
      path.resolve(__dirname, "node_modules/pdfjs-dist/standard_fonts"),
    ];
    for (const d of candidateDirs) {
      if (existsSync(/*turbopackIgnore: true*/ d)) {
        return d;
      }
    }
  } catch {
    // fallback
  }
  return path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts");
}

function getCmapsPath(): string {
  try {
    const candidateDirs = [
      path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps"),
      path.resolve(__dirname, "../../node_modules/pdfjs-dist/cmaps"),
      path.resolve(__dirname, "../../../node_modules/pdfjs-dist/cmaps"),
    ];
    for (const d of candidateDirs) {
      if (existsSync(/*turbopackIgnore: true*/ d)) {
        return d;
      }
    }
  } catch {
    // fallback
  }
  return path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createNapiCanvasFactory(napiCanvas: any) {
  return {
    create(width: number, height: number) {
      const canvas = napiCanvas.createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
      const context = canvas.getContext("2d");
      return { canvas, context };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reset(canvasAndContext: { canvas: any; context: any }, width: number, height: number) {
      canvasAndContext.canvas.width = Math.max(1, Math.round(width));
      canvasAndContext.canvas.height = Math.max(1, Math.round(height));
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    destroy(canvasAndContext: { canvas: any; context: any }) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    },
  };
}

/**
 * Attempts to extract an embedded JPEG or PNG/Flate image from a PDF buffer.
 * Used when serving image previews for documents that were converted to PDF on the server.
 */
export async function extractImageFromPdf(pdfBuffer: Buffer): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    // 1. Search for JPEG image stream: SOI marker 0xFF 0xD8 0xFF ... 0xFF 0xD9
    let searchStart = 0;
    while (searchStart < pdfBuffer.length) {
      const soi = pdfBuffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]), searchStart);
      if (soi === -1) break;
      const eoi = pdfBuffer.indexOf(Buffer.from([0xff, 0xd9]), soi + 3);
      if (eoi === -1) break;
      const candidate = pdfBuffer.subarray(soi, eoi + 2);
      if (candidate.length > 50) {
        try {
          const meta = await sharp(candidate).metadata();
          if (meta.width && meta.height && meta.format === "jpeg") {
            return { buffer: candidate, mimeType: "image/jpeg" };
          }
        } catch {
          // Not a valid JPEG chunk, continue searching
        }
      }
      searchStart = soi + 3;
    }

    // 2. Search for PNG image stream: PNG header 0x89 0x50 0x4E 0x47
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    let pngSearchStart = 0;
    while (pngSearchStart < pdfBuffer.length) {
      const pngStart = pdfBuffer.indexOf(pngHeader, pngSearchStart);
      if (pngStart === -1) break;
      const iend = pdfBuffer.indexOf(Buffer.from("IEND"), pngStart + 8);
      if (iend === -1) break;
      const candidate = pdfBuffer.subarray(pngStart, iend + 8);
      if (candidate.length > 50) {
        try {
          const meta = await sharp(candidate).metadata();
          if (meta.width && meta.height && meta.format === "png") {
            return { buffer: candidate, mimeType: "image/png" };
          }
        } catch {
          // Not a valid PNG chunk
        }
      }
      pngSearchStart = pngStart + 8;
    }

    // 3. Search for raw FlateDecode Image XObject in PDF
    const pdfText = pdfBuffer.toString("latin1");
    const streamRegex = /<<[\s\S]*?\/Subtype\s*\/Image[\s\S]*?>>\s*stream\r?\n/g;
    let match: RegExpExecArray | null;

    while ((match = streamRegex.exec(pdfText)) !== null) {
      const headerStr = match[0];
      const streamStartIndex = match.index + headerStr.length;
      const endStreamIndex = pdfBuffer.indexOf(Buffer.from("endstream"), streamStartIndex);
      if (endStreamIndex === -1) continue;

      let streamBytes = pdfBuffer.subarray(streamStartIndex, endStreamIndex);
      // Strip trailing CRLF before endstream if present
      if (streamBytes[streamBytes.length - 1] === 0x0a) streamBytes = streamBytes.subarray(0, streamBytes.length - 1);
      if (streamBytes[streamBytes.length - 1] === 0x0d) streamBytes = streamBytes.subarray(0, streamBytes.length - 1);

      const widthMatch = headerStr.match(/\/Width\s+(\d+)/);
      const heightMatch = headerStr.match(/\/Height\s+(\d+)/);
      const width = widthMatch ? parseInt(widthMatch[1], 10) : 0;
      const height = heightMatch ? parseInt(heightMatch[1], 10) : 0;
      const isFlate = headerStr.includes("/FlateDecode");
      const isRGB = headerStr.includes("/DeviceRGB");
      const isGray = headerStr.includes("/DeviceGray");

      if (width > 0 && height > 0 && isFlate) {
        try {
          const inflated = zlib.inflateSync(streamBytes);
          const channels = isRGB ? 3 : isGray ? 1 : 3;
          if (inflated.length >= width * height * channels) {
            const converted = await sharp(inflated.subarray(0, width * height * channels), {
              raw: { width, height, channels },
            })
              .jpeg({ quality: 95 })
              .toBuffer();
            return { buffer: converted, mimeType: "image/jpeg" };
          }
        } catch {
          // Ignore decompression error and try next
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Renders any specified page of ANY PDF buffer (text, fonts, vectors, Word docs, photos)
 * into a high-quality JPEG image buffer with full typography support.
 */
export async function renderPdfPage(
  pdfBuffer: Buffer,
  pageNumber = 1,
  targetWidth = 900,
): Promise<{ buffer: Buffer; mimeType: string; totalPages: number; pageNumber: number } | null> {
  // 1. Full PDF rasterization via @napi-rs/canvas + pdfjs-dist with standard font factory
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const napiCanvas = require("@napi-rs/canvas");
    ensureCanvasPolyfills(napiCanvas);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
    const canvasFactory = createNapiCanvasFactory(napiCanvas);

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      StandardFontDataFactory: ResilientStandardFontDataFactory,
      CMapReaderFactory: ResilientCMapReaderFactory,
      disableFontFace: false,
      canvasFactory,
    });

    const pdfDoc = await loadingTask.promise;
    if (!pdfDoc || pdfDoc.numPages < 1) return null;

    const totalPages = pdfDoc.numPages;
    const clampedPage = Math.min(totalPages, Math.max(1, pageNumber));

    const page = await pdfDoc.getPage(clampedPage);
    const initialViewport = page.getViewport({ scale: 1.0 });

    const scale = Math.min(2.5, Math.max(0.6, targetWidth / Math.max(1, initialViewport.width)));
    const viewport = page.getViewport({ scale });

    const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);

    // Crisp white background to avoid transparent page issues
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvasFactory,
    }).promise;

    const buffer = canvas.toBuffer("image/jpeg", 82);
    return { buffer, mimeType: "image/jpeg", totalPages, pageNumber: clampedPage };
  } catch (error) {
    console.warn(`[renderPdfPage] Fallback: Could not rasterize PDF page ${pageNumber}:`, error);

    // 2. Fallback: Only extract embedded image if rasterization failed completely
    // AND the extracted image is large enough to represent a full page (not a tiny icon or logo)
    if (pageNumber === 1) {
      try {
        const fallback = await extractImageFromPdf(pdfBuffer);
        if (fallback?.buffer) {
          const meta = await sharp(fallback.buffer).metadata();
          if (meta.width && meta.height && meta.width >= 400 && meta.height >= 400) {
            return { ...fallback, totalPages: 1, pageNumber: 1 };
          }
        }
      } catch {
        // ignore
      }
    }
    return null;
  }
}

/**
 * Backward-compatible helper that renders page 1 of a PDF.
 */
export async function renderPdfFirstPage(
  pdfBuffer: Buffer,
  targetWidth = 900,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const result = await renderPdfPage(pdfBuffer, 1, targetWidth);
  if (!result) return null;
  return { buffer: result.buffer, mimeType: result.mimeType };
}
