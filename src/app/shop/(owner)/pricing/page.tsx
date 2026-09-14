import Link from "next/link";
import { Plus, Zap, CheckCircle2, Trash2 } from "lucide-react";
import { createPricingRule, deactivatePricingRule, deletePricingRule, updatePricingRule, quickSetupPricing } from "@/app/shop/actions";
import { getShopContext, formatStatus } from "@/lib/shop-portal";
import { ShopPageHeader } from "@/components/shop-page";
import { PricingSimulator } from "@/components/pricing-simulator";
import { ConfirmActionForm } from "@/components/confirm-action-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; edit?: string }>;
}) {
  const context = await getShopContext();
  if (!context) return <Alert tone="error">Shop workspace unavailable.</Alert>;
  const params = await searchParams;
  const { data: rules, error } = await context.client
    .from("pricing_rules")
    .select("id, color_mode, paper_size, min_pages, max_pages, price_per_page, is_active, updated_at")
    .eq("shop_id", context.shop.id)
    .order("color_mode")
    .order("paper_size")
    .order("min_pages");
  const editRule = params.edit ? rules?.find((rule) => rule.id === params.edit) : null;

  return (
    <div className="space-y-8">
      <ShopPageHeader
        eyebrow="Customer-facing prices"
        title="Pricing rules & Slab calculator"
        description="Configure what customers pay for printing. Define custom page-range slabs (e.g. 1-5 pages @ ₹5, 6+ pages @ ₹2) and test with the live simulator."
      />
      {params.error ? <Alert tone="error">{params.error}</Alert> : null}
      {params.success ? <Alert tone="success">{params.success}</Alert> : null}

      {/* Quick Setup Banner */}
      <div className="rounded-2xl border-2 border-dashed border-brand-300 bg-gradient-to-br from-brand-50 to-emerald-50/40 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Zap className="size-5" />
            </div>
            <div>
              <h2 className="font-bold text-brand-950">⚡ Quick Pricing Setup (Recommended)</h2>
              <p className="mt-1 text-sm text-muted">
                Instantly apply the standard slab pricing for A4 pages:
                <span className="mx-1.5 inline-flex items-center gap-1 rounded-md bg-white border border-brand-200 px-2 py-0.5 text-xs font-bold text-brand-700">
                  <CheckCircle2 className="size-3 text-emerald-600" /> 1–5 pages @ ₹5/page
                </span>
                +
                <span className="ml-1.5 inline-flex items-center gap-1 rounded-md bg-white border border-brand-200 px-2 py-0.5 text-xs font-bold text-brand-700">
                  <CheckCircle2 className="size-3 text-emerald-600" /> 6+ pages @ ₹2/page
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={quickSetupPricing}>
              <input type="hidden" name="colorMode" value="black_and_white" />
              <Button type="submit" variant="secondary">
                <Zap className="size-4" />
                Apply for B&amp;W (A4)
              </Button>
            </form>
            <form action={quickSetupPricing}>
              <input type="hidden" name="colorMode" value="color" />
              <Button type="submit">
                <Zap className="size-4" />
                Apply for Color (A4)
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Real-time Pricing Simulator */}
      <PricingSimulator rules={(rules || []) as any} />

      <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-brand-950">{editRule ? "Edit rule" : "Add custom pricing rule"}</h2>
                <p className="mt-1 text-sm text-muted">Create non-overlapping page slabs (e.g. 1–5 pages, 6+ pages).</p>
              </div>
              <Plus className="size-5 text-brand-600" />
            </div>
          </CardHeader>
          <CardContent>
            <form action={editRule ? updatePricingRule : createPricingRule} className="space-y-4">
              {editRule ? <input type="hidden" name="id" value={editRule.id} /> : null}
              <Select
                id="colorMode"
                name="colorMode"
                label="Print mode"
                defaultValue={editRule?.color_mode ?? "black_and_white"}
              >
                <option value="black_and_white">Black &amp; white</option>
                <option value="color">Color</option>
              </Select>
              <Select id="paperSize" name="paperSize" label="Paper size" defaultValue={editRule?.paper_size ?? "a4"}>
                <option value="a4">A4</option>
                <option value="a3">A3</option>
                <option value="letter">Letter</option>
                <option value="legal">Legal</option>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="minPages"
                  name="minPages"
                  label="From page"
                  type="number"
                  min="1"
                  defaultValue={editRule?.min_pages ?? 1}
                  required
                />
                <Input
                  id="maxPages"
                  name="maxPages"
                  label="To page"
                  type="number"
                  min="1"
                  defaultValue={editRule?.max_pages ?? ""}
                  placeholder="No limit (∞)"
                  hint="Leave blank for 6+ / no limit"
                />
              </div>
              <Input
                id="pricePerPage"
                name="pricePerPage"
                label="Price per page (INR)"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editRule?.price_per_page ?? 5}
                required
              />
              <Button className="w-full" type="submit">
                {editRule ? "Update pricing rule" : "Save pricing rule"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <div>
          {error ? (
            <Alert tone="error" title="Could not load pricing">
              Supabase did not return pricing rules.
            </Alert>
          ) : rules?.length ? (
            <div className="overflow-x-auto rounded-xl border border-line bg-white">
              <Table
                headers={["Mode", "Paper", "Page range", "Price", "State", "Action"]}
                rows={rules.map((rule) => [
                  formatStatus(rule.color_mode),
                  formatStatus(rule.paper_size),
                  `${rule.min_pages}–${rule.max_pages ?? "∞"} pages`,
                  `₹${Number(rule.price_per_page).toFixed(2)}/p`,
                  <Badge key="state" tone={rule.is_active ? "success" : "neutral"}>
                    {rule.is_active ? "ACTIVE" : "INACTIVE"}
                  </Badge>,
                  rule.is_active ? (
                    <div className="flex flex-wrap items-center gap-2" key="action">
                      <Link
                        className="text-xs font-semibold text-brand-700 hover:underline"
                        href={`/shop/pricing?edit=${rule.id}`}
                      >
                        Edit
                      </Link>
                      <form action={deactivatePricingRule}>
                        <input type="hidden" name="id" value={rule.id} />
                        <button className="text-xs font-semibold text-amber-600 hover:underline" type="submit">
                          Deactivate
                        </button>
                      </form>
                      <ConfirmActionForm action={deletePricingRule} confirmation="Permanently delete this pricing rule?">
                        <input type="hidden" name="id" value={rule.id} />
                        <button className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline" type="submit">
                          <Trash2 className="size-3" />
                          Delete
                        </button>
                      </ConfirmActionForm>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2" key="action">
                      <span className="text-xs text-muted">Archived</span>
                      <ConfirmActionForm action={deletePricingRule} confirmation="Permanently delete this pricing rule?">
                        <input type="hidden" name="id" value={rule.id} />
                        <button className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline" type="submit">
                          <Trash2 className="size-3" />
                          Delete
                        </button>
                      </ConfirmActionForm>
                    </div>
                  ),
                ])}
              />
            </div>
          ) : (
            <Card className="p-8">
              <h2 className="font-semibold text-brand-950">No pricing rules yet</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Add your first customer-facing rule above (for example: 1-5 pages @ ₹5, 6+ pages @ ₹2).
              </p>
            </Card>
          )}
          <p className="mt-3 text-xs text-muted">
            <Link className="font-semibold text-brand-700" href="/shop/settings">
              Shop settings
            </Link>{" "}
            controls availability, not printing prices.
          </p>
        </div>
      </div>
    </div>
  );
}
