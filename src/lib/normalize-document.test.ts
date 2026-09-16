import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { normalizeDocument } from "./normalize-document";
describe("server document normalization", () => {
  it("preserves real PDF pages", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
    const result = await normalizeDocument(new File([Buffer.from(await pdf.save())], "two-pages.pdf"));
    expect(result.pageCount).toBe(2); expect(result.filename).toBe("two-pages.pdf");
  });
  it("embeds image content in a printable A4 PDF", async () => {
    const png = await sharp({ create: { width: 80, height: 120, channels: 3, background: "red" } }).png().toBuffer();
    const result = await normalizeDocument(new File([new Uint8Array(png)], "photo.png"));
    expect(result.pageCount).toBe(1);
    const pdf = await PDFDocument.load(result.bytes); expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);
    expect(pdf.getPage(0).node.Resources()?.toString()).toContain("XObject");
  });
  it("rejects unsupported and corrupt documents instead of printing placeholders", async () => {
    await expect(normalizeDocument(new File(["data"], "archive.zip"))).rejects.toThrow("unsupported");
    await expect(normalizeDocument(new File(["bad PDF"], "broken.pdf"))).rejects.toThrow("damaged");
  });
  it.skipIf(!process.env.LIBREOFFICE_PATH && !existsSync("C:/Program Files/LibreOffice/program/soffice.exe"))("renders actual Office content including page breaks", async () => {
    const rtf = String.raw`{\rtf1\ansi First actual page\page Second actual page}`;
    const result = await normalizeDocument(new File([rtf], "original.rtf"));
    expect(result.pageCount).toBe(2);
  }, 60000);
});
