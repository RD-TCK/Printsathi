import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import sharp from "sharp";

import mammoth from "mammoth";

const execute = promisify(execFile);
const officeExtensions = new Set([".doc", ".docx", ".odt", ".rtf", ".ppt", ".pptx", ".odp", ".xls", ".xlsx", ".ods", ".txt", ".csv", ".md"]);
const textExtensions = new Set([".txt", ".csv", ".md"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"]);

export async function normalizeDocument(file: File): Promise<{ bytes: Buffer; pageCount: number; filename: string }> {
  const extension = path.extname(file.name).toLowerCase();
  let bytes: Buffer = Buffer.from(await file.arrayBuffer());

  if (imageExtensions.has(extension)) {
    const png = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().flatten({ background: "white" }).png().toBuffer();
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(png);
    const page = pdf.addPage([595.28, 841.89]);
    const scale = Math.min(523.28 / image.width, 769.89 / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: (595.28 - width) / 2, y: (841.89 - height) / 2, width, height });
    bytes = Buffer.from(await pdf.save());
  } else if (extension === ".docx" || extension === ".doc") {
    // Pure Node.js mammoth pipeline for .docx — zero LibreOffice dependency.
    let converted = false;
    try {
      const htmlResult = await mammoth.convertToHtml({ buffer: bytes });
      const html = htmlResult.value ?? "";

      bytes = Buffer.from(await renderDocxHtmlToPdf(html, file.name));
      converted = true;
    } catch {
      // If mammoth failed (e.g. legacy binary .doc format), try LibreOffice if available
    }

    if (!converted) {
      bytes = Buffer.from(await convertWithLibreOffice(file, extension, bytes));
    }
  } else if (textExtensions.has(extension)) {
    // Plain text, CSV, Markdown — render directly without needing LibreOffice
    const textContent = bytes.toString("utf-8");
    bytes = Buffer.from(await renderTextToPdf(textContent, file.name));
  } else if (officeExtensions.has(extension)) {
    // .odt, .ppt, .pptx, .xls, .xlsx, .ods, .rtf — use LibreOffice
    bytes = Buffer.from(await convertWithLibreOffice(file, extension, bytes));
  } else if (extension !== ".pdf") {
    throw new Error(
      `${file.name}: unsupported file type. Upload a PDF, image (JPG/PNG), Word document (.docx), PowerPoint, Excel, or plain text file.`
    );
  }

  if (bytes.length > 50 * 1024 * 1024) {
    throw new Error(`${file.name}: converted PDF exceeds 50 MB.`);
  }
  let pdf;
  try {
    pdf = await PDFDocument.load(bytes);
  } catch {
    throw new Error(`${file.name} is damaged or password-protected. Upload a readable document.`);
  }
  const pageCount = pdf.getPageCount();
  if (pageCount < 1 || pageCount > 2000) {
    throw new Error(`${file.name} must contain between 1 and 2,000 pages.`);
  }
  return { bytes, pageCount, filename: file.name };
}

/**
 * Converts a Word/Office file to PDF using LibreOffice (headless).
 * Requires LibreOffice installed on the server, or LIBREOFFICE_PATH env var set.
 */
async function convertWithLibreOffice(file: File, extension: string, bytes: Buffer): Promise<Buffer> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "printiva-convert-"));
  try {
    const inputExt = extension === ".md" ? ".txt" : extension;
    const input = path.join(directory, `source${inputExt}`);
    await fs.writeFile(input, bytes);
    const profile = path.join(directory, "profile");
    await fs.mkdir(path.join(profile, "user"), { recursive: true });
    await fs.writeFile(
      path.join(profile, "user", "registrymodifications.xcu"),
      '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>'
    );
    const executable =
      process.env.LIBREOFFICE_PATH ||
      (process.platform === "win32"
        ? "C:\\Program Files\\LibreOffice\\program\\soffice.exe"
        : "libreoffice");
    try {
      await execute(
        executable,
        [
          `-env:UserInstallation=${pathToFileURL(profile).href}`,
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
        { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 }
      );
      return await fs.readFile(path.join(directory, "source.pdf"));
    } catch {
      throw new Error(
        `Could not convert "${file.name}" to PDF. Please export your document as a PDF in Word/PowerPoint/Excel and upload the PDF file instead. Password-protected files are not supported.`
      );
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

/**
 * Decodes all HTML entities into their unicode string representations.
 */
function decodeHtmlEntities(str: string): string {
  const entityMap: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&#39;": "'",
    "&mdash;": " -- ",
    "&ndash;": "-",
    "&hellip;": "...",
    "&bull;": "* ",
    "&lsquo;": "'",
    "&rsquo;": "'",
    "&ldquo;": '"',
    "&rdquo;": '"',
    "&copy;": "(C)",
    "&reg;": "(R)",
    "&trade;": "(TM)",
    "&euro;": "EUR ",
    "&pound;": "GBP ",
    "&yen;": "JPY ",
    "&deg;": " deg",
    "&plusmn;": "+/-",
    "&times;": "x",
    "&divide;": "/",
    "&infin;": "inf",
    "&sect;": "Sec.",
    "&para;": "P.",
  };

  return str
    .replace(/&[a-zA-Z]+;/g, (match) => entityMap[match] ?? match)
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(Number(dec));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return "";
      }
    });
}

