import Link from "next/link";
import { Store, Clock, QrCode, CheckCircle2, MapPin } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter } from "@/components/marketing-site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Shipping & Delivery Policy (Instant Counter Pick-up)",
  description:
    "Information regarding fulfillment, immediate counter pick-up via Token Numbers, and local print shop delivery policies on Printiva.",
  path: "/shipping",
  keywords: ["Printiva delivery policy", "instant counter pickup", "print shop pickup India", "QR print fulfillment"],
});

export default function ShippingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <SiteHeader />

      <main className="flex-1 py-12 sm:py-20">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          {/* Header */}
          <div className="border-b border-slate-200 pb-8 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200 mb-4">
              <Store className="size-4 text-emerald-600" />
              Instant Counter Fulfillment
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
              Shipping &amp; Delivery Policy
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-600">
              Printiva operates an on-demand, instant digital printing service fulfilled directly at verified local partner print shops.
            </p>
          </div>

          {/* Quick Summary Highlights */}
          <div className="mt-8 rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Fulfillment Details at a Glance</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3 items-start">
                <Store className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">Instant In-Store Pick-up</b>
                  All orders are printed on-site at the local print shop you selected or whose QR code you scanned.
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <Clock className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">Zero Shipping Wait Time</b>
                  No courier transit delay. Printing begins immediately upon shopkeeper verification of your token.
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <QrCode className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">Token-Based Collection</b>
                  Show your Token Number (e.g., Token #3) at the counter to collect your verified physical printout.
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">No Shipping Surcharges</b>
                  Because fulfillment is completed in-store, there are zero courier shipping or handling fees.
                </div>
              </div>
            </div>
          </div>

          {/* Body Sections */}
          <div className="mt-10 space-y-8 text-sm sm:text-base text-slate-700 leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">1. Nature of Delivery: Instant Counter Collection</h2>
              <p>
                Printiva is a digital workflow engine for local xerox and print shops. We do not dispatch printouts via third-party courier services (such as postal or freight couriers), as customers typically require immediate physical access to their printed sheets.
              </p>
              <p>
                When you upload a document through Printiva, the print job is routed directly to the designated local shop&apos;s Windows Desktop Agent for immediate printing.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">2. Fulfillment Timeline</h2>
              <ul className="list-disc pl-6 space-y-2 text-slate-600">
                <li>
                  <b className="text-slate-900">Turnaround:</b> Physical printing starts immediately after the shopkeeper clicks &quot;Print &amp; Approve&quot; or after online payment verification.
                </li>
                <li>
                  <b className="text-slate-900">Collection Window:</b> Counter tokens are active for 1 hour. Once your job is printed, your printed sheets are ready for collection at the counter immediately.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">3. How to Collect Your Printout</h2>
              <ol className="list-decimal pl-6 space-y-2 text-slate-600">
                <li>Note down or screenshot your <b>Token Number</b> (e.g. Token #3).</li>
                <li>Visit the shop counter where you placed the order.</li>
                <li>Tell the shopkeeper your Token Number.</li>
                <li>Collect your freshly printed sheets directly from the tray.</li>
              </ol>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">4. Shipping Charges</h2>
              <p>
                Since fulfillment is on-site instant pick-up, <b>no shipping or delivery fee is levied</b>. You only pay for the exact pages and print configuration specified during document setup.
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-200 flex flex-wrap gap-4 justify-between items-center text-xs sm:text-sm text-slate-500">
            <div>© 2026 Printiva. All rights reserved.</div>
            <div className="flex gap-4">
              <Link href="/privacy" className="hover:text-emerald-700 underline">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-emerald-700 underline">Terms of Service</Link>
              <Link href="/refund" className="hover:text-emerald-700 underline">Refund Policy</Link>
              <Link href="/contact" className="hover:text-emerald-700 underline">Contact Us</Link>
            </div>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
