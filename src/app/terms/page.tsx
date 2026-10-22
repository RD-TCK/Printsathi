import Link from "next/link";
import { FileText, ShieldAlert, Store, Clock, Award, CheckCircle } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter } from "@/components/marketing-site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Terms and Conditions",
  description:
    "Read the terms of service, customer responsibilities, token validity rules, and shop partner guidelines for using the Printiva printing platform.",
  path: "/terms",
  keywords: ["Printiva terms of service", "print shop terms", "printing agreement India", "token validity terms"],
});

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <SiteHeader />

      <main className="flex-1 py-12 sm:py-20">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          {/* Header */}
          <div className="border-b border-slate-200 pb-8 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200 mb-4">
              <FileText className="size-4 text-emerald-600" />
              Service Agreement
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
              Terms &amp; Conditions
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-600">
              Last updated: October 2026 · Please review these terms carefully before uploading documents or partnering as a print shop.
            </p>
          </div>

          {/* Quick Summary Highlights */}
          <div className="mt-8 rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Key Terms Summary</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3 items-start">
                <Clock className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">1-Hour Token Window</b>
                  Counter tokens are active for 60 minutes for counter verification. Once printed, the timer stops automatically.
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <Store className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">Local Shop Fulfillment</b>
                  Orders are printed on physical printers at your chosen local print shop and collected directly at the shop counter.
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <ShieldAlert className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">Lawful Use &amp; Content</b>
                  Users must own or have permission to print documents. Prohibited, unlawful, or infringing files are strictly barred.
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <Award className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">Transparent Pricing</b>
                  Pricing rules are set directly by partner shops per page (B&amp;W/Color/Duplex). All totals are shown before payment.
                </div>
              </div>
            </div>
          </div>

          {/* Body Sections */}
          <div className="mt-10 space-y-8 text-sm sm:text-base text-slate-700 leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">1. Acceptance of Terms</h2>
              <p>
                By visiting, accessing, or using Printiva (accessible at printiva.in or via partner shop QR codes), you agree to be bound by these Terms and Conditions and our Privacy Policy. If you do not agree to these terms, please do not use our services.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">2. Service Description</h2>
              <p>
                Printiva is a technology platform that connects customers with local print shops. Customers upload files from their smartphones or laptops, configure print options (copies, page ranges, color mode, duplex), and generate a digital Token Number.
              </p>
              <p>
                The shopkeeper receives the print order on their Windows Desktop Agent and approves it for instant printing on their connected physical printer.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">3. Token Numbers &amp; 1-Hour Expiration</h2>
              <ul className="list-disc pl-6 space-y-2 text-slate-600">
                <li>
                  <b className="text-slate-900">Counter Orders:</b> Tokens generated for &quot;Pay at Counter&quot; have a validity window of 1 hour (60 minutes).
                </li>
                <li>
                  <b className="text-slate-900">Automatic Timer Stop:</b> As soon as the shopkeeper approves and physically prints the document, the 1-hour timer stops immediately and marks the token as &quot;Printed / Completed&quot;.
                </li>
                <li>
                  <b className="text-slate-900">Expired Tokens:</b> If a customer does not show up at the shop within 1 hour, the token expires to prevent shop queue clutter. Expired tokens can be refreshed by submitting a new request.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">4. User Responsibilities &amp; Content Guidelines</h2>
              <p>When uploading documents to Printiva, you warrant that:</p>
              <ul className="list-disc pl-6 space-y-2 text-slate-600">
                <li>You hold the legal right or copyright to print the document.</li>
                <li>The content does not contain hate speech, defamatory material, obscene imagery, counterfeit currency documents, or material violating Indian laws.</li>
                <li>You are solely responsible for verifying your selected print options (page ranges, color vs. black &amp; white, single vs. double sided) before approving payment.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">5. Shopkeeper &amp; Partner Obligations</h2>
              <p>Print shop owners registered on Printiva agree to:</p>
              <ul className="list-disc pl-6 space-y-2 text-slate-600">
                <li>Maintain operational printer hardware, paper stock, and toner for all claimed print jobs.</li>
                <li>Ensure confidential handling of customer printouts, destroying misprinted sheets and guarding customer privacy.</li>
                <li>Honor listed rates and fulfill approved orders promptly when customers present valid tokens.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">6. Payments, Pricing, and Taxes</h2>
              <p>
                All prices are denominated in Indian Rupees (INR). Print pricing is determined by each shop according to their configured pricing tiers. Online payments are securely processed via Razorpay. Printiva may charge a nominal platform fee or subscription charge for platform maintenance.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">7. Limitation of Liability</h2>
              <p>
                Printiva acts as a technology intermediary under Section 79 of the Information Technology Act, 2000. While we strive for 100% platform uptime, Printiva shall not be held liable for local printer mechanical jams, shop power cuts, paper defects, or delays caused by third-party payment gateways.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">8. Governing Law &amp; Jurisdiction</h2>
              <p>
                These Terms and Conditions shall be governed by and construed in accordance with the laws of India. Any disputes arising out of or related to these terms shall be subject to the exclusive jurisdiction of the competent courts in India.
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-200 flex flex-wrap gap-4 justify-between items-center text-xs sm:text-sm text-slate-500">
            <div>© 2026 Printiva. All rights reserved.</div>
            <div className="flex gap-4">
              <Link href="/privacy" className="hover:text-emerald-700 underline">Privacy Policy</Link>
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
