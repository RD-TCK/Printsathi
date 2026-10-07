import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import sharp from "sharp";
import mammoth from "mammoth";
import { getDocumentCacheDirectory } from "./config";
import { logger } from "./logger";
import { extractImageFromPdf } from "./pdf-preview";

const execute = promisify(execFile);

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
  const isWord = !isPdf && !isImage && (ext === ".docx" || ext === ".doc" || ext === ".rtf");

  if (!isPdf && !isImage && !isWord) {
    throw new Error(
      "unsupported file type. Please send a PDF, image (JPG/PNG/HEIC), or Word document (.docx).",
    );
  }

  let finalPdfBuffer: Buffer = Buffer.alloc(0);
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
    // High-Fidelity Word (.docx / .doc / .rtf) document conversion
    let converted = false;

    // 1. High-fidelity conversion via Microsoft Word COM automation (100% exact layout, margins, tables, pagination)
    if (process.platform === "win32") {
      try {
        finalPdfBuffer = await convertWithWord(ext, rawBuffer);
        converted = true;
        logger.info(`⚡ Exact Microsoft Word COM layout conversion succeeded for "${rawFilename}".`);
      } catch (comErr) {
        logger.debug("Microsoft Word COM conversion not available, trying next fallback:", { error: String(comErr) });
      }
    }

    // 2. High-fidelity conversion via LibreOffice headless (if installed)
    if (!converted) {
      try {
        finalPdfBuffer = await convertWithLibreOffice(ext, rawBuffer);
        converted = true;
        logger.info(`⚡ LibreOffice headless conversion succeeded for "${rawFilename}".`);
      } catch (loErr) {
        logger.debug("LibreOffice conversion not available, trying next fallback:", { error: String(loErr) });
      }
    }

    // 3. Pure JS fallback via enhanced Mammoth block parser (preserves headings, tables, lists, code blocks, images)
    if (!converted) {
      try {
        const htmlResult = await mammoth.convertToHtml({ buffer: rawBuffer });
        const html = htmlResult.value ?? "";
        finalPdfBuffer = await renderDocxHtmlToPdf(html, rawFilename);
        converted = true;
        logger.info(`Rendered Word document via enhanced Mammoth block parser for "${rawFilename}".`);
      } catch (mammothErr) {
        logger.error("All Word conversion strategies failed:", { error: mammothErr });
        throw new Error(
          `Could not convert "${rawFilename}" to PDF. Please export your Word file as a PDF and send again.`,
        );
      }
    }

    const pdf = await PDFDocument.load(finalPdfBuffer, { ignoreEncryption: true });
    pageCount = pdf.getPageCount();

    // Try extracting page 1 thumbnail from Word-converted PDF
    try {
      const extracted = await extractImageFromPdf(finalPdfBuffer);
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
 * Converts a Word document directly to PDF using native Microsoft Word COM automation.
 * This guarantees 100% pixel-perfect layout, tables, pagination, margins, and typography.
 */
async function convertWithWord(extension: string, bytes: Buffer): Promise<Buffer> {
  if (process.platform !== "win32") {
    throw new Error("Word COM conversion is only available on Windows.");
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "printiva-word-"));
  try {
    const input = path.join(directory, `source${extension}`);
    const output = path.join(directory, "source.pdf");
    fs.writeFileSync(input, bytes);

    const script = `
$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open('${input.replace(/'/g, "''")}', $false, $true)
  $doc.SaveAs2([ref]'${output.replace(/'/g, "''")}', [ref]17)
  $doc.Close([ref]$false)
  $word.Quit([ref]$false)
} catch {
  if ($doc) { $doc.Close([ref]$false) }
  if ($word) { $word.Quit([ref]$false) }
  throw $_.Exception.Message
} finally {
  if ($doc) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null }
  if ($word) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
}
`;
    await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
      timeout: 60000,
      windowsHide: true,
    });

    if (!fs.existsSync(output)) {
      throw new Error("Word COM conversion did not produce output PDF.");
    }
    return fs.readFileSync(output);
  } finally {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Locates LibreOffice executable path across common Windows locations.
 */
function getLibreOfficePath(): string | null {
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
      process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, "Programs", "LibreOffice", "program", "soffice.exe")
        : "",
      process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, "LibreOffice", "program", "soffice.exe") : "",
      process.env["PROGRAMFILES(X86)"]
        ? path.join(process.env["PROGRAMFILES(X86)"], "LibreOffice", "program", "soffice.exe")
        : "",
    ].filter(Boolean);

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Converts an Office file to PDF using headless LibreOffice if available.
 */
