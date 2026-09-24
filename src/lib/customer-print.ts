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

export function validateRanges(ranges: PrintRange[], pageCount: number) {
  if (!ranges.length) return "Select at least one page range.";
  const sorted = [...ranges].sort((a, b) => a.startPage - b.startPage);
  for (let index = 0; index < sorted.length; index += 1) {
    const range = sorted[index];
    if (range.startPage < 1 || range.startPage > pageCount)
      return `Range ${index + 1}: start page must be between 1 and ${pageCount}.`;
    if (range.endPage < range.startPage || range.endPage > pageCount)
      return `Range ${index + 1}: end page must be between ${range.startPage} and ${pageCount}.`;
    if (range.copies !== undefined && (range.copies < 1 || range.copies > 100))
      return `Range ${index + 1}: copies must be between 1 and 100.`;
    const next = sorted[index + 1];
    if (next && range.endPage >= next.startPage)
      return "Page ranges must not overlap.";
  }
  return null;
}

export function countModes(ranges: PrintRange[]) {
  return ranges.reduce(
    (result, range) => {
      const copies = Math.max(1, range.copies ?? 1);
      const pages = (range.endPage - range.startPage + 1) * copies;
      result[range.colorMode] += pages;
      return result;
    },
    { color: 0, black_and_white: 0 },
  );
}
