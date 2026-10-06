import type { Metadata } from "next";
import Link from "next/link";
import { Printer, QrCode, ShieldCheck, Sparkles, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { getPublicPricing, getPublicShop } from "@/lib/shops/public-lookup";
import { CustomerPrintFlow } from "@/components/customer-print-flow";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ShopPageProps = {
  params: Promise<{ shop_public_identifier: string }>;
  searchParams?: Promise<{ orderId?: string; token?: string; accessToken?: string }>;
};
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ShopPageProps): Promise<Metadata> {
  const { shop_public_identifier: identifier } = await params;
  const { shop } = await getPublicShop(identifier);
  return {
    title: shop ? `${shop.name} | Print Documents Online & Pay at Counter` : "Print Shop",
    description: shop ? `Upload and print documents instantly at ${shop.name} with Printiva.` : "Printiva shop entry",
  };
}

export default async function PublicShopPage({ params, searchParams }: ShopPageProps) {
  const { shop_public_identifier: identifier } = await params;
  const search = (await searchParams) || {};
  const initialOrderId = search.orderId || null;
  const initialAccessToken = search.token || search.accessToken || null;

  const [shopResult, pricing] = await Promise.all([
    getPublicShop(identifier),
    getPublicPricing(identifier),
  ]);
  const { shop, configured } = shopResult;
  if (!configured) return <ShopLookupUnavailable />;
  if (!shop) notFound();

  const isBwReady = shop.bw_printer_status === "ready";
  const isColorReady = shop.color_printer_status === "ready";

  return (
    <main className="min-h-screen bg-slate-50 px-2 py-2.5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        {/* Navigation Bar */}
        <header className="flex items-center justify-between px-1 pb-2 sm:pb-4">
          <Link href="/" className="group flex items-center gap-1.5 sm:gap-2">
            <span className="flex size-6.5 sm:size-8 items-center justify-center rounded-lg sm:rounded-xl bg-emerald-600 text-xs sm:text-base font-black text-white shadow-md shadow-emerald-900/20 transition-transform group-hover:scale-105">
              P
            </span>
            <span className="text-base sm:text-xl font-black tracking-tight text-slate-900">
              Print<span className="text-emerald-600">iva</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full bg-emerald-100 px-2.5 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold text-emerald-800 border border-emerald-200 shadow-xs">
              <span className="size-1.5 sm:size-2 rounded-full bg-emerald-500 animate-pulse" />
              Instant Print Shop
            </span>
          </div>
        </header>

        {/* Main Content Card */}
        <Card className="mt-1 sm:mt-2 overflow-hidden border-emerald-200 bg-white shadow-xl shadow-emerald-950/5 rounded-2xl sm:rounded-3xl">
          {/* Shop Header Banner (Desktop Only - Hidden on Mobile) */}
          <div className="hidden sm:block relative overflow-hidden bg-emerald-950 px-3.5 py-2.5 sm:px-8 sm:py-8 text-white border-b border-emerald-800">
            <div className="relative z-10 space-y-2 sm:space-y-4">
              {/* Top Meta Bar */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full bg-emerald-900/80 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[9.5px] sm:text-xs font-bold text-emerald-300 border border-emerald-700/60 shadow-xs">
                    <ShieldCheck className="size-2.5 sm:size-3.5 text-emerald-400" />
                    <span className="sm:hidden">Verified</span>
                    <span className="hidden sm:inline">Verified Partner Print Shop</span>
                  </span>
                  <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full bg-emerald-900/60 px-2 sm:px-2.5 py-0.5 text-[9.5px] sm:text-[11px] font-medium text-emerald-200 border border-emerald-700/40">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>2s Live Sync</span>
                  </span>
                </div>
                
                {/* Shop Operating Status */}
                <div className="flex items-center">
                  <span
                    className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-full px-2 py-0.5 sm:px-3 sm:py-1 text-[9.5px] sm:text-xs font-bold border transition-all ${
                      shop.status === "available"
                        ? "bg-emerald-900 text-emerald-300 border-emerald-600 shadow-xs"
                        : "bg-amber-950 text-amber-300 border-amber-600 shadow-xs"
                    }`}
                  >
                    <span
                      className={`size-1.5 sm:size-2 rounded-full ${
                        shop.status === "available" ? "bg-emerald-400 animate-ping" : "bg-amber-400"
                      }`}
                    />
                    <span
                      className={`size-1.5 -ml-2.5 sm:-ml-3.5 rounded-full ${
                        shop.status === "available" ? "bg-emerald-400" : "bg-amber-400"
                      }`}
                    />
                    <span className="sm:hidden">{shop.status === "available" ? "Open" : "Paused"}</span>
                    <span className="hidden sm:inline">{shop.status === "available" ? "Live & Accepting Orders" : "Orders Paused"}</span>
                  </span>
                </div>
              </div>

              {/* Shop Title & Headline */}
              <div className="pt-0.5 sm:pt-1">
                <h1 className="text-lg sm:text-3xl lg:text-4xl font-black tracking-tight text-white leading-tight">
                  {shop.name}
                </h1>
                <p className="hidden sm:block mt-1 text-xs sm:text-sm text-emerald-100/90 max-w-xl leading-relaxed">
                  Upload your documents from mobile or PC, configure page settings &amp; get instant prints without standing in line.
                </p>
              </div>

              {/* Real-time Hardware Telemetry Cards: 3 items in a single compact row on mobile */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-1.5 sm:pt-2 border-t border-emerald-800/80">
                {/* B&W Station */}
                <div className="flex items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl bg-emerald-900/50 p-1.5 sm:px-3 sm:py-2 border border-emerald-800 hover:bg-emerald-900/70 transition min-w-0">
                  <div className="flex size-5 sm:size-8 items-center justify-center rounded-md sm:rounded-lg bg-emerald-600 text-white shrink-0 shadow-xs">
                    <Printer className="size-3 sm:size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[8.5px] sm:text-[11px] font-medium text-emerald-200 truncate">B&amp;W</p>
                    <p className={`text-[9.5px] sm:text-xs font-bold truncate ${isBwReady ? "text-emerald-300" : "text-amber-300"}`}>
                      {isBwReady ? "Online" : "Offline"}
                    </p>
                  </div>
                </div>

                {/* Color Station */}
                <div className="flex items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl bg-emerald-900/50 p-1.5 sm:px-3 sm:py-2 border border-emerald-800 hover:bg-emerald-900/70 transition min-w-0">
                  <div className="flex size-5 sm:size-8 items-center justify-center rounded-md sm:rounded-lg bg-emerald-600 text-white shrink-0 shadow-xs">
                    <Sparkles className="size-3 sm:size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[8.5px] sm:text-[11px] font-medium text-emerald-200 truncate">Color</p>
                    <p className={`text-[9.5px] sm:text-xs font-bold truncate ${isColorReady ? "text-emerald-300" : "text-amber-300"}`}>
                      {isColorReady ? "Online" : "Offline"}
                    </p>
                  </div>
                </div>

                {/* Print Dispatch Speed */}
                <div className="flex items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl bg-emerald-900/50 p-1.5 sm:px-3 sm:py-2 border border-emerald-800 hover:bg-emerald-900/70 transition min-w-0">
                  <div className="flex size-5 sm:size-8 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0 shadow-xs">
                    <QrCode className="size-3 sm:size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[8.5px] sm:text-[11px] font-medium text-emerald-200 truncate">Pickup</p>
                    <p className="text-[9.5px] sm:text-xs font-bold text-emerald-300 truncate">
                      Token
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Customer Print Flow */}
          <div className="p-2.5 sm:p-7">
            <CustomerPrintFlow
              shop={shop}
              identifier={identifier}
              initialPricingRules={pricing}
              initialOrderId={initialOrderId}
              initialAccessToken={initialAccessToken}
            />

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
