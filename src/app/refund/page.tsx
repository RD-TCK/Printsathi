import Link from "next/link";
import { RefreshCw, CheckCircle, AlertTriangle, HelpCircle, ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter } from "@/components/marketing-site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Cancellation and Refund Policy",
  description:
    "Learn about our cancellation terms, misprint protection, shopkeeper re-print policy, and Razorpay refund timelines on Printiva.",
  path: "/refund",
  keywords: ["Printiva refund policy", "print cancellation India", "print shop misprint refund", "Razorpay refund time"],
});

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <SiteHeader />

      <main className="flex-1 py-12 sm:py-20">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          {/* Header */}
          <div className="border-b border-slate-200 pb-8 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200 mb-4">
              <RefreshCw className="size-4 text-emerald-600" />
              Fair &amp; Transparent
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
              Cancellation &amp; Refund Policy
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-600">
              Clear, transparent guidelines on order cancellation, printer misprint resolution, and refund processing timelines.
            </p>
          </div>

          {/* Quick Summary Highlights */}
          <div className="mt-8 rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Refund Rules at a Glance</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3 items-start">
                <CheckCircle className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">Cancellation Before Print</b>
                  Orders can be cancelled at any time before the shopkeeper approves and dispatches the document to the physical printer.
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">Custom On-Demand Nature</b>
                  Once physical pages have been printed, the order cannot be cancelled as physical paper and toner have been permanently consumed.
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <RefreshCw className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">Free Re-Print for Misprints</b>
                  If your document suffers a paper jam, ink smear, or printer error, the shopkeeper will trigger an instant free Re-Print.
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <HelpCircle className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">5–7 Day Bank Refund</b>
                  Prepaid orders cancelled due to shop offline or hardware failure are refunded directly to the original UPI / card source within 5–7 business days.
                </div>
              </div>
            </div>
          </div>

          {/* Body Sections */}
          <div className="mt-10 space-y-8 text-sm sm:text-base text-slate-700 leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">1. On-Demand Printing Characteristics</h2>
              <p>
                Printing is a custom, on-demand physical fabrication service tailored specifically to your uploaded files. Each job consumes customized paper sheets, toner, and machine cycles based on your chosen specifications (A4/A3, B&amp;W or Color, duplex mode).
              </p>
              <p>
                Consequently, once a print job has been printed by the shop&apos;s physical printer, cancellation or refund is strictly not feasible unless there was a verifiable mechanical misprint.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">2. Order Cancellation Window</h2>
              <ul className="list-disc pl-6 space-y-2 text-slate-600">
                <li>
                  <b className="text-slate-900">Pay-at-Counter Orders:</b> You may cancel an unpaid counter order at any time directly through the tracking page or by asking the shopkeeper to cancel your token before printing.
                </li>
                <li>
                  <b className="text-slate-900">Online Prepaid Orders:</b> If you paid online via Razorpay, you can request cancellation before the shopkeeper claims and prints the order. Once claimed or printing has commenced, cancellation is locked.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">3. Misprints, Paper Jams &amp; Printer Malfunctions</h2>
              <p>
                We stand behind quality printouts. If your printed pages encounter any of the following issues:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>Paper jam tearing the physical document.</li>
                <li>Faint or illegible text caused by low printer toner.</li>
                <li>Wrong orientation or missing pages caused by hardware spooling errors.</li>
              </ul>
              <p className="mt-2">
                The shopkeeper will immediately inspect the misprint, mark it as discarded, and click <b>Re-Print</b> to reprint the document for you at zero additional cost. If the printer cannot complete the job, the payment will be refunded in full.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">4. Refund Processing &amp; Timelines</h2>
              <p>
                Approved online refunds are processed via our payment gateway partner, <b>Razorpay</b>, back to the original method of payment (UPI ID, credit/debit card, or net banking account):
              </p>
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs sm:text-sm text-slate-700 space-y-1">
                <p><b>Refund Mode:</b> Original payment source (Bank / UPI / Card)</p>
                <p><b>Processing Window:</b> Initiated within 24 hours of cancellation approval</p>
                <p><b>Bank Credit Timeline:</b> 5 to 7 business days depending on your issuing bank</p>
                <p><b>Deductions:</b> Zero deduction for platform or technical failures</p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">5. How to Request a Refund</h2>
              <p>
                To request support or report an unfulfilled order, please contact our support team or reach out to the shop owner:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-600">
                <li>Provide your <b>Order ID</b> (e.g. #ord_...) or <b>Token Number</b>.</li>
                <li>State the shop name and reason for refund (e.g., shop closed, hardware failure).</li>
                <li>Email our support desk at <a href="mailto:support@printiva.in" className="text-emerald-700 underline font-semibold">support@printiva.in</a> or submit a message via our <Link href="/contact" className="text-emerald-700 underline font-semibold">Contact Page</Link>.</li>
              </ul>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-200 flex flex-wrap gap-4 justify-between items-center text-xs sm:text-sm text-slate-500">
            <div>© 2026 Printiva. All rights reserved.</div>
            <div className="flex gap-4">
              <Link href="/privacy" className="hover:text-emerald-700 underline">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-emerald-700 underline">Terms of Service</Link>
              <Link href="/contact" className="hover:text-emerald-700 underline">Contact Us</Link>
            </div>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
