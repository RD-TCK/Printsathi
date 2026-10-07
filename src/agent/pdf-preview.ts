import sharp from "sharp";
import zlib from "node:zlib";

/**
 * Attempts to extract an embedded JPEG or PNG/Flate image from a PDF buffer.
 * Used when serving image previews for documents that were converted to PDF on the server/agent.
 */
export async function extractImageFromPdf(pdfBuffer: Buffer): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    // 1. Search for JPEG image stream: SOI marker 0xFF 0xD8 0xFF ... 0xFF 0xD9
    let searchStart = 0;
    while (searchStart < pdfBuffer.length) {
      const soi = pdfBuffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]), searchStart);
      if (soi === -1) break;
      const eoi = pdfBuffer.indexOf(Buffer.from([0xff, 0xd9]), soi + 3);
      if (eoi === -1) break;
      const candidate = pdfBuffer.subarray(soi, eoi + 2);
      if (candidate.length > 50) {
        try {
          const meta = await sharp(candidate).metadata();
          if (meta.width && meta.height && meta.format === "jpeg") {
            return { buffer: candidate, mimeType: "image/jpeg" };
          }
        } catch {
          // Not a valid JPEG chunk, continue searching
        }
      }
      searchStart = soi + 3;
    }

    // 2. Search for PNG image stream: PNG header 0x89 0x50 0x4E 0x47
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    let pngSearchStart = 0;
    while (pngSearchStart < pdfBuffer.length) {
      const pngStart = pdfBuffer.indexOf(pngHeader, pngSearchStart);
      if (pngStart === -1) break;
      const iend = pdfBuffer.indexOf(Buffer.from("IEND"), pngStart + 8);
      if (iend === -1) break;
      const candidate = pdfBuffer.subarray(pngStart, iend + 8);
      if (candidate.length > 50) {
        try {
          const meta = await sharp(candidate).metadata();
          if (meta.width && meta.height && meta.format === "png") {
            return { buffer: candidate, mimeType: "image/png" };
          }
        } catch {
          // Not a valid PNG chunk
        }
      }
      pngSearchStart = pngStart + 8;
    }

    // 3. Search for raw FlateDecode Image XObject in PDF
    const pdfText = pdfBuffer.toString("latin1");
    const streamRegex = /<<[\s\S]*?\/Subtype\s*\/Image[\s\S]*?>>\s*stream\r?\n/g;
    let match: RegExpExecArray | null;

    while ((match = streamRegex.exec(pdfText)) !== null) {
      const headerStr = match[0];
      const streamStartIndex = match.index + headerStr.length;
      const endStreamIndex = pdfBuffer.indexOf(Buffer.from("endstream"), streamStartIndex);
      if (endStreamIndex === -1) continue;

      let streamBytes = pdfBuffer.subarray(streamStartIndex, endStreamIndex);
      // Strip trailing CRLF before endstream if present
      if (streamBytes[streamBytes.length - 1] === 0x0a) streamBytes = streamBytes.subarray(0, streamBytes.length - 1);
      if (streamBytes[streamBytes.length - 1] === 0x0d) streamBytes = streamBytes.subarray(0, streamBytes.length - 1);

      const widthMatch = headerStr.match(/\/Width\s+(\d+)/);
      const heightMatch = headerStr.match(/\/Height\s+(\d+)/);
      const width = widthMatch ? parseInt(widthMatch[1], 10) : 0;
      const height = heightMatch ? parseInt(heightMatch[1], 10) : 0;
      const isFlate = headerStr.includes("/FlateDecode");
      const isRGB = headerStr.includes("/DeviceRGB");
      const isGray = headerStr.includes("/DeviceGray");

      if (width > 0 && height > 0 && isFlate) {
        try {
          const inflated = zlib.inflateSync(streamBytes);
          const channels = isRGB ? 3 : isGray ? 1 : 3;
          if (inflated.length >= width * height * channels) {
            const converted = await sharp(inflated.subarray(0, width * height * channels), {
              raw: { width, height, channels },
            })
              .jpeg({ quality: 95 })
              .toBuffer();
            return { buffer: converted, mimeType: "image/jpeg" };
          }
        } catch {
          // Ignore decompression error and try next
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}
