import { z } from "zod";
import type { PrintRange } from "@/lib/customer-print";

export const pricingRuleSchema = z.object({
  color_mode: z.enum(["black_and_white", "color"]),
  paper_size: z.enum(["a4", "a3", "letter", "legal"]),
  min_pages: z.number().int().min(1),
  max_pages: z.number().int().min(1).nullable(),
  price_per_page: z.number().nonnegative(),
  is_active: z.boolean().optional(),
});

export type PricingRule = z.infer<typeof pricingRuleSchema>;
export type PricingSnapshotRule = PricingRule & { rule_key: string };
export type BillingMode = "customer_fee" | "shop_subscription";

export type PricingBreakdown = {
  colorMode: PrintRange["colorMode"];
  paperSize: PrintRange["paperSize"];
  pages: number;
  subtotal: number;
  slabBreakdown: Array<{
    minPages: number;
    maxPages: number | null;
    pages: number;
    pricePerPage: number;
    subtotal: number;
    ruleKey: string;
  }>;
};

export type PricingResult = {
  blackAndWhitePages: number;
  colorPages: number;
  paperSizeBreakdown: Array<{ paperSize: PrintRange["paperSize"]; pages: number; subtotal: number }>;
  subtotal: number;
  platformFee: number;
  total: number;
  currency: "INR";
  billingMode: BillingMode;
  pricingRuleSnapshot: PricingSnapshotRule[];
  breakdown: PricingBreakdown[];
};

export function assertShopCanPrice(shop: {
  isActive: boolean;
  acceptingOrders: boolean;
  subscriptionStatus: "trial" | "active" | "expired" | "cancelled" | "past_due";
}) {
  if (!shop.isActive) throw new Error("Shop is not active.");
  if (!shop.acceptingOrders) throw new Error("Shop is not accepting orders.");
  if (
    shop.subscriptionStatus === "expired" ||
    shop.subscriptionStatus === "cancelled" ||
    shop.subscriptionStatus === "past_due"
  )
    throw new Error("Shop subscription is not valid.");
}

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const rupees = (value: number) => cents(value) / 100;
const ruleKey = (rule: PricingRule) =>
  `${rule.color_mode}:${rule.paper_size}:${rule.min_pages}:${rule.max_pages ?? "plus"}`;

export function calculatePlatformFee(
  totalPages: number,
  billingMode: BillingMode = "customer_fee",
): number {
  if (billingMode === "shop_subscription") return 0;
  if (totalPages <= 0) return 0;
  // If customer prints <= 5 pages: add ₹0.50. If >= 6 pages: add ₹1.50.
  return totalPages <= 5 ? 0.5 : 1.5;
}

