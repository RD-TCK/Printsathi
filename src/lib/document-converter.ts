import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type ConvertedFileResult = {
  file: File;
  pageCount: number;
  originalName: string;
  mimeType: string;
};

/**
 * Converts images, text, and other documents into standard printable PDF files
 * so they can be processed and printed uniformly across all devices and printers.
 */
export async function convertAnyFileToPdf(file: File): Promise<ConvertedFileResult> {
  const fileName = file.name;
  const lowerName = fileName.toLowerCase();

  // 1. Direct PDF
  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();
    return {
      file,
      pageCount,
      originalName: fileName,
      mimeType: "application/pdf",
    };
  }

  // 2. Images (PNG, JPG, JPEG, WEBP, GIF, BMP, SVG)
  if (
    file.type.startsWith("image/") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".webp") ||
    lowerName.endsWith(".bmp")
  ) {
    const pdfDoc = await PDFDocument.create();
    const imageBytes = await file.arrayBuffer();

    let embeddedImage;
    try {
      if (lowerName.endsWith(".png") || file.type === "image/png") {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
      } else if (
        lowerName.endsWith(".jpg") ||
        lowerName.endsWith(".jpeg") ||
        file.type === "image/jpeg" ||
        file.type === "image/jpg"
      ) {
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
      } else {
        // Fallback for WebP / other image formats via Canvas conversion to PNG
        const pngBytes = await convertImageToPngBytes(file);
        embeddedImage = await pdfDoc.embedPng(pngBytes);
      }
    } catch {
      // If direct embed fails, use canvas conversion fallback
      const pngBytes = await convertImageToPngBytes(file);
      embeddedImage = await pdfDoc.embedPng(pngBytes);
    }

    // Standard A4 dimensions in points: 595.28 x 841.89
    const a4Width = 595.28;
    const a4Height = 841.89;
    const margin = 36; // 0.5 inch margins
    const maxWidth = a4Width - margin * 2;
    const maxHeight = a4Height - margin * 2;

    const imgDims = embeddedImage.scale(1);
    const scale = Math.min(maxWidth / imgDims.width, maxHeight / imgDims.height, 1);
    const scaledWidth = imgDims.width * scale;
    const scaledHeight = imgDims.height * scale;

    const page = pdfDoc.addPage([a4Width, a4Height]);
    const x = (a4Width - scaledWidth) / 2;
    const y = (a4Height - scaledHeight) / 2;

    page.drawImage(embeddedImage, {
      x,
      y,
      width: scaledWidth,
      height: scaledHeight,
    });

    const pdfBytes = await pdfDoc.save();
    const convertedFileName = `${fileName.replace(/\.[^/.]+$/, "")}.pdf`;
    const convertedFile = new File([pdfBytes.buffer as ArrayBuffer], convertedFileName, { type: "application/pdf" });

    return {
      file: convertedFile,
      pageCount: 1,
      originalName: fileName,
      mimeType: "application/pdf",
    };
  }

  // 3. Plain Text, CSV, Markdown, Code files
  if (
    file.type.startsWith("text/") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".rtf")
  ) {
    const textContent = await file.text();
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const a4Width = 595.28;
    const a4Height = 841.89;
    const margin = 45;
    const contentWidth = a4Width - margin * 2;
    const fontSize = 11;
    const lineHeight = 16;
    const linesPerPage = Math.floor((a4Height - margin * 2 - 40) / lineHeight);

    // Split text into wrapped lines
    const rawLines = textContent.split(/\r?\n/);
    const wrappedLines: string[] = [];

    for (const rawLine of rawLines) {
      if (!rawLine.trim()) {
        wrappedLines.push("");
        continue;
      }
      const words = rawLine.split(/\s+/);
      let currentLine = "";
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = font.widthOfTextAtSize(testLine, fontSize);
        if (width <= contentWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) wrappedLines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) wrappedLines.push(currentLine);
    }

    const totalPages = Math.max(1, Math.ceil(wrappedLines.length / linesPerPage));

    for (let p = 0; p < totalPages; p++) {
      const page = pdfDoc.addPage([a4Width, a4Height]);
      // Header
      page.drawText(fileName, {
        x: margin,
        y: a4Height - margin,
        size: 9,
        font: boldFont,
        color: rgb(0.3, 0.3, 0.3),
      });

      // Page numbers
      page.drawText(`Page ${p + 1} of ${totalPages}`, {
        x: a4Width - margin - 60,
        y: a4Height - margin,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });

      // Content
      const startIdx = p * linesPerPage;
      const endIdx = Math.min(startIdx + linesPerPage, wrappedLines.length);

      let currentY = a4Height - margin - 30;
      for (let i = startIdx; i < endIdx; i++) {
        const line = wrappedLines[i];
        if (line) {
          page.drawText(line, {
            x: margin,
            y: currentY,
            size: fontSize,
            font,
            color: rgb(0.1, 0.1, 0.1),
          });
        }
        currentY -= lineHeight;
      }
    }

    const pdfBytes = await pdfDoc.save();
    const convertedFileName = `${fileName.replace(/\.[^/.]+$/, "")}.pdf`;
    const convertedFile = new File([pdfBytes.buffer as ArrayBuffer], convertedFileName, { type: "application/pdf" });

    return {
      file: convertedFile,
      pageCount: totalPages,
      originalName: fileName,
      mimeType: "application/pdf",
    };
  }

  // 4. Word Documents (DOCX / DOC) & other formats
  // Create a clean formatted cover & document summary PDF page
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const a4Width = 595.28;
  const a4Height = 841.89;
  const page = pdfDoc.addPage([a4Width, a4Height]);

  page.drawText("PrintSaathi Printable Document", {
    x: 50,
    y: a4Height - 60,
    size: 16,
    font: boldFont,
    color: rgb(0.1, 0.45, 0.25),
  });

  page.drawText(`File: ${fileName}`, {
    x: 50,
    y: a4Height - 100,
    size: 13,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText(`Size: ${(file.size / 1024).toFixed(1)} KB`, {
    x: 50,
    y: a4Height - 125,
    size: 11,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  page.drawText(`Format: ${file.type || "Document"}`, {
    x: 50,
    y: a4Height - 145,
    size: 11,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  // If text could be extracted
  try {
    const sampleText = await file.text();
    if (sampleText && sampleText.trim().length > 0) {
      const cleanSnippet = sampleText.slice(0, 500).replace(/[^\x20-\x7E\n\r]/g, " ");
      page.drawText("Content Preview:", {
        x: 50,
        y: a4Height - 180,
        size: 11,
        font: boldFont,
        color: rgb(0.2, 0.2, 0.2),
      });
      page.drawText(cleanSnippet, {
        x: 50,
        y: a4Height - 200,
        size: 9,
        font,
        color: rgb(0.3, 0.3, 0.3),
        maxWidth: a4Width - 100,
        lineHeight: 14,
      });
    }
  } catch {
    // Binary document format
  }

  const pdfBytes = await pdfDoc.save();
  const convertedFileName = `${fileName.replace(/\.[^/.]+$/, "")}.pdf`;
  const convertedFile = new File([pdfBytes.buffer as ArrayBuffer], convertedFileName, { type: "application/pdf" });

  return {
    file: convertedFile,
    pageCount: 1,
    originalName: fileName,
    mimeType: "application/pdf",
  };
}

/**
 * Helper to convert browser Image to PNG bytes via HTML5 Canvas
 */
async function convertImageToPngBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas 2D context."));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Could not convert image to blob."));
            return;
          }
          blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
        }, "image/png");
      };
      img.onerror = () => reject(new Error("Failed to load image into canvas."));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}
