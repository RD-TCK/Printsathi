import { z } from "zod";

export const rangeSchema = z.object({
  startPage: z.number().int().min(1),
  endPage: z.number().int().min(1),
  colorMode: z.enum(["black_and_white", "color"]),
  paperSize: z.enum(["a4", "a3", "letter", "legal"]),
});

export const configurationSchema = z.object({
  orderId: z.string().uuid(),
  documentId: z.string().uuid(),
  ranges: z.array(rangeSchema).min(1).max(100),
});

export type PrintRange = z.infer<typeof rangeSchema>;

export function validateRanges(ranges: PrintRange[], pageCount: number) {
  const sorted = [...ranges].sort((a, b) => a.startPage - b.startPage);
  if (sorted.some((range) => range.startPage < 1 || range.endPage > pageCount))
    return "A page range is outside the document.";
  if (!sorted.length || sorted[0].startPage !== 1 || sorted.at(-1)?.endPage !== pageCount)
    return "Ranges must cover every page in the document.";
  for (let index = 0; index < sorted.length; index += 1) {
    const range = sorted[index];
    if (range.startPage > range.endPage || range.endPage > pageCount) return "A page range is outside the document.";
    const next = sorted[index + 1];
    if (next && range.endPage + 1 !== next.startPage) return "Ranges cannot overlap or leave gaps.";
  }
  return null;
}

export function countModes(ranges: PrintRange[]) {
  return ranges.reduce(
    (result, range) => {
      const pages = range.endPage - range.startPage + 1;
      result[range.colorMode] += pages;
      return result;
    },
    { color: 0, black_and_white: 0 },
  );
}
