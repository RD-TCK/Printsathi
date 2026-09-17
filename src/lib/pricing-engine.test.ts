import { describe, expect, it } from "vitest";
import { validateRanges } from "@/lib/customer-print";
import { calculatePricing, calculatePlatformFee, assertShopCanPrice, type PricingRule } from "@/lib/pricing-engine";

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
  it("calculates platform fee based on total page count tiers", () => {
    expect(calculatePlatformFee(1, "customer_fee")).toBe(0.5);
    expect(calculatePlatformFee(5, "customer_fee")).toBe(0.5);
    expect(calculatePlatformFee(6, "customer_fee")).toBe(1.5);
    expect(calculatePlatformFee(9, "customer_fee")).toBe(1.5);
    expect(calculatePlatformFee(100, "customer_fee")).toBe(1.5);
    expect(calculatePlatformFee(10, "shop_subscription")).toBe(0);
  });

  it.each([
    [1, 5, 0.5, 5.5],
    [5, 25, 0.5, 25.5],
    [10, 50, 1.5, 51.5],
    [11, 52, 1.5, 53.5],
    [50, 130, 1.5, 131.5],
  ])("prices %i pages with customer platform fee", (pages, expectedSubtotal, expectedFee, expectedTotal) => {
    const result = calculatePricing([range(1, pages)], rules, "customer_fee");
    expect(result.subtotal).toBe(expectedSubtotal);
    expect(result.platformFee).toBe(expectedFee);
    expect(result.total).toBe(expectedTotal);
  });

  it("calculates platform fee on total pages across multiple files/ranges", () => {
    // File 1: 1 page, File 2: 8 pages -> Total: 9 pages (>= 6 => ₹1.50 fee)
    const result = calculatePricing([range(1, 1), range(1, 8)], rules, "customer_fee");
    expect(result.subtotal).toBe(45); // (1*5) + (8*5) = 45
    expect(result.platformFee).toBe(1.5);
    expect(result.total).toBe(46.5);
  });

  it("waives customer platform fee in shop_subscription mode", () => {
    const result = calculatePricing([range(1, 10)], rules, "shop_subscription");
    expect(result.subtotal).toBe(50);
    expect(result.platformFee).toBe(0);
    expect(result.total).toBe(50);
  });

  it("prices mixed color and black-and-white ranges", () => {
    const result = calculatePricing([range(1, 3, "color"), range(4, 10), range(11, 15, "color")], rules, "shop_subscription");
    expect(result.colorPages).toBe(8);
    expect(result.blackAndWhitePages).toBe(7);
    expect(result.subtotal).toBe(115);
    expect(result.total).toBe(115);
    expect(result.breakdown).toHaveLength(2);
  });

  it("keeps paper-size subtotals separate", () => {
    const result = calculatePricing(
      [range(1, 10, "black_and_white", "a4"), range(1, 10, "black_and_white", "a3")],
      rules,
      "shop_subscription",
    );
    expect(result.paperSizeBreakdown).toEqual([
      { paperSize: "a4", pages: 10, subtotal: 50 },
      { paperSize: "a3", pages: 10, subtotal: 60 },
    ]);
    expect(result.subtotal).toBe(110);
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
});
