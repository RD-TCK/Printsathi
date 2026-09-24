import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, Printer, QrCode, ShieldCheck, Sparkles, CheckCircle2, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { getPublicPricing, getPublicShop } from "@/lib/shops/public-lookup";
import { CustomerPrintFlow } from "@/components/customer-print-flow";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ShopPageProps = { params: Promise<{ shop_public_identifier: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ShopPageProps): Promise<Metadata> {
  const { shop_public_identifier: identifier } = await params;
  const { shop } = await getPublicShop(identifier);
  return {
    title: shop ? `${shop.name} | Print Documents Online & Pay at Counter` : "Print Shop",
    description: shop ? `Upload and print documents instantly at ${shop.name} with Printiva.` : "Printiva shop entry",
  };
}

export default async function PublicShopPage({ params }: ShopPageProps) {
  const { shop_public_identifier: identifier } = await params;
  const { shop, configured } = await getPublicShop(identifier);
  if (!configured) return <ShopLookupUnavailable />;
  if (!shop) notFound();
  const pricing = await getPublicPricing(identifier);

  const isBwReady = shop.bw_printer_status === "ready";
  const isColorReady = shop.color_printer_status === "ready";

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-emerald-50/20 to-slate-50 px-2 py-2.5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        {/* Navigation Bar */}
        <header className="flex items-center justify-between px-1 pb-2 sm:pb-4">
          <Link href="/" className="group flex items-center gap-1.5 sm:gap-2">
            <span className="flex size-6.5 sm:size-8 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-xs sm:text-base font-black text-white shadow-md shadow-emerald-900/20 transition-transform group-hover:scale-105">
              P
            </span>
            <span className="text-base sm:text-xl font-black tracking-tight text-slate-900">
              Print<span className="text-emerald-600">iva</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full bg-emerald-100/90 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold text-emerald-800 border border-emerald-200/60 shadow-xs">
              <span className="size-1.5 sm:size-2 rounded-full bg-emerald-500 animate-pulse" />
              Instant Print Shop
            </span>
          </div>
        </header>

        {/* Main Content Card */}
        <Card className="mt-0.5 sm:mt-1 overflow-hidden border-emerald-100/80 bg-white shadow-xl shadow-slate-900/5 rounded-2xl sm:rounded-3xl">
          {/* Shop Header Banner */}
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900 px-3.5 py-3 sm:px-8 sm:py-7 text-white">
            {/* Ambient background decoration */}
            <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-10 left-1/3 size-36 rounded-full bg-teal-400/10 blur-2xl" />

            <div className="relative z-10">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[9px] sm:text-[11px] font-semibold text-emerald-200 backdrop-blur-xs border border-white/10">
                  <QrCode className="size-2.5 sm:size-3.5 text-emerald-300" /> Verified Partner Shop
                </span>
                <span className="text-[9px] sm:text-[11px] font-medium text-emerald-200/80">
                  Upload · Configure · Pay · Print
                </span>
              </div>

              <div className="mt-1.5 sm:mt-3 flex items-center justify-between gap-2 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-base sm:text-3xl font-black tracking-tight text-white truncate">
                    {shop.name}
                  </h1>
                  <p className="mt-0.5 text-[10px] sm:text-sm text-emerald-100/70 truncate">
                    Print your documents online &amp; collect at the counter.
                  </p>
                </div>

                {/* Status Badges */}
                <div className="flex shrink-0 gap-1.5 text-xs">
                  <span
                    className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-lg sm:rounded-xl px-2 py-0.5 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-bold backdrop-blur-xs border ${
                      shop.status === "available"
                        ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/30"
                        : "bg-amber-500/20 text-amber-200 border-amber-400/30"
                    }`}
                  >
                    <span
                      className={`size-1.5 sm:size-2 rounded-full ${
                        shop.status === "available" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                      }`}
                    />
                    {shop.status === "available" ? "Accepting Orders" : "Orders Paused"}
                  </span>
                </div>
              </div>

              {/* Live Printer Readiness Pill */}
              <div className="mt-2 sm:mt-4 flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1.5 sm:pt-3 border-t border-white/10 text-xs">
                <span className="text-[9px] sm:text-[11px] font-medium text-white/60">Printers:</span>
                <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-md sm:rounded-lg bg-white/10 px-1.5 py-0.5 sm:px-2.5 sm:py-1 text-[9px] sm:text-[11px] font-medium text-white/90">
                  <Printer className="size-2.5 sm:size-3 text-emerald-300" />
                  B&amp;W:{" "}
                  <b className={isBwReady ? "text-emerald-300 font-bold" : "text-amber-300 font-bold"}>
                    {isBwReady ? "Ready" : "Offline"}
                  </b>
                </span>
                <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-md sm:rounded-lg bg-white/10 px-1.5 py-0.5 sm:px-2.5 sm:py-1 text-[9px] sm:text-[11px] font-medium text-white/90">
                  <Printer className="size-2.5 sm:size-3 text-emerald-300" />
                  Color:{" "}
                  <b className={isColorReady ? "text-emerald-300 font-bold" : "text-amber-300 font-bold"}>
                    {isColorReady ? "Ready" : "Offline"}
                  </b>
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Customer Print Flow */}
          <div className="p-2.5 sm:p-7">
            <CustomerPrintFlow shop={shop} identifier={identifier} initialPricingRules={pricing} />

            {/* Bottom Info Section: Shop Pricing Slabs */}
            <div className="mt-8 sm:mt-10 border-t border-slate-100 pt-5 sm:pt-6">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 sm:p-5">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5 sm:pb-3">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <FileText className="size-3.5 sm:size-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-900">Shop Pricing Slabs</span>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-800">
                    Volume Rates
                  </span>
                </div>

                {pricing.length ? (
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    {pricing.slice(0, 8).map((rule, idx) => (
                      <div
                        className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-2xs"
                        key={`${rule.color_mode}-${rule.paper_size}-${rule.side_mode ?? "any"}-${rule.min_pages}-${rule.max_pages ?? "inf"}-${idx}`}
                      >
                        <span className="font-semibold text-slate-800 text-xs">
                          {rule.color_mode === "color" ? "🎨 Color" : "📄 B&W"} · {rule.paper_size.toUpperCase()}
                          {rule.side_mode === "double_sided" ? " (Both Sides)" : rule.side_mode === "single_sided" ? " (1 Side)" : ""}{" "}
                          <span className="text-[11px] font-normal text-slate-500">
                            ({rule.min_pages}–{rule.max_pages ?? "∞"}p)
                          </span>
                        </span>
                        <span className="font-mono font-bold text-emerald-700 text-xs">
                          ₹{Number(rule.price_per_page).toFixed(2)}/p
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">Standard slab rates apply at checkout.</p>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Informational Trust Cards */}
        <div className="mt-6 grid gap-3.5 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <ShieldCheck className="size-5" />
            </div>
            <p className="mt-2.5 text-sm font-bold text-slate-900">100% Private &amp; Secure</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Your files are encrypted during transit and automatically purged after printing for complete privacy.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Sparkles className="size-5" />
            </div>
            <p className="mt-2.5 text-sm font-bold text-slate-900">Zero-Wait Counter Printing</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Generate a 1-hour token or pay online to skip the line. Show your token at the counter and collect instantly.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Powered by{" "}
          <Link className="font-bold text-emerald-700 hover:underline" href="/">
            Printiva
          </Link>{" "}
          · Smart Campus &amp; Local Printing
        </p>
      </div>
    </main>
  );
}

function ShopLookupUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-brand-950">Shop entry is temporarily unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Printiva could not connect to the public shop directory. Please try again later.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Return to Printiva</Link>
        </Button>
      </div>
    </main>
  );
}
