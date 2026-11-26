import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

const tempCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "printiva-i3-stress-cache-"));

vi.mock("./config", () => ({
  getDocumentCacheDirectory: () => tempCacheRoot,
}));

vi.mock("./pdf-preview", () => ({
  extractImageFromPdf: vi.fn().mockResolvedValue(null),
  renderPdfFirstPage: vi.fn().mockResolvedValue(null),
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  getLocalDocProcessorStats,
  getRecommendedConversionConcurrency,
  processAndCacheDocument,
  resetLocalDocProcessorStats,
} from "./local-doc-processor";

describe("Low-End i3 Global Conversion Throttling (10 senders x 10-12 docs across multiple loops)", () => {
  afterEach(() => {
    for (const file of fs.readdirSync(tempCacheRoot)) {
      try {
        fs.unlinkSync(path.join(tempCacheRoot, file));
      } catch {}
    }
  });

  it("caps global conversion concurrency across 3 bursts of 60 concurrent documents without dropping a single file", async () => {
    const samplePdf = await PDFDocument.create();
    samplePdf.addPage([595, 842]);
    const pdfBytes = Buffer.from(await samplePdf.save());

    for (let loop = 1; loop <= 3; loop++) {
      resetLocalDocProcessorStats();

      // Simulate 10 senders x 6 documents = 60 simultaneous processAndCacheDocument bursts
      const tasks = Array.from({ length: 60 }, (_, idx) => {
        const isText = idx % 3 === 0;
        return processAndCacheDocument(
          isText ? Buffer.from(`Loop ${loop} receipt line for order ${idx}`) : pdfBytes,
          isText ? `note_${loop}_${idx}.txt` : `doc_${loop}_${idx}.pdf`,
          isText ? "text/plain" : "application/pdf",
        );
      });

      const results = await Promise.all(tasks);
      const stats = getLocalDocProcessorStats();

      expect(results).toHaveLength(60);
      for (const item of results) {
        expect(item.pageCount).toBe(1);
        expect(fs.existsSync(item.cachedPdfPath)).toBe(true);
      }

      // Must never exceed the global conversion semaphore limit (2-3 max regardless of 60 concurrent calls)
      expect(stats.conversion.peakActive).toBeLessThanOrEqual(getRecommendedConversionConcurrency());
      expect(stats.conversion.active).toBe(0);
      expect(stats.conversion.queued).toBe(0);
    }
  });
});