/**
 * Maps non-WinAnsi / Unicode symbols and characters to WinAnsi/ASCII equivalents
 * so that pdf-lib's standard Helvetica font NEVER throws encoding errors.
 */
function sanitizeForPdf(text: string): string {
  if (!text) return "";
  let str = decodeHtmlEntities(text);

  // Common Unicode mappings
  const charMap: Record<string, string> = {
    "\u20B9": "Rs. ", // Rupee
    "\u201C": '"',    // Left double quote
    "\u201D": '"',    // Right double quote
    "\u201E": '"',
    "\u201F": '"',
    "\u00AB": '"',
    "\u00BB": '"',
    "\u2018": "'",    // Left single quote
    "\u2019": "'",    // Right single quote
    "\u201A": "'",
    "\u201B": "'",
    "\u2032": "'",
    "\u2033": '"',
    "\u2014": " -- ", // Em dash
    "\u2013": "-",    // En dash
    "\u2015": "-",
    "\u2012": "-",
    "\u2212": "-",
    "\u2022": "* ",   // Bullet
    "\u25E6": "* ",
    "\u25AA": "* ",
    "\u25AB": "* ",
    "\u25CF": "* ",
    "\u25CB": "* ",
    "\u25C6": "* ",
    "\u25C7": "* ",
    "\u27A2": "-> ",
    "\u2794": "-> ",
    "\u279C": "-> ",
    "\u2192": "-> ",
    "\u2190": "<- ",
    "\u2194": "<-> ",
    "\u21D2": "=> ",
    "\u21D0": "<= ",
    "\u21D4": "<=> ",
    "\u2026": "...",
    "\u00A0": " ",
    "\u2000": " ",
    "\u2001": " ",
    "\u2002": " ",
    "\u2003": " ",
    "\u2004": " ",
    "\u2005": " ",
    "\u2006": " ",
    "\u2007": " ",
    "\u2008": " ",
    "\u2009": " ",
    "\u200A": " ",
    "\u202F": " ",
    "\u205F": " ",
    "\u3000": " ",
    "\u200B": "",     // Zero-width space
    "\uFEFF": "",
    "\u200C": "",
    "\u200D": "",
    "\u2713": "[x]",  // Checkmark
    "\u2714": "[x]",
    "\u2717": "[ ]",  // Cross mark
    "\u2715": "[ ]",
    "\u2264": "<=",
    "\u2265": ">=",
    "\u2260": "!=",
    "\u2248": "~",
    "\u221E": "inf",
    "\u00B1": "+/-",
    "\u00D7": "x",
    "\u00F7": "/",
    "\u2122": "(TM)",
    "\u00A9": "(C)",
    "\u00AE": "(R)",
    "\u00B0": " deg",
    "\u00B5": "u",
    "\t": "    ",
  };

  for (const [key, val] of Object.entries(charMap)) {
    if (str.includes(key)) {
      str = str.replaceAll(key, val);
    }
  }

  // Decompose accented characters to base Latin characters (e.g. é -> e)
  str = str.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

  // Replace any remaining non-encodable characters with safe ASCII characters
  const safeChars: string[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Standard printable ASCII (32-126) or newline/tab
    if (code >= 32 && code <= 126) {
      safeChars.push(str[i]);
    } else if (code === 10 || code === 13) {
      safeChars.push("\n");
    } else if (code >= 160 && code <= 255) {
      // Latin-1 supplement
      safeChars.push(str[i]);
    } else {
      // Replace non-Latin/complex Unicode or emojis with a space
      safeChars.push(" ");
    }
  }

  return safeChars.join("");
}

interface DocxBlock {
  type: "heading" | "paragraph" | "list_item" | "table_row" | "image" | "divider";
  level?: number;
  text?: string;
  imageBase64?: string;
  imageMime?: string;
}

/**
 * Parses Mammoth HTML output into an ordered array of renderable document blocks.
 */
