import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import sharp from "sharp";
import mammoth from "mammoth";
import { getDocumentCacheDirectory } from "./config";
import { logger } from "./logger";
import { extractImageFromPdf } from "./pdf-preview";

export interface ProcessedLocalDocument {
  id: string;
  filename: string;
  cachedPdfPath: string;
  pageCount: number;
  sizeBytes: number;
  previewBase64?: string;
}

const imageExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  ".avif",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
  ".svg",
]);

/**
 * Normalizes an incoming document or image locally on the Windows Desktop Agent,
 * writes the high-resolution printable PDF directly into the local SSD cache,
 * and generates a lightweight preview thumbnail for the customer's phone.
 */
export async function processAndCacheDocument(
  rawBuffer: Buffer,
  rawFilename: string,
  mimetype: string,
): Promise<ProcessedLocalDocument> {
  const documentId = crypto.randomUUID();
  const cacheDir = getDocumentCacheDirectory();
  const cachedPdfPath = path.join(cacheDir, `doc_${documentId}.pdf`);
  const ext = path.extname(rawFilename).toLowerCase();

  const isPdf = ext === ".pdf" || mimetype.includes("pdf");
  const isImage = !isPdf && (mimetype.startsWith("image/") || imageExtensions.has(ext));
  const isWord = !isPdf && !isImage && (ext === ".docx" || ext === ".doc");

  if (!isPdf && !isImage && !isWord) {
    throw new Error(
      "unsupported file type. Please send a PDF, image (JPG/PNG/HEIC), or Word document (.docx).",
    );
  }

  let finalPdfBuffer: Buffer;
  let pageCount = 1;
  let previewBuffer: Buffer | undefined;

  if (isPdf) {
    finalPdfBuffer = rawBuffer;

    // Check encryption and extract page count
    try {
      const pdf = await PDFDocument.load(rawBuffer, { ignoreEncryption: false });
      if (pdf.isEncrypted) {
        throw new Error("Document is password-protected. Please unlock or send an unprotected copy.");
      }
      pageCount = pdf.getPageCount();
    } catch (pdfErr) {
      const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
      if (msg.includes("password") || msg.includes("encrypted") || msg.includes("Password")) {
        throw new Error("Document is password-protected. Please unlock or send an unprotected copy.");
      }
      // Fallback regex page count extraction
      const text = rawBuffer.toString("latin1");
      const rootMatches = text.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
      if (rootMatches && rootMatches[1]) {
        pageCount = parseInt(rootMatches[1], 10);
      } else {
        const pageMatches = text.match(/\/Type\s*\/Page\b(?!\s*s)/g);
        pageCount = pageMatches && pageMatches.length > 0 ? pageMatches.length : 1;
      }
    }

    // Try extracting page 1 thumbnail from PDF
    try {
      const extracted = await extractImageFromPdf(rawBuffer);
      if (extracted?.buffer) {
        previewBuffer = await sharp(extracted.buffer, { limitInputPixels: 268402689 })
          .rotate()
          .resize({ width: 800, height: 1100, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
      }
    } catch {
      // ignore
    }
  } else if (isImage) {
    // Normalize image: rotate EXIF, tone-map HDR/Display-P3 to sRGB, flatten transparency onto white
    const baseSharp = sharp(rawBuffer, { limitInputPixels: 268402689 })
      .rotate()
      .toColorspace("srgb")
      .flatten({ background: "white" });

    // Generate high-quality JPEG for PDF embedding & thumbnail for mobile preview in parallel
    const [processedJpeg, thumbBuf] = await Promise.all([
      baseSharp.clone().jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer(),
      baseSharp
        .clone()
        .resize({ width: 800, height: 1100, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer(),
    ]);

    previewBuffer = thumbBuf;

    // Embed high-res image into standard A4 PDF sheet
    const pdf = await PDFDocument.create();
    const embeddedImage = await pdf.embedJpg(processedJpeg);
    const page = pdf.addPage([595.28, 841.89]);
    const scale = Math.min(523.28 / embeddedImage.width, 769.89 / embeddedImage.height);
    const width = embeddedImage.width * scale;
    const height = embeddedImage.height * scale;
    page.drawImage(embeddedImage, {
      x: (595.28 - width) / 2,
      y: (841.89 - height) / 2,
      width,
      height,
    });

    finalPdfBuffer = Buffer.from(await pdf.save());
    pageCount = 1;
  } else {
    // Word (.docx / .doc) document conversion
    try {
      const htmlResult = await mammoth.convertToHtml({ buffer: rawBuffer });
      const html = htmlResult.value ?? "";
      finalPdfBuffer = await renderWordHtmlToPdf(html, rawFilename);
      const pdf = await PDFDocument.load(finalPdfBuffer, { ignoreEncryption: true });
      pageCount = pdf.getPageCount();
    } catch {
      throw new Error(`Could not convert "${rawFilename}" to PDF. Please export your Word file as a PDF and send again.`);
    }
  }

  // Atomic write to local SSD cache (prevent partial reads during write)
  const tmpPath = `${cachedPdfPath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, finalPdfBuffer);
  fs.renameSync(tmpPath, cachedPdfPath);

  logger.info(
    `Cached document "${rawFilename}" locally as doc_${documentId}.pdf (${pageCount} pages, ${(finalPdfBuffer.length / 1024 / 1024).toFixed(1)} MB)`,
  );

  return {
    id: documentId,
    filename: rawFilename,
    cachedPdfPath,
    pageCount,
    sizeBytes: finalPdfBuffer.length,
    previewBase64: previewBuffer ? `data:image/jpeg;base64,${previewBuffer.toString("base64")}` : undefined,
  };
}

/**
 * Word-wraps text into lines that fit within a specified point width.
 */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const rawParagraphs = text.split(/\r?\n/);

  for (const para of rawParagraphs) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }

    const words = para.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      let width = 0;
      try {
        width = font.widthOfTextAtSize(testLine, fontSize);
      } catch {
        width = testLine.length * (fontSize * 0.55);
      }

      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = "";
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

/**
 * Clean text for WinAnsi / standard Helvetica font.
 */
function sanitizeText(str: string): string {
  return str
    .replace(/[^\x20-\x7E\r\n\t]/g, " ")
    .replace(/\t/g, "    ");
}

/**
 * Renders DOCX HTML content to an A4 PDF document.
 */
async function renderWordHtmlToPdf(html: string, filename: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const a4Width = 595.28;
  const a4Height = 841.89;
  const margin = 45;
  const contentWidth = a4Width - margin * 2;
  const topMargin = 50;
  const bottomMargin = 45;

  let currentPage: PDFPage = pdfDoc.addPage([a4Width, a4Height]);
  let currentY = a4Height - topMargin;

  function ensureSpace(requiredHeight: number): PDFPage {
    if (currentY - requiredHeight < bottomMargin) {
      currentPage = pdfDoc.addPage([a4Width, a4Height]);
      currentY = a4Height - topMargin;
    }
    return currentPage;
  }

  const plainText = sanitizeText(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .trim(),
  );

  const lines = wrapText(plainText || `[${filename}]`, font, 11, contentWidth);

  for (const line of lines) {
    if (!line.trim()) {
      currentY -= 8;
      continue;
    }
    ensureSpace(16);
    currentPage.drawText(line, {
      x: margin,
      y: currentY - 11,
      size: 11,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });
    currentY -= 16;
  }

  return Buffer.from(await pdfDoc.save());
}
