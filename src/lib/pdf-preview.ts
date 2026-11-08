import sharp from "sharp";
import zlib from "node:zlib";
import path from "node:path";
import fs from "node:fs";

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

const fontCache = new Map<string, Uint8Array>();
const cmapCache = new Map<string, Uint8Array>();

function getCandidateFontDirs(): string[] {
  const dirs = [
    path.join(process.cwd(), "assets", "standard_fonts"),
    path.join(process.cwd(), "dist", "assets", "standard_fonts"),
    path.resolve(__dirname, "../../assets/standard_fonts"),
    path.resolve(__dirname, "../assets/standard_fonts"),
    path.resolve(__dirname, "assets/standard_fonts"),
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts"),
    path.resolve(__dirname, "../../node_modules/pdfjs-dist/standard_fonts"),
    path.resolve(__dirname, "../node_modules/pdfjs-dist/standard_fonts"),
  ];
  return dirs.filter((d) => {
    try {
      return fs.existsSync(d);
    } catch {
      return false;
    }
  });
}

function getCandidateCmapDirs(): string[] {
  const dirs = [
    path.join(process.cwd(), "assets", "cmaps"),
    path.join(process.cwd(), "dist", "assets", "cmaps"),
    path.resolve(__dirname, "../../assets/cmaps"),
    path.resolve(__dirname, "../assets/cmaps"),
    path.resolve(__dirname, "assets/cmaps"),
    path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps"),
    path.resolve(__dirname, "../../node_modules/pdfjs-dist/cmaps"),
    path.resolve(__dirname, "../node_modules/pdfjs-dist/cmaps"),
  ];
  return dirs.filter((d) => {
    try {
      return fs.existsSync(d);
    } catch {
      return false;
    }
  });
}

function getStandardFontDataUrl(): string {
  const candidate = getCandidateFontDirs()[0];
  if (candidate) {
    return candidate.endsWith(path.sep) ? candidate : `${candidate}${path.sep}`;
  }
  return path.join(process.cwd(), "assets", "standard_fonts") + path.sep;
}

function getCMapUrl(): string {
  const candidate = getCandidateCmapDirs()[0];
  if (candidate) {
    return candidate.endsWith(path.sep) ? candidate : `${candidate}${path.sep}`;
  }
  return path.join(process.cwd(), "assets", "cmaps") + path.sep;
}