function parseMammothHtml(html: string): DocxBlock[] {
  const blocks: DocxBlock[] = [];

  // Match tags of interest: headings, paragraphs, lists, table rows, images, hr
  const tagRegex = /<(h[1-6]|p|li|tr|hr)([^>]*)>([\s\S]*?)<\/\1>|<img\s+([^>]*)\/?>|<hr\s*\/?>/gi;
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

    // Check if innerHtml contains embedded images
    const imgMatches = [...innerHtml.matchAll(/<img\s+[^>]*src\s*=\s*["']data:image\/([^;]+);base64,([^"']+)["'][^>]*\/?>/gi)];
    for (const img of imgMatches) {
      blocks.push({
        type: "image",
        imageMime: img[1].toLowerCase(),
        imageBase64: img[2],
      });
    }

    // Strip HTML tags for text content
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
    } else if (tagName === "tr") {
      // For table rows, separate cells by tab
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

        // If a single word exceeds maxWidth, break it down character-by-character
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

  const a4Width = 595.28;
  const a4Height = 841.89;
  const margin = 45;
  const contentWidth = a4Width - margin * 2;
  const topMargin = 50;
  const bottomMargin = 45;

  const blocks = parseMammothHtml(html);

  // If document was completely empty, add a default paragraph
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

  const pages: PDFPage[] = [];
  let currentPage = pdfDoc.addPage([a4Width, a4Height]);
  pages.push(currentPage);
  let currentY = a4Height - topMargin;

  function ensureSpace(requiredHeight: number): PDFPage {
    if (currentY - requiredHeight < bottomMargin) {
      currentPage = pdfDoc.addPage([a4Width, a4Height]);
      pages.push(currentPage);
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

      // Space before heading
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
      currentY -= 4; // Space after heading
    } else if (block.type === "paragraph") {
      const fontSize = 10.5;
      const lineHeight = 15;
      const paragraphText = sanitizeForPdf(block.text || "");
      const wrapped = wrapText(paragraphText, font, fontSize, contentWidth);

      for (const line of wrapped) {
        if (!line.trim()) {
          currentY -= 6; // Paragraph gap
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
      currentY -= 4; // Space after paragraph
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
        // Normalize image to PNG via sharp
        const pngBuffer = await sharp(imgBuffer, { limitInputPixels: 40000000 })
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
        currentY -= renderHeight + 12;
      } catch {
        // Skip unrenderable embedded image
      }
    }
  }

  // Draw headers and footers on all pages
  const totalPages = pages.length;
  const cleanHeaderName = sanitizeForPdf(path.basename(filename)).slice(0, 50);

  for (let p = 0; p < totalPages; p++) {
    const page = pages[p];

    // Top Header: Document filename
    page.drawText(cleanHeaderName, {
      x: margin,
      y: a4Height - 28,
      size: 8,
      font: boldFont,
      color: rgb(0.4, 0.4, 0.45),
    });

    // Top Header: Page X of Y
    const pageStr = `Page ${p + 1} of ${totalPages}`;
    page.drawText(pageStr, {
      x: a4Width - margin - 55,
      y: a4Height - 28,
      size: 8,
      font,
      color: rgb(0.45, 0.45, 0.5),
    });

    // Header divider line
    page.drawLine({
      start: { x: margin, y: a4Height - 34 },
      end: { x: a4Width - margin, y: a4Height - 34 },
      thickness: 0.5,
      color: rgb(0.88, 0.88, 0.9),
    });

    // Bottom Footer
    page.drawText("Printed with PrintSathi", {
      x: margin,
      y: 20,
      size: 7.5,
      font,
      color: rgb(0.6, 0.6, 0.65),
    });
  }

  return Buffer.from(await pdfDoc.save());
}

/**
 * Renders plain text into a paginated A4 PDF using pdf-lib.
 * Used for .txt, .csv, .md and fallback text rendering.
 */
async function renderTextToPdf(textContent: string, filename: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const a4Width = 595.28;
  const a4Height = 841.89;
  const margin = 45;
  const contentWidth = a4Width - margin * 2;
  const fontSize = 10.5;
  const lineHeight = 15;
  const topMargin = 50;
  const bottomMargin = 40;
  const linesPerPage = Math.floor((a4Height - topMargin - bottomMargin) / lineHeight);

  const sanitized = sanitizeForPdf(textContent);
  const wrappedLines = wrapText(sanitized, font, fontSize, contentWidth);

  const totalPages = Math.max(1, Math.ceil(wrappedLines.length / linesPerPage));
  const cleanHeaderName = sanitizeForPdf(path.basename(filename)).slice(0, 50);

  for (let p = 0; p < totalPages; p++) {
    const page = pdfDoc.addPage([a4Width, a4Height]);

    // Header
    page.drawText(cleanHeaderName, {
      x: margin,
      y: a4Height - 28,
      size: 8,
      font: boldFont,
      color: rgb(0.4, 0.4, 0.45),
    });
    page.drawText(`Page ${p + 1} of ${totalPages}`, {
      x: a4Width - margin - 55,
      y: a4Height - 28,
      size: 8,
      font,
      color: rgb(0.45, 0.45, 0.5),
    });
    page.drawLine({
      start: { x: margin, y: a4Height - 34 },
      end: { x: a4Width - margin, y: a4Height - 34 },
      thickness: 0.5,
      color: rgb(0.88, 0.88, 0.9),
    });

    // Content lines
    const startIdx = p * linesPerPage;
    const endIdx = Math.min(startIdx + linesPerPage, wrappedLines.length);
    let currentY = a4Height - topMargin;
    for (let i = startIdx; i < endIdx; i++) {
      const line = wrappedLines[i];
      if (line) {
        page.drawText(line, {
          x: margin,
          y: currentY - fontSize,
          size: fontSize,
          font,
          color: rgb(0.12, 0.12, 0.15),
        });
      }
      currentY -= lineHeight;
    }

    // Footer
    page.drawText("Printed with PrintSathi", {
      x: margin,
      y: 20,
      size: 7.5,
      font,
      color: rgb(0.6, 0.6, 0.65),
    });
  }

  return Buffer.from(await pdfDoc.save());
}
