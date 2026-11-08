import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { normalizeDocument } from "./normalize-document";

// Helper to create a synthetic DOCX file buffer for testing
async function createTestDocxBuffer(xmlBody: string): Promise<Uint8Array> {
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
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${xmlBody}</w:body></w:document>`,
  );
  const buffer = await zip.generateAsync({ type: "uint8array" });
  return buffer;
}

describe("server document normalization", () => {
  it("preserves real PDF pages", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    const result = await normalizeDocument(new File([Buffer.from(await pdf.save())], "two-pages.pdf"));
    expect(result.pageCount).toBe(2);
    expect(result.filename).toBe("two-pages.pdf");
  });

  it("embeds image content in a printable A4 PDF", async () => {
    const png = await sharp({ create: { width: 80, height: 120, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    const result = await normalizeDocument(new File([new Uint8Array(png)], "photo.png"));
    expect(result.pageCount).toBe(1);
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);
    expect(pdf.getPage(0).node.Resources()?.toString()).toContain("XObject");
  });

  it("normalizes DOCX files containing special characters and symbols", async () => {
    const bodyXml = `
      <w:p><w:r><w:t>Heading: Document Title</w:t></w:r></w:p>
      <w:p><w:r><w:t>Price: ₹500 for “Premium” service — including discount • fast delivery.</w:t></w:r></w:p>
      <w:p><w:r><w:t>Checklist: ✓ Done ✗ Pending ± 5% error margin.</w:t></w:r></w:p>
    `;
    const docxBytes = await createTestDocxBuffer(bodyXml);
    const file = new File([Buffer.from(docxBytes)], "sample_test.docx");
    const result = await normalizeDocument(file);

    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.filename).toBe("sample_test.docx");

    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(result.pageCount);
    expect(pdf.getPage(0).getWidth()).toBeGreaterThan(500);
    expect(pdf.getPage(0).getHeight()).toBeGreaterThan(700);
  }, 45000);

  it("normalizes plain text and markdown documents without LibreOffice", async () => {
    const text = "Title: Order Notes\nLine 1: Note details\nLine 2: Important instructions";
    const file = new File([text], "notes.txt");
    const result = await normalizeDocument(file);

    expect(result.pageCount).toBe(1);
    expect(result.filename).toBe("notes.txt");
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it("rejects unsupported and corrupt documents instead of printing placeholders", async () => {
    await expect(normalizeDocument(new File(["data"], "archive.zip"))).rejects.toThrow("unsupported");
    await expect(normalizeDocument(new File(["bad PDF"], "broken.pdf"))).rejects.toThrow("damaged");
  });

  it("rejects password-protected PDFs with explicit password message", async () => {
    const encryptedPdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n4 0 obj\n<< /Filter /Standard /V 2 /R 3 /O (xxx) /U (yyy) /P -4 >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 4 0 R >>\n%%EOF";
    await expect(normalizeDocument(new File([encryptedPdf], "locked.pdf"))).rejects.toThrow("password-protected");
  });

  it("auto-rotates mobile photos with EXIF orientation metadata to upright A4", async () => {
    // 400x200 image with orientation 6 (portrait shot on phone, should be upright 200x400)
    const rawJpeg = await sharp({
      create: { width: 400, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const result = await normalizeDocument(new File([new Uint8Array(rawJpeg)], "phone_shot.jpg"));
    expect(result.pageCount).toBe(1);
    const pdf = await PDFDocument.load(result.bytes);
    const page = pdf.getPage(0);
    // Because it was rotated upright (200w x 400h), page should be Portrait A4 (595.28 width, 841.89 height)
    expect(page.getWidth()).toBeCloseTo(595.28);
    expect(page.getHeight()).toBeCloseTo(841.89);
  });

  it("flattens transparent PNG images on clean white background", async () => {
    // Transparent PNG with alpha channel
    const transparentPng = await sharp({
      create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0.5 } },
    })
      .png()
      .toBuffer();

    const result = await normalizeDocument(new File([new Uint8Array(transparentPng)], "stamp.png"));
    expect(result.pageCount).toBe(1);
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it.skipIf(!process.env.LIBREOFFICE_PATH && !existsSync("C:/Program Files/LibreOffice/program/soffice.exe"))(
    "renders actual Office content including page breaks",
    async () => {
      const rtf = String.raw`{\rtf1\ansi First actual page\page Second actual page}`;
      const result = await normalizeDocument(new File([rtf], "original.rtf"));
      expect(result.pageCount).toBe(2);
    },
    60000,
  );
});
