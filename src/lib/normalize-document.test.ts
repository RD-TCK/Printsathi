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
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${xmlBody}</w:body></w:document>`
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
    const png = await sharp({ create: { width: 80, height: 120, channels: 3, background: "red" } }).png().toBuffer();
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
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89);
  });

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

  it.skipIf(!process.env.LIBREOFFICE_PATH && !existsSync("C:/Program Files/LibreOffice/program/soffice.exe"))(
    "renders actual Office content including page breaks",
    async () => {
      const rtf = String.raw`{\rtf1\ansi First actual page\page Second actual page}`;
      const result = await normalizeDocument(new File([rtf], "original.rtf"));
      expect(result.pageCount).toBe(2);
    },
    60000
  );
});
