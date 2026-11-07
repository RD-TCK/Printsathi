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
});

