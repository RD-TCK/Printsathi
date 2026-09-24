import { z } from "zod";

export const rangeSchema = z.object({
  startPage: z.number().int().min(1),
  endPage: z.number().int().min(1),
  colorMode: z.enum(["black_and_white", "color"]),
  paperSize: z.enum(["a4", "a3", "letter", "legal"]),
  sideMode: z.enum(["single_sided", "double_sided"]).default("single_sided"),
  copies: z.coerce.number().int().min(1).max(100).default(1),
});

export const configurationSchema = z.object({
  orderId: z.string().uuid(),
  documentId: z.string().uuid(),
  ranges: z.array(rangeSchema).min(1).max(100),
});

export type PrintRange = z.infer<typeof rangeSchema>;

export function validateRanges(ranges: Array<PrintRange | Record<string, unknown>>, pageCount: number) {
  if (!ranges.length) return "Select at least one page range.";
  const normalized = ranges.map((r) => ({
    startPage: typeof r.startPage === "number" ? r.startPage : parseInt(String(r.startPage ?? ""), 10),
    endPage: typeof r.endPage === "number" ? r.endPage : parseInt(String(r.endPage ?? ""), 10),
    copies: typeof r.copies === "number" ? r.copies : parseInt(String(r.copies ?? "1"), 10),
  }));

  for (let index = 0; index < normalized.length; index += 1) {
    const range = normalized[index];
    if (isNaN(range.startPage) || range.startPage < 1 || range.startPage > pageCount)
      return `Range ${index + 1}: start page must be between 1 and ${pageCount}.`;
    if (isNaN(range.endPage) || range.endPage < range.startPage || range.endPage > pageCount)
      return `Range ${index + 1}: end page must be between ${isNaN(range.startPage) ? 1 : range.startPage} and ${pageCount}.`;
    if (isNaN(range.copies) || range.copies < 1 || range.copies > 100)
      return `Range ${index + 1}: copies must be between 1 and 100.`;
  }

  const sorted = [...normalized].sort((a, b) => a.startPage - b.startPage);
  for (let index = 0; index < sorted.length - 1; index += 1) {
    if (sorted[index].endPage >= sorted[index + 1].startPage)
      return "Page ranges must not overlap.";
  }
  return null;
}

export function countModes(ranges: Array<PrintRange | Record<string, unknown>>): { color: number; black_and_white: number } {
  return ranges.reduce<{ color: number; black_and_white: number }>(
    (result, range) => {
      const copies = Math.max(1, Number(range.copies) || 1);
      const start = Math.max(1, Number(range.startPage) || 1);
      const end = Math.max(start, Number(range.endPage) || start);
      const pages = (end - start + 1) * copies;
      const mode = (range.colorMode as "color" | "black_and_white") === "color" ? "color" : "black_and_white";
      result[mode] += pages;
      return result;
    },
    { color: 0, black_and_white: 0 },
  );
}