async function convertWithLibreOffice(extension: string, bytes: Buffer): Promise<Buffer> {
  const executable = getLibreOfficePath();
  if (!executable) {
    throw new Error("LibreOffice not found.");
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "printiva-lo-"));
  try {
    const input = path.join(directory, `source${extension}`);
    fs.writeFileSync(input, bytes);
    await execute(
      executable,
      [
        "--headless",
        "--nologo",
        "--nodefault",
        "--norestore",
        "--convert-to",
        "pdf",
        "--outdir",
        directory,
        input,
      ],
      { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    const output = path.join(directory, "source.pdf");
    if (!fs.existsSync(output)) {
      throw new Error("LibreOffice conversion did not produce output PDF.");
    }
    return fs.readFileSync(output);
  } finally {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Replaces non-printable or unsupported PDF font characters with safe ASCII equivalents.
 */
function sanitizeForPdf(rawStr: string): string {
  let str = rawStr;
  const charMap: Record<string, string> = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201C": '"',
    "\u201D": '"',
    "\u2014": " - ",
    "\u2013": "-",
    "\u2026": "...",
    "\u2022": "*",
    "\u00A0": " ",
  };

  for (const [key, val] of Object.entries(charMap)) {
    if (str.includes(key)) {
      str = str.split(key).join(val);
    }
  }

  str = str.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

  const safeChars: string[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      safeChars.push(str[i]);
    } else if (code === 10 || code === 13) {
      safeChars.push("\n");
    } else if (code >= 160 && code <= 255) {
      safeChars.push(str[i]);
    } else {
      safeChars.push(" ");
    }
  }

  return safeChars.join("");
}

interface DocxBlock {
  type: "heading" | "paragraph" | "list_item" | "table_row" | "image" | "divider" | "code_block";
  level?: number;
  text?: string;
  imageBase64?: string;
  imageMime?: string;
}

/**
 * Parses Mammoth HTML output into an ordered array of renderable document blocks.
 * Retains headings, paragraphs, lists, tables, images, dividers, and code blocks.
 */
function parseMammothHtml(html: string): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  const tagRegex =
    /<(h[1-6]|p|li|tr|hr|pre|code|blockquote|div)([^>]*)>([\s\S]*?)<\/\1>|<img\s+([^>]*)\/?>|<hr\s*\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    if (match[0].toLowerCase().startsWith("<img")) {
      const srcMatch = match[0].match(/src\s*=\s*["']data:image\/([^;]+);base64,([^"']+)["']/i);
      if (srcMatch) {
        blocks.push({
          type: "image",
          imageMime: srcMatch[1].toLowerCase(),
          imageBase64: srcMatch[2],
        });
      }
      continue;
    }

    if (match[0].toLowerCase().startsWith("<hr")) {
      blocks.push({ type: "divider" });
      continue;
    }

    const tagName = (match[1] || "").toLowerCase();
    const innerHtml = match[3] || "";

    const imgMatches = [
      ...innerHtml.matchAll(/<img\s+[^>]*src\s*=\s*["']data:image\/([^;]+);base64,([^"']+)["'][^>]*\/?>/gi),
    ];
    for (const img of imgMatches) {
      blocks.push({
        type: "image",
        imageMime: img[1].toLowerCase(),
        imageBase64: img[2],
      });
    }

    const text = innerHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (!text && imgMatches.length > 0) {
      continue;
    }

    if (tagName.startsWith("h")) {
      const level = parseInt(tagName[1], 10) || 1;
      blocks.push({ type: "heading", level, text });
    } else if (tagName === "li") {
      blocks.push({ type: "list_item", text });
    } else if (tagName === "pre" || tagName === "code") {
      if (text) {
        blocks.push({ type: "code_block", text });
      }
    } else if (tagName === "tr") {
      const cellText = innerHtml
        .replace(/<\/td>\s*<td[^>]*>/gi, "\t")
        .replace(/<\/th>\s*<th[^>]*>/gi, "\t")
        .replace(/<[^>]+>/g, "")
        .trim();
      if (cellText) {
        blocks.push({ type: "table_row", text: cellText });
      }
    } else {
      if (text) {
        blocks.push({ type: "paragraph", text });
      }
    }
  }

  return blocks;
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

        let wordWidth = 0;
        try {
          wordWidth = font.widthOfTextAtSize(word, fontSize);
        } catch {
          wordWidth = word.length * (fontSize * 0.55);
        }

        if (wordWidth > maxWidth) {
          let chunk = "";
          for (const char of word) {
            const testChunk = chunk + char;
            let chunkW = 0;
            try {
              chunkW = font.widthOfTextAtSize(testChunk, fontSize);
            } catch {
              chunkW = testChunk.length * (fontSize * 0.55);
            }
            if (chunkW <= maxWidth) {
              chunk = testChunk;
            } else {
              if (chunk) lines.push(chunk);
              chunk = char;
            }
          }
          currentLine = chunk;
        } else {
          currentLine = word;
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

/**
 * Renders DOCX HTML content (with headings, paragraphs, lists, tables, and images) into a paginated A4 PDF.
 */
async function renderDocxHtmlToPdf(html: string, filename: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  const a4Width = 595.28;
  const a4Height = 841.89;
  const margin = 45;
  const contentWidth = a4Width - margin * 2;
  const topMargin = 50;
  const bottomMargin = 45;

  const blocks = parseMammothHtml(html);

  if (blocks.length === 0) {
    const rawClean = sanitizeForPdf(html.replace(/<[^>]+>/g, " ").trim());
    if (rawClean) {
      blocks.push({ type: "paragraph", text: rawClean });
    } else {
      blocks.push({
        type: "paragraph",
        text: `[${filename}]\n\nThis document has been accepted for printing.`,
      });
    }
  }

  let currentPage = pdfDoc.addPage([a4Width, a4Height]);
  let currentY = a4Height - topMargin;

  function ensureSpace(requiredHeight: number): PDFPage {
    if (currentY - requiredHeight < bottomMargin) {
      currentPage = pdfDoc.addPage([a4Width, a4Height]);
      currentY = a4Height - topMargin;
    }
    return currentPage;
  }

  for (const block of blocks) {
    if (block.type === "heading") {
      const level = block.level || 1;
      const fontSize = level === 1 ? 15 : level === 2 ? 13 : 11.5;
      const lineHeight = fontSize + 5;
      const headingText = sanitizeForPdf(block.text || "");
      const wrapped = wrapText(headingText, boldFont, fontSize, contentWidth);

      currentY -= 6;
      for (const line of wrapped) {
        ensureSpace(lineHeight);
        currentPage.drawText(line, {
          x: margin,
          y: currentY - fontSize,
          size: fontSize,
          font: boldFont,
          color: rgb(0.12, 0.12, 0.15),
        });
        currentY -= lineHeight;
      }
      currentY -= 4;
    } else if (block.type === "paragraph") {
      const fontSize = 10.5;
      const lineHeight = 15;
      const paragraphText = sanitizeForPdf(block.text || "");
      const wrapped = wrapText(paragraphText, font, fontSize, contentWidth);

      for (const line of wrapped) {
        if (!line.trim()) {
          currentY -= 6;
          continue;
        }
        ensureSpace(lineHeight);
        currentPage.drawText(line, {
          x: margin,
          y: currentY - fontSize,
          size: fontSize,
          font,
          color: rgb(0.15, 0.15, 0.15),
        });
        currentY -= lineHeight;
      }
      currentY -= 4;
    } else if (block.type === "list_item") {
      const fontSize = 10.5;
      const lineHeight = 15;
      const itemText = sanitizeForPdf(block.text || "");
      const indent = 15;
      const wrapped = wrapText(itemText, font, fontSize, contentWidth - indent);

      for (let i = 0; i < wrapped.length; i++) {
        const line = wrapped[i];
        ensureSpace(lineHeight);
        if (i === 0) {
          currentPage.drawText("*", {
            x: margin + 3,
            y: currentY - fontSize,
            size: fontSize,
            font: boldFont,
            color: rgb(0.2, 0.4, 0.8),
          });
        }
        currentPage.drawText(line, {
          x: margin + indent,
          y: currentY - fontSize,
          size: fontSize,
          font,
          color: rgb(0.15, 0.15, 0.15),
        });
        currentY -= lineHeight;
      }
    } else if (block.type === "table_row") {
      const fontSize = 10;
      const lineHeight = 14;
      const rowText = sanitizeForPdf(block.text || "");
      const wrapped = wrapText(rowText, font, fontSize, contentWidth);

      for (const line of wrapped) {
        ensureSpace(lineHeight);
        currentPage.drawText(line, {
          x: margin + 6,
          y: currentY - fontSize,
          size: fontSize,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
        currentY -= lineHeight;
      }
    } else if (block.type === "code_block") {
      const fontSize = 9;
      const lineHeight = 13;
      const codeText = sanitizeForPdf(block.text || "");
      const wrapped = wrapText(codeText, monoFont, fontSize, contentWidth - 12);

      currentY -= 4;
      for (const line of wrapped) {
        ensureSpace(lineHeight);
        currentPage.drawText(line, {
          x: margin + 6,
          y: currentY - fontSize,
          size: fontSize,
          font: monoFont,
          color: rgb(0.12, 0.18, 0.28),
        });
        currentY -= lineHeight;
      }
      currentY -= 4;
    } else if (block.type === "divider") {
      ensureSpace(12);
      currentPage.drawLine({
        start: { x: margin, y: currentY - 6 },
        end: { x: a4Width - margin, y: currentY - 6 },
        thickness: 0.75,
        color: rgb(0.8, 0.8, 0.85),
      });
      currentY -= 12;
    } else if (block.type === "image" && block.imageBase64) {
      try {
        const imgBuffer = Buffer.from(block.imageBase64, "base64");
        const pngBuffer = await sharp(imgBuffer, { limitInputPixels: 268402689 })
          .rotate()
          .flatten({ background: "white" })
          .png()
          .toBuffer();

        const embeddedImage = await pdfDoc.embedPng(pngBuffer);
        const maxImgWidth = contentWidth;
        const maxImgHeight = 350;
        const scale = Math.min(maxImgWidth / embeddedImage.width, maxImgHeight / embeddedImage.height, 1);
        const renderWidth = embeddedImage.width * scale;
        const renderHeight = embeddedImage.height * scale;

        ensureSpace(renderHeight + 10);
        const imgX = margin + (contentWidth - renderWidth) / 2;
        currentPage.drawImage(embeddedImage, {
          x: imgX,
          y: currentY - renderHeight,
          width: renderWidth,
          height: renderHeight,
        });
        currentY -= renderHeight + 10;
      } catch {
        // Continue if embedded image is unreadable
      }
    }
  }

  return Buffer.from(await pdfDoc.save());
}
