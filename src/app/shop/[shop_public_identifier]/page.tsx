import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, Printer, QrCode, ShieldCheck } from "lucide-react";
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
    title: shop ? `${shop.name} print shop` : "Shop",
    description: shop ? `Print with ${shop.name} through Printiva.` : "Printiva shop entry",
  };
}

export default async function PublicShopPage({ params }: ShopPageProps) {
  const { shop_public_identifier: identifier } = await params;
  const { shop, configured } = await getPublicShop(identifier);
  if (!configured) return <ShopLookupUnavailable />;
  if (!shop) notFound();
  const pricing = await getPublicPricing(identifier);
  return (
    <main className="min-h-screen bg-brand-50 px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between px-1 pb-3">
          <Link href="/" className="text-xl font-bold tracking-tight text-brand-800">
            Print<span className="text-brand-600">iva</span>
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-full">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            Instant Print
          </span>
        </header>

        <Card className="mt-2 overflow-hidden border-brand-100 shadow-xl shadow-brand-950/5">
          {/* Top Bar: Shop Name Focused */}
          <div className="bg-emerald-900 px-5 py-5 text-white sm:px-7">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                <QrCode className="size-3.5 text-emerald-300" /> Print Shop
              </span>
              <span className="text-[11px] font-medium text-white/70">Scan · Upload · Pay · Print</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">{shop.name}</h1>
          </div>

          {/* Upload and Print Flow (Top Priority for Mobile) */}
          <div className="p-4 sm:p-7">
            <CustomerPrintFlow shop={shop} identifier={identifier} />

            {/* Bottom Info Section: Shop Details & Pricing moved to bottom */}
            <div className="mt-8 border-t border-line pt-6">
              {/* Shop Status & Printers */}
              <div className="rounded-xl border border-line bg-brand-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
                  <span className="text-xs font-bold text-brand-950">Shop &amp; Printer Status</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                    <Clock3 className="size-3.5" />
                    {shop.status === "available"
                      ? "Accepting orders"
                      : shop.status === "inactive"
                        ? "Shop unavailable"
                        : "Orders paused"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-brand-900">
                  <span className="inline-flex items-center gap-1.5">
                    <Printer className="size-4 text-brand-700" />
                    B&amp;W Printer:{" "}
                    <b className={shop.bw_printer_status === "ready" ? "text-emerald-700 font-bold" : "text-amber-700 font-bold"}>
                      {shop.bw_printer_status === "ready" ? "Ready" : shop.bw_printer_status === "offline" ? "Offline" : "Online"}
                    </b>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Printer className="size-4 text-emerald-600" />
                    Color Printer:{" "}
                    <b className={shop.color_printer_status === "ready" ? "text-emerald-700 font-bold" : "text-amber-700 font-bold"}>
                      {shop.color_printer_status === "ready" ? "Ready" : shop.color_printer_status === "offline" ? "Offline" : "Online"}
                    </b>
                  </span>
                </div>
              </div>

              {/* Shop Pricing Slabs */}
              <div className="mt-4 rounded-xl border border-line bg-brand-50/50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-brand-950">Shop Slab Pricing</p>
                  <span className="text-[10px] font-semibold text-brand-700 bg-brand-100 px-2 py-0.5 rounded">Volume Rates</span>
                </div>
                {pricing.length ? (
                  <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
                    {pricing.slice(0, 8).map((rule) => (
                      <div
                        className="flex justify-between items-center bg-white rounded-lg px-3 py-2 border border-line"
                        key={`${rule.color_mode}-${rule.paper_size}-${rule.min_pages}`}
                      >
                        <span className="font-medium text-brand-950 text-[11px] sm:text-xs">
                          {rule.color_mode === "color" ? "🎨 Color" : "📄 B&W"} · {rule.paper_size.toUpperCase()} ({rule.min_pages}–{rule.max_pages ?? "∞"}p)
                        </span>
                        <span className="font-bold text-brand-800 font-mono text-xs">
                          ₹{Number(rule.price_per_page).toFixed(2)}/p
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">Pricing has not been published by this shop yet.</p>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Informational Footer Cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-white p-4">
            <ShieldCheck className="size-5 text-brand-600" />
            <p className="mt-2 text-sm font-semibold text-brand-950">All Documents &amp; Photos Supported</p>
            <p className="mt-1 text-xs leading-5 text-muted">Upload PDFs, photos (PNG/JPG), Word docs, or notes directly from your phone.</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-4">
            <Printer className="size-5 text-brand-600" />
            <p className="mt-2 text-sm font-semibold text-brand-950">Automatic Zero-Touch Printing</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Once payment is verified, your documents print automatically at the counter without waiting in line.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Powered by{" "}
          <Link className="font-semibold text-brand-700" href="/">
            Printiva
          </Link>
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
