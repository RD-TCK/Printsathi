import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { normalizeDocument } from "./normalize-document";
import { extractImageFromPdf, renderPdfFirstPage } from "./pdf-preview";

describe("PDF Image Preview Extraction & Rasterization", () => {
  it("extracts embedded JPEG from normalized image PDF", async () => {
    const rawJpeg = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const normalized = await normalizeDocument(new File([new Uint8Array(rawJpeg)], "sample.jpg"));
    expect(normalized.pageCount).toBe(1);
    expect(normalized.previewImage).toBeDefined();
    expect(normalized.previewMime).toBe("image/jpeg");

    const extracted = await extractImageFromPdf(normalized.bytes);
    expect(extracted).not.toBeNull();
    expect(extracted?.mimeType).toBe("image/jpeg");

    const meta = await sharp(extracted!.buffer).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it("extracts embedded PNG/raster from normalized image PDF", async () => {
    const rawPng = await sharp({
      create: { width: 120, height: 80, channels: 3, background: { r: 0, g: 128, b: 255 } },
    })
      .png()
      .toBuffer();

    const normalized = await normalizeDocument(new File([new Uint8Array(rawPng)], "sample.png"));
    expect(normalized.pageCount).toBe(1);
    expect(normalized.previewImage).toBeDefined();

    const extracted = await extractImageFromPdf(normalized.bytes);
    expect(extracted).not.toBeNull();

    const meta = await sharp(extracted!.buffer).metadata();
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(80);
  });

  it("renders page 1 of text PDF into high-resolution JPEG preview", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    page.drawText("Invoice #12345", { x: 50, y: 780, size: 24, font });
    page.drawText("Total: 500 INR", { x: 50, y: 740, size: 14, font });
    const pdfBytes = Buffer.from(await doc.save());

    const result = await renderPdfFirstPage(pdfBytes, 800);
    expect(result).not.toBeNull();
    expect(result?.mimeType).toBe("image/jpeg");
    expect(result?.buffer.length).toBeGreaterThan(1000);

    const meta = await sharp(result!.buffer).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(800);
  });

  it("normalizes a PDF file and generates a first-page preview image", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 600]);
    page.drawText("Customer Resume");
    const pdfBytes = Buffer.from(await doc.save());

    const normalized = await normalizeDocument(new File([new Uint8Array(pdfBytes)], "resume.pdf"));
    expect(normalized.pageCount).toBe(1);
    expect(normalized.previewImage).toBeDefined();
    expect(normalized.previewMime).toBe("image/jpeg");
    expect(normalized.previewImage!.length).toBeGreaterThan(500);
  });

  it("renders full page preview for composite PDF with text and embedded small graphics (IRCTC ticket scenario)", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([595, 842]); // Standard A4 page
    page.drawText("Electronic Reservation Slip - IRCTC", { x: 50, y: 800, size: 16, font });
    page.drawText("PNR: 2958565920  Train: 12276/HUMSAFAR EXPRES", { x: 50, y: 770, size: 12, font });
    page.drawText("1. NAVEEN PANDEY  23  M", { x: 50, y: 720, size: 10, font });

    // Tiny 60x20 arrow graphic (simulates the 'Boarding At ->' banner)
    const tinyArrow = await sharp({
      create: { width: 60, height: 20, channels: 3, background: { r: 50, g: 100, b: 200 } },
    })
      .jpeg()
      .toBuffer();

    const embeddedImg = await doc.embedJpg(tinyArrow);
    page.drawImage(embeddedImg, { x: 200, y: 750, width: 60, height: 20 });

    const pdfBytes = Buffer.from(await doc.save());

    // Before the fix, renderPdfFirstPage extracted ONLY the 60x20 arrow!
    const result = await renderPdfFirstPage(pdfBytes, 800);
    expect(result).not.toBeNull();
    expect(result?.mimeType).toBe("image/jpeg");

    const meta = await sharp(result!.buffer).metadata();
    expect(meta.format).toBe("jpeg");
    // Verify it is the full A4 page (~800 x ~1132 px), NOT the 60x20 sub-image!
    expect(meta.width).toBe(800);
    expect(meta.height).toBeGreaterThan(1000);
    expect(result!.buffer.length).toBeGreaterThan(5000);
  });

  it("normalizes a Word (.docx) document and generates a full-page preview image", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file(
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    zip.file(
      "word/document.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Project Proposal - Printiva Services</w:t></w:r></w:p><w:p><w:r><w:t>Section 1: Summary of Operations and Requirements.</w:t></w:r></w:p></w:body></w:document>',
    );
    const docxBytes = await zip.generateAsync({ type: "uint8array" });

    const normalized = await normalizeDocument(new File([Buffer.from(docxBytes)], "proposal.docx"));
    expect(normalized.pageCount).toBeGreaterThanOrEqual(1);
    expect(normalized.previewImage).toBeDefined();
    expect(normalized.previewMime).toBe("image/jpeg");

    const meta = await sharp(normalized.previewImage!).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeGreaterThanOrEqual(600);
    expect(meta.height).toBeGreaterThan(700);
  });
});

