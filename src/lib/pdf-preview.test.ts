import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizeDocument } from "./normalize-document";
import { extractImageFromPdf } from "./pdf-preview";

describe("PDF Image Preview Extraction", () => {
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
});