class ResilientStandardFontDataFactory {
  baseUrl: string;
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || "";
  }
  async fetch({ filename }: { filename: string }): Promise<Uint8Array> {
    if (fontCache.has(filename)) {
      return fontCache.get(filename)!;
    }
    // 1. Try candidate local filesystem directories
    for (const dir of getCandidateFontDirs()) {
      try {
        const fullPath = path.join(dir, filename);
        if (fs.existsSync(fullPath)) {
          const buf = fs.readFileSync(fullPath);
          const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
          fontCache.set(filename, data);
          return data;
        }
      } catch {}
    }
    // 2. Try Windows system fonts as aliases for Helvetica/LiberationSans
    if (process.platform === "win32") {
      try {
        const winFontDir = path.join(process.env.WINDIR || "C:\\Windows", "Fonts");
        let winFontFile: string | null = null;
        const lower = filename.toLowerCase();
        if (lower.includes("bolditalic")) {
          winFontFile = "arialbi.ttf";
        } else if (lower.includes("bold")) {
          winFontFile = "arialbd.ttf";
        } else if (lower.includes("italic")) {
          winFontFile = "ariali.ttf";
        } else if (lower.includes("sans") || lower.includes("foxitfixed")) {
          winFontFile = "arial.ttf";
        }
        if (winFontFile) {
          const fullPath = path.join(winFontDir, winFontFile);
          if (fs.existsSync(fullPath)) {
            const buf = fs.readFileSync(fullPath);
            const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
            fontCache.set(filename, data);
            return data;
          }
        }
      } catch {}
    }
    // 3. Fallback to CDN fetch
    const cdnUrls = [
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/${filename}`,
      `https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/${filename}`,
    ];
    for (const url of cdnUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const ab = await res.arrayBuffer();
          const data = new Uint8Array(ab);
          fontCache.set(filename, data);
          return data;
        }
      } catch {}
    }
    throw new Error(`Unable to load standard font: ${filename}`);
  }
}

class ResilientCMapReaderFactory {
  baseUrl: string;
  isCompressed: boolean;
  constructor(baseUrl?: string, isCompressed = true) {
    this.baseUrl = baseUrl || "";
    this.isCompressed = isCompressed;
  }
  async fetch({ name }: { name: string }): Promise<{ cMapData: Uint8Array; compressionType: number }> {
    const filename = `${name}.bcmap`;
    if (cmapCache.has(filename)) {
      return { cMapData: cmapCache.get(filename)!, compressionType: 1 };
    }
    for (const dir of getCandidateCmapDirs()) {
      try {
        const fullPath = path.join(dir, filename);
        if (fs.existsSync(fullPath)) {
          const buf = fs.readFileSync(fullPath);
          const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
          cmapCache.set(filename, data);
          return { cMapData: data, compressionType: 1 };
        }
      } catch {}
    }
    try {
      const cdnUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/${filename}`;
      const res = await fetch(cdnUrl);
      if (res.ok) {
        const data = new Uint8Array(await res.arrayBuffer());
        cmapCache.set(filename, data);
        return { cMapData: data, compressionType: 1 };
      }
    } catch {}
    throw new Error(`Unable to load cMap: ${name}`);
  }
}

function createNapiCanvasFactory(napiCanvas: any) {
  return {
    create(width: number, height: number) {
      const canvas = napiCanvas.createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
      const context = canvas.getContext("2d");
      return { canvas, context };
    },
    reset(canvasAndContext: { canvas: any; context: any }, width: number, height: number) {
      canvasAndContext.canvas.width = Math.max(1, Math.round(width));
      canvasAndContext.canvas.height = Math.max(1, Math.round(height));
    },
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
 * Renders the first page of ANY PDF buffer (text, fonts, vectors, Word docs, photos)
 * into a high-quality JPEG image buffer.
 */
export async function renderPdfFirstPage(
  pdfBuffer: Buffer,
  targetWidth = 900,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  // 1. Full PDF rasterization via @napi-rs/canvas + pdfjs-dist
  // Always rasterizes the complete first page (all text, fonts, tables, barcodes, and graphics)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const napiCanvas = require("@napi-rs/canvas");
    ensureCanvasPolyfills(napiCanvas);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
    const fontDir = getStandardFontDataUrl();
    const cMapUrl = getCMapUrl();
    const canvasFactory = createNapiCanvasFactory(napiCanvas);

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      standardFontDataUrl: fontDir,
      StandardFontDataFactory: ResilientStandardFontDataFactory,
      cMapUrl,
      cMapPacked: true,
      CMapReaderFactory: ResilientCMapReaderFactory,
      disableFontFace: false,
      canvasFactory,
    });

    const pdfDoc = await loadingTask.promise;
    if (!pdfDoc || pdfDoc.numPages < 1) return null;

    const page = await pdfDoc.getPage(1);
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
    return { buffer, mimeType: "image/jpeg" };
  } catch (error) {
    console.warn("[renderPdfFirstPage] Fallback: Could not rasterize PDF page 1:", error);
    // 2. Fallback: Only extract embedded image if rasterization failed completely
    // AND the extracted image is large enough to represent a full page (not a tiny icon or logo)
    try {
      const fallback = await extractImageFromPdf(pdfBuffer);
      if (fallback?.buffer) {
        const meta = await sharp(fallback.buffer).metadata();
        if (meta.width && meta.height && meta.width >= 400 && meta.height >= 400) {
          return fallback;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }
}
