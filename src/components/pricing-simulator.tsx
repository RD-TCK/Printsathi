"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Rule = {
  id: string;
  color_mode: "black_and_white" | "color";
  paper_size: "a4" | "a3" | "letter" | "legal";
  min_pages: number;
  max_pages: number | null;
  price_per_page: number;
  is_active: boolean;
};

export function PricingSimulator({ rules }: { rules: Rule[] }) {
  const [pages, setPages] = useState<number>(7);
  const [mode, setMode] = useState<"black_and_white" | "color">("black_and_white");
  const [paper, setPaper] = useState<"a4" | "a3">("a4");

  const activeRules = rules
    .filter((r) => r.is_active && r.color_mode === mode && r.paper_size === paper)
    .sort((a, b) => a.min_pages - b.min_pages);

  // Find matching tier for total page count
  let matchedRule: Rule | undefined = activeRules.find(
    (rule) => pages >= rule.min_pages && (rule.max_pages === null || pages <= rule.max_pages),
  );

  if (!matchedRule && activeRules.length > 0) {
    const highestRule = activeRules[activeRules.length - 1];
    if (pages >= highestRule.min_pages) {
      matchedRule = highestRule;
    }
  }

  let total = 0;
  const breakdown: Array<{ slab: string; pagesInSlab: number; rate: number; subtotal: number }> = [];

  if (matchedRule) {
    const rate = Number(matchedRule.price_per_page);
    total = pages * rate;
    breakdown.push({
      slab: `${matchedRule.min_pages}–${matchedRule.max_pages ?? "∞"} pages`,
      pagesInSlab: pages,
      rate,
      subtotal: total,
    });
  }

  const effectivePerPage = pages > 0 ? (total / pages).toFixed(2) : "0.00";

  return (
    <Card className="border-brand-200 bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="size-5 text-brand-600" />
            <h3 className="font-bold text-brand-950">Live Pricing Simulator</h3>
          </div>
          <Badge tone="neutral">Real-time</Badge>
        </div>
        <p className="text-xs text-muted">
          Test what a customer will be charged for any page count using your active rules.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Input
            id="simPages"
            label="Document Pages"
            type="number"
            min="1"
            max="1000"
            value={pages}
            onChange={(e) => setPages(Math.max(1, parseInt(e.target.value) || 1))}
          />
          <div>
            <label className="block text-sm font-medium text-brand-950 mb-2">Color Mode</label>
            <select
              className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand-600"
              value={mode}
              onChange={(e) => setMode(e.target.value as "black_and_white" | "color")}
            >
              <option value="black_and_white">Black & White</option>
              <option value="color">Color</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-950 mb-2">Paper Size</label>
            <select
              className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand-600"
              value={paper}
              onChange={(e) => setPaper(e.target.value as "a4" | "a3")}
            >
              <option value="a4">A4</option>
              <option value="a3">A3</option>
            </select>
          </div>
        </div>

        {/* Quick test buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Quick test:</span>
          {[1, 5, 7, 10, 20, 50, 100].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPages(p)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                pages === p ? "bg-brand-700 text-white" : "border border-line bg-brand-50/50 text-brand-800 hover:bg-brand-100"
              }`}
            >
              {p} {p === 1 ? "page" : "pages"}
            </button>
          ))}
        </div>

        {/* Calculation Result */}
        {activeRules.length > 0 ? (
          <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
            <div className="flex items-baseline justify-between border-b border-brand-100/60 pb-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Customer Pays</span>
                <div className="text-3xl font-extrabold text-brand-900">₹{total.toFixed(2)}</div>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted">Applied Tier Rate</span>
                <div className="text-sm font-bold text-brand-700">₹{effectivePerPage} / page</div>
              </div>
            </div>

            <div className="mt-3 space-y-1.5 text-xs text-brand-950">
              <span className="font-semibold text-muted block mb-1">Calculation Breakdown:</span>
              {breakdown.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-white/80 rounded px-2.5 py-1.5 border border-line">
                  <span>
                    Matched Tier ({item.slab}): <b>{item.pagesInSlab} pages</b> × ₹{item.rate.toFixed(2)}
                  </span>
                  <span className="font-mono font-bold text-brand-900">₹{item.subtotal.toFixed(2)}</span>
                </div>
              ))}
              {!matchedRule ? (
                <div className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-amber-800 font-medium">
                  ⚠️ {pages} pages not covered by any active tier rule.
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            No active pricing rules configured for {mode === "color" ? "Color" : "Black & White"} ({paper.toUpperCase()}). Add a rule below to start pricing.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
