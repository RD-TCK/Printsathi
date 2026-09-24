import { describe, expect, it } from "vitest";
import { validateRanges } from "@/lib/customer-print";
import { calculatePricing, calculatePlatformFee, assertShopCanPrice, type PricingRule } from "@/lib/pricing-engine";

const rules: PricingRule[] = [
  { color_mode: "black_and_white", paper_size: "a4", side_mode: "single_sided", min_pages: 1, max_pages: 10, price_per_page: 5 },
  { color_mode: "black_and_white", paper_size: "a4", side_mode: "single_sided", min_pages: 11, max_pages: null, price_per_page: 2 },
  { color_mode: "black_and_white", paper_size: "a4", side_mode: "double_sided", min_pages: 1, max_pages: 10, price_per_page: 3 },
  { color_mode: "black_and_white", paper_size: "a4", side_mode: "double_sided", min_pages: 11, max_pages: null, price_per_page: 1.5 },
  { color_mode: "color", paper_size: "a4", side_mode: "single_sided", min_pages: 1, max_pages: 10, price_per_page: 10 },
  { color_mode: "color", paper_size: "a4", side_mode: "single_sided", min_pages: 11, max_pages: null, price_per_page: 8 },
  { color_mode: "black_and_white", paper_size: "a3", side_mode: "single_sided", min_pages: 1, max_pages: 10, price_per_page: 6 },
  { color_mode: "black_and_white", paper_size: "a3", side_mode: "single_sided", min_pages: 11, max_pages: null, price_per_page: 3 },
];

const range = (
  startPage: number,
  endPage: number,
  colorMode: "black_and_white" | "color" = "black_and_white",
  paperSize: "a4" | "a3" = "a4",
  sideMode: "single_sided" | "double_sided" = "single_sided",
  copies: number = 1,
) => ({ startPage, endPage, colorMode, paperSize, sideMode, copies });

