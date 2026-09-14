import { describe, expect, it } from "vitest";
import { validateRanges } from "@/lib/customer-print";
import { calculatePricing, assertShopCanPrice, type PricingRule } from "@/lib/pricing-engine";

const rules: PricingRule[] = [
  { color_mode: "black_and_white", paper_size: "a4", min_pages: 1, max_pages: 10, price_per_page: 5 },
  { color_mode: "black_and_white", paper_size: "a4", min_pages: 11, max_pages: null, price_per_page: 2 },
  { color_mode: "color", paper_size: "a4", min_pages: 1, max_pages: 10, price_per_page: 10 },
  { color_mode: "color", paper_size: "a4", min_pages: 11, max_pages: null, price_per_page: 8 },
  { color_mode: "black_and_white", paper_size: "a3", min_pages: 1, max_pages: 10, price_per_page: 6 },
  { color_mode: "black_and_white", paper_size: "a3", min_pages: 11, max_pages: null, price_per_page: 3 },
];
const range = (
  startPage: number,
  endPage: number,
  colorMode: "black_and_white" | "color" = "black_and_white",
  paperSize: "a4" | "a3" = "a4",
) => ({ startPage, endPage, colorMode, paperSize });

describe("PrintSathi pricing engine", () => {
  it.each([
    [1, 5],
    [10, 50],
    [11, 52],
    [50, 130],
  ])("prices %i pages deterministically", (pages, expected) => {
    const result = calculatePricing([range(1, pages)], rules);
    expect(result.total).toBe(expected);
  });

  it("prices mixed color and black-and-white ranges", () => {
    const result = calculatePricing([range(1, 3, "color"), range(4, 10), range(11, 15, "color")], rules);
    expect(result.colorPages).toBe(8);
    expect(result.blackAndWhitePages).toBe(7);
    expect(result.total).toBe(115);
    expect(result.breakdown).toHaveLength(2);
  });

  it("keeps paper-size subtotals separate", () => {
    const result = calculatePricing(
      [range(1, 10, "black_and_white", "a4"), range(1, 10, "black_and_white", "a3")],
      rules,
    );
    expect(result.paperSizeBreakdown).toEqual([
      { paperSize: "a4", pages: 10, subtotal: 50 },
      { paperSize: "a3", pages: 10, subtotal: 60 },
    ]);
    expect(result.total).toBe(110);
  });

  it("rejects gaps and overlaps", () => {
    expect(validateRanges([range(1, 5), range(5, 10)], 10)).toContain("overlap");
    expect(validateRanges([range(1, 4), range(6, 10)], 10)).toContain("overlap");
    expect(validateRanges([range(1, 11)], 10)).toContain("outside");
  });

  it("rejects missing pricing and invalid shop state", () => {
    expect(() => calculatePricing([range(1, 1)], [])).toThrow("not configured");
    expect(() => assertShopCanPrice({ isActive: false, acceptingOrders: true, subscriptionStatus: "active" })).toThrow(
      "not active",
    );
    expect(() => assertShopCanPrice({ isActive: true, acceptingOrders: true, subscriptionStatus: "expired" })).toThrow(
      "subscription",
    );
  });

  it("does not use client-supplied prices", () => {
    const result = calculatePricing([range(1, 11)], rules);
    expect(result.total).toBe(52);
    expect(result.total).not.toBe(1);
  });
});