function validateRules(rules: PricingRule[]) {
  if (!rules.length) throw new Error("This shop has not configured printing prices yet.");
  const buckets = new Map<string, PricingRule[]>();
  for (const rule of rules) {
    if (rule.is_active === false) continue;
    if (rule.max_pages !== null && rule.max_pages < rule.min_pages)
      throw new Error("Pricing rules contain an invalid page range.");
    const key = `${rule.color_mode}:${rule.paper_size}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(rule);
    buckets.set(key, bucket);
  }
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.min_pages - b.min_pages);
    for (let index = 1; index < bucket.length; index += 1) {
      const previous = bucket[index - 1];
      const current = bucket[index];
      if (current.min_pages !== (previous.max_pages === null ? Number.POSITIVE_INFINITY : previous.max_pages + 1))
        throw new Error("Pricing rules must form contiguous, non-overlapping slabs.");
    }
    if (bucket[0].min_pages !== 1) throw new Error("Pricing slabs must start at page 1.");
  }
  return buckets;
}

function priceBucket(
  mode: PrintRange["colorMode"],
  paperSize: PrintRange["paperSize"],
  pages: number,
  bucket: PricingRule[],
) {
  // Find the tier rule that matches the total page count
  // bucket is sorted by min_pages ascending
  let matchedRule: PricingRule | undefined = bucket.find(
    (rule) => pages >= rule.min_pages && (rule.max_pages === null || pages <= rule.max_pages),
  );

  // Fallback: if pages exceeds all defined ranges, use the highest tier (e.g. 6+ pages)
  if (!matchedRule && bucket.length > 0) {
    const highestRule = bucket[bucket.length - 1];
    if (pages >= highestRule.min_pages) {
      matchedRule = highestRule;
    }
  }

  if (!matchedRule) {
    throw new Error(`No pricing rule covers ${pages} ${mode} ${paperSize} pages.`);
  }

  const subtotalCents = pages * cents(matchedRule.price_per_page);
  const subtotal = rupees(subtotalCents / 100);

  const slabBreakdown: PricingBreakdown["slabBreakdown"] = [
    {
      minPages: matchedRule.min_pages,
      maxPages: matchedRule.max_pages,
      pages,
      pricePerPage: matchedRule.price_per_page,
      subtotal,
      ruleKey: ruleKey(matchedRule),
    },
  ];

  return { mode, paperSize, pages, subtotal, slabBreakdown };
}

export function calculatePricing(
  ranges: PrintRange[],
  rules: PricingRule[],
  billingMode: BillingMode = "customer_fee",
): PricingResult {
  const buckets = validateRules(rules);
  const grouped = new Map<string, number>();
  for (const range of ranges) {
    const pages = range.endPage - range.startPage + 1;
    const key = `${range.colorMode}:${range.paperSize}`;
    grouped.set(key, (grouped.get(key) ?? 0) + pages);
  }
  const breakdown: PricingBreakdown[] = [];
  for (const [key, pages] of grouped) {
    const [mode, paperSize] = key.split(":") as [PrintRange["colorMode"], PrintRange["paperSize"]];
    const bucket = buckets.get(key);
    if (!bucket) throw new Error(`No pricing configured for ${mode.replaceAll("_", " ")} ${paperSize} pages.`);
    const priced = priceBucket(mode, paperSize, pages, bucket);
    breakdown.push({
      colorMode: mode,
      paperSize,
      pages,
      subtotal: priced.subtotal,
      slabBreakdown: priced.slabBreakdown,
    });
  }
  const paperTotals = new Map<PrintRange["paperSize"], { pages: number; subtotalCents: number }>();
  for (const item of breakdown) {
    const current = paperTotals.get(item.paperSize) ?? { pages: 0, subtotalCents: 0 };
    current.pages += item.pages;
    current.subtotalCents += cents(item.subtotal);
    paperTotals.set(item.paperSize, current);
  }
  const blackAndWhitePages = ranges
    .filter((range) => range.colorMode === "black_and_white")
    .reduce((sum, range) => sum + range.endPage - range.startPage + 1, 0);
  const colorPages = ranges
    .filter((range) => range.colorMode === "color")
    .reduce((sum, range) => sum + range.endPage - range.startPage + 1, 0);
  const totalPages = blackAndWhitePages + colorPages;
  const platformFee = calculatePlatformFee(totalPages, billingMode);

  const subtotal = rupees(breakdown.reduce((sum, item) => sum + cents(item.subtotal), 0) / 100);
  const total = rupees((cents(subtotal) + cents(platformFee)) / 100);

  return {
    blackAndWhitePages,
    colorPages,
    paperSizeBreakdown: [...paperTotals].map(([paperSize, value]) => ({
      paperSize,
      pages: value.pages,
      subtotal: rupees(value.subtotalCents / 100),
    })),
    subtotal,
    platformFee,
    total,
    currency: "INR",
    billingMode,
    pricingRuleSnapshot: rules
      .filter((rule) => rule.is_active !== false)
      .map((rule) => ({ ...rule, rule_key: ruleKey(rule) })),
    breakdown,
  };
}