describe("Printiva pricing engine", () => {
  it("calculates platform fee as zero", () => {
    expect(calculatePlatformFee(1, "customer_fee")).toBe(0);
    expect(calculatePlatformFee(5, "customer_fee")).toBe(0);
    expect(calculatePlatformFee(6, "customer_fee")).toBe(0);
    expect(calculatePlatformFee(9, "customer_fee")).toBe(0);
    expect(calculatePlatformFee(100, "customer_fee")).toBe(0);
    expect(calculatePlatformFee(10, "shop_subscription")).toBe(0);
  });

  it.each([
    [1, 5, 0, 5],
    [5, 25, 0, 25],
    [10, 50, 0, 50],
    [11, 22, 0, 22],
    [50, 100, 0, 100],
  ])("prices %i pages with exact subtotal", (pages, expectedSubtotal, expectedFee, expectedTotal) => {
    const result = calculatePricing([range(1, pages)], rules, "customer_fee");
    expect(result.subtotal).toBe(expectedSubtotal);
    expect(result.platformFee).toBe(expectedFee);
    expect(result.total).toBe(expectedTotal);
  });

  it("calculates multi-copy pricing correctly for whole document (e.g. 4 pages with 2 or 3 copies)", () => {
    // 4 pages with 2 copies = 8 printed pages. In 1-10 tier @ ₹5/page => 8 * 5 = ₹40.
    const result2Copies = calculatePricing([range(1, 4, "black_and_white", "a4", "single_sided", 2)], rules, "customer_fee");
    expect(result2Copies.totalPages).toBe(8);
    expect(result2Copies.blackAndWhitePages).toBe(8);
    expect(result2Copies.subtotal).toBe(40);
    expect(result2Copies.total).toBe(40);

    // 4 pages with 3 copies = 12 printed pages. In 11+ tier @ ₹2/page => 12 * 2 = ₹24.
    const result3Copies = calculatePricing([range(1, 4, "black_and_white", "a4", "single_sided", 3)], rules, "customer_fee");
    expect(result3Copies.totalPages).toBe(12);
    expect(result3Copies.blackAndWhitePages).toBe(12);
    expect(result3Copies.subtotal).toBe(24);
    expect(result3Copies.total).toBe(24);
  });

  it("calculates partial page printing with copies (e.g. 4 page PDF, only 2 pages printed)", () => {
    // 4-page PDF, but only pages 1 to 2 printed with 1 copy = 2 pages @ ₹5 = ₹10
    const resultPartial1 = calculatePricing([range(1, 2, "black_and_white", "a4", "single_sided", 1)], rules, "customer_fee");
    expect(resultPartial1.totalPages).toBe(2);
    expect(resultPartial1.subtotal).toBe(10);
    expect(resultPartial1.total).toBe(10);

    // 4-page PDF, only pages 1 to 2 printed with 2 copies = 4 pages @ ₹5 = ₹20
    const resultPartial2 = calculatePricing([range(1, 2, "black_and_white", "a4", "single_sided", 2)], rules, "customer_fee");
    expect(resultPartial2.totalPages).toBe(4);
    expect(resultPartial2.subtotal).toBe(20);
    expect(resultPartial2.total).toBe(20);
  });

  it("calculates custom multi-copy breakdown (e.g. 2 copies of page 2 and 1 copy for pages 1, 3, 4)", () => {
    // Page 1 (1 copy) = 1 page
    // Page 2 (2 copies) = 2 pages
    // Pages 3–4 (1 copy) = 2 pages
    // Total = 5 printed pages @ ₹5 = ₹25
    const resultMixed = calculatePricing(
      [
        range(1, 1, "black_and_white", "a4", "single_sided", 1),
        range(2, 2, "black_and_white", "a4", "single_sided", 2),
        range(3, 4, "black_and_white", "a4", "single_sided", 1),
      ],
      rules,
      "customer_fee"
    );
    expect(resultMixed.totalPages).toBe(5);
    expect(resultMixed.blackAndWhitePages).toBe(5);
    expect(resultMixed.subtotal).toBe(25);
    expect(resultMixed.total).toBe(25);
  });

  it("calculates double-sided (both sides) pricing with separate rates", () => {
    // 10 pages double-sided: 10 * ₹3.00 = ₹30.00 (Single-sided would be ₹50.00)
    const result10 = calculatePricing([range(1, 10, "black_and_white", "a4", "double_sided")], rules, "customer_fee");
    expect(result10.doubleSidedPages).toBe(10);
    expect(result10.singleSidedPages).toBe(0);
    expect(result10.subtotal).toBe(30);
    expect(result10.total).toBe(30);

    // 20 pages double-sided: 20 * ₹1.50 = ₹30.00 (11+ tier @ ₹1.50)
    const result20 = calculatePricing([range(1, 20, "black_and_white", "a4", "double_sided")], rules, "customer_fee");
    expect(result20.doubleSidedPages).toBe(20);
    expect(result20.subtotal).toBe(30);
    expect(result20.total).toBe(30);
  });

  it("falls back to single-sided rule when explicit double-sided rule is not configured", () => {
    // Color A4 has only single-sided rules configured in `rules`
    const result = calculatePricing([range(1, 5, "color", "a4", "double_sided")], rules, "customer_fee");
    expect(result.subtotal).toBe(50); // 5 * ₹10 (fallback to single-sided rate)
    expect(result.doubleSidedPages).toBe(5);
    expect(result.total).toBe(50);
  });

  it("calculates tier rate on total pages across multiple files/ranges without extra fee", () => {
    // File 1: 1 page, File 2: 8 pages -> Total: 9 pages (<= 10 pages => ₹5 tier)
    const result = calculatePricing([range(1, 1), range(1, 8)], rules, "customer_fee");
    expect(result.subtotal).toBe(45); // 9 pages * 5
    expect(result.platformFee).toBe(0);
    expect(result.total).toBe(45);
  });

  it("waives customer platform fee in shop_subscription mode", () => {
    const result = calculatePricing([range(1, 10)], rules, "shop_subscription");
    expect(result.subtotal).toBe(50);
    expect(result.platformFee).toBe(0);
    expect(result.total).toBe(50);
  });

  it("correctly calculates pricing for 1-5 pages @ ₹5 and 6+ pages @ ₹2 tier rules", () => {
    const customSlabRules: PricingRule[] = [
      { color_mode: "black_and_white", paper_size: "a4", side_mode: "single_sided", min_pages: 1, max_pages: 5, price_per_page: 5 },
      { color_mode: "black_and_white", paper_size: "a4", side_mode: "single_sided", min_pages: 6, max_pages: null, price_per_page: 2 },
    ];

    // 1 page: 1 * 5 = ₹5
    const p1 = calculatePricing([range(1, 1)], customSlabRules, "customer_fee");
    expect(p1.subtotal).toBe(5);
    expect(p1.platformFee).toBe(0);
    expect(p1.total).toBe(5);

    // 5 pages: 5 * 5 = ₹25
    const p5 = calculatePricing([range(1, 5)], customSlabRules, "customer_fee");
    expect(p5.subtotal).toBe(25);
    expect(p5.platformFee).toBe(0);
    expect(p5.total).toBe(25);

    // 6 pages (matches 6+ tier @ ₹2): 6 * 2 = ₹12
    const p6 = calculatePricing([range(1, 6)], customSlabRules, "customer_fee");
    expect(p6.subtotal).toBe(12);
    expect(p6.platformFee).toBe(0);
    expect(p6.total).toBe(12);

    // 7 pages (matches 6+ tier @ ₹2): 7 * 2 = ₹14
    const p7 = calculatePricing([range(1, 7)], customSlabRules, "customer_fee");
    expect(p7.subtotal).toBe(14);
    expect(p7.platformFee).toBe(0);
    expect(p7.total).toBe(14);

    // 10 pages (matches 6+ tier @ ₹2): 10 * 2 = ₹20
    const p10 = calculatePricing([range(1, 10)], customSlabRules, "customer_fee");
    expect(p10.subtotal).toBe(20);
    expect(p10.platformFee).toBe(0);
    expect(p10.total).toBe(20);
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

  it("validates page ranges properly (allows partial prints and gaps, rejects overlaps and out-of-bounds)", () => {
    expect(validateRanges([range(10, 20)], 100)).toBeNull();
    expect(validateRanges([range(1, 4), range(6, 10)], 10)).toBeNull();
    expect(validateRanges([range(1, 5), range(5, 10)], 10)).toContain("overlap");
    expect(validateRanges([range(1, 11)], 10)).toBeTruthy();
  });

  it("rejects missing pricing and invalid shop state", () => {
    expect(() => calculatePricing([range(1, 1)], [])).toThrow("not configured");
    expect(() => assertShopCanPrice({ isActive: false, acceptingOrders: true, subscriptionStatus: "active" })).toThrow(
      "not active",
    );
    expect(() => assertShopCanPrice({ isActive: true, acceptingOrders: true, subscriptionStatus: "expired" })).not.toThrow();
  });
});
