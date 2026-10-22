import Link from "next/link";
import { ShieldCheck, Lock, Trash2, EyeOff, FileText, CheckCircle2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter } from "@/components/marketing-site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "Learn how Printiva protects your privacy, secures uploaded documents with ephemeral storage, and handles customer data in compliance with Indian IT regulations.",
  path: "/privacy",
  keywords: ["Printiva privacy policy", "document privacy", "ephemeral print security", "print shop privacy India"],
});

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <SiteHeader />

      <main className="flex-1 py-12 sm:py-20">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          {/* Header */}
          <div className="border-b border-slate-200 pb-8 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200 mb-4">
              <ShieldCheck className="size-4 text-emerald-600" />
              Your Privacy Matters
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
              Privacy Policy
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-600">
              Last updated: October 2026 · Effective across all Printiva services, QR print ordering, and desktop agent software.
            </p>
          </div>

          {/* Key Privacy Highlights Card */}
          <div className="mt-8 rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Privacy at a Glance</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3 items-start">
                <Trash2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">Ephemeral Document Processing</b>
                  Customer documents are securely purged after printing. We do not store or sell your private PDFs or photos.
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <Lock className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">PCI-DSS Payment Protection</b>
                  Online payments are processed directly through Razorpay. We never store credit cards, debit cards, or UPI PINs.
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <EyeOff className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">No Tracking / No Ads</b>
                  We do not sell customer data to third-party ad networks or data brokers.
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-slate-600">
                  <b className="text-slate-900 block">IT Act &amp; DPDP Compliant</b>
                  Designed to comply with the Information Technology Act, 2000 and Digital Personal Data Protection Act (DPDP), 2023.
                </div>
              </div>
            </div>
          </div>

          {/* Full Policy Content */}
          <div className="mt-10 space-y-8 text-sm sm:text-base text-slate-700 leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">1. Introduction</h2>
              <p>
                Printiva (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the Printiva online digital printing platform,
                website, and Windows Desktop Agent software. We connect customers who need printouts with local verified print shops through QR code scanning, multi-document configuration, online/counter payments, and automated Windows printing.
              </p>
              <p>
                This Privacy Policy explains how we collect, use, store, and protect your information when you use our website, mobile interface, or partner print shop portals.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">2. Information We Collect</h2>
              <p>We only collect the minimum information required to facilitate document printing and order verification:</p>
              <ul className="list-disc pl-6 space-y-2 text-slate-600">
                <li>
                  <b className="text-slate-900">Document Files:</b> PDFs, images (JPEG, PNG, WEBP), and documents you upload to configure print settings (pages, color, copies, duplex).
                </li>
                <li>
                  <b className="text-slate-900">Order Identifiers &amp; Tokens:</b> Ephemeral token numbers (e.g., Token #3), public order tracking IDs, timestamps, and page breakdown counts.
                </li>
                <li>
                  <b className="text-slate-900">Contact &amp; Payment Details:</b> Customer phone number (if provided for WhatsApp order delivery or OTP login), transaction identifiers generated by payment gateways (Razorpay), and billing receipts.
                </li>
                <li>
                  <b className="text-slate-900">Shop Partner Information:</b> Shop owner name, business email, store location, connected printer models, and agent authentication tokens.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">3. Document Security &amp; Automated Cleanup</h2>
              <p>
                Your privacy and document confidentiality are paramount. All file uploads are transmitted over encrypted TLS 1.3 connections to secure object storage.
              </p>
              <p>
                Once a job is printed, the local agent purges temporary spool files from the shopkeeper&apos;s computer. Uploaded document URLs are ephemeral and expire automatically. We maintain strict access control: shopkeepers only receive documents explicitly queued for their shop&apos;s printer.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">4. Payment Processing with Razorpay</h2>
              <p>
                When you make an online payment via UPI, Credit/Debit Card, or Net Banking, your payment is processed directly by <b>Razorpay Software Private Limited</b>, a PCI-DSS certified payment aggregator regulated by the Reserve Bank of India (RBI).
              </p>
              <p>
                Printiva does not collect, view, or store sensitive financial credentials such as card numbers, CVVs, expiry dates, or UPI PINs.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">5. 1-Hour Token Validity &amp; Expiry</h2>
              <p>
                Counter print requests generate a 1-hour verification token. Once the token is approved and physically printed by the shopkeeper, the timer stops automatically. If a counter token is abandoned or remains unprinted after 1 hour, it expires and temporary documents are automatically decommissioned.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">6. Data Retention &amp; Customer Rights</h2>
              <p>
                Under the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 and DPDP Act, 2023, you have the right to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-600">
                <li>Access the order history and receipts associated with your phone number.</li>
                <li>Request immediate erasure of uploaded files and order records.</li>
                <li>Revoke marketing or WhatsApp communication preferences at any time.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">7. Grievance Officer &amp; Contact</h2>
              <p>
                In accordance with Information Technology Act, 2000 and rules made thereunder, the Grievance Officer for Printiva can be contacted at:
              </p>
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs sm:text-sm text-slate-700 space-y-1">
                <p><b>Grievance Officer:</b> Privacy &amp; Compliance Team</p>
                <p><b>Company:</b> Printiva</p>
                <p><b>Email:</b> <a href="mailto:support@printiva.in" className="text-emerald-700 underline">support@printiva.in</a></p>
                <p><b>Operating Location:</b> India</p>
                <p><b>Response Time:</b> Within 24-48 business hours</p>
              </div>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-200 flex flex-wrap gap-4 justify-between items-center text-xs sm:text-sm text-slate-500">
            <div>© 2026 Printiva. All rights reserved.</div>
            <div className="flex gap-4">
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
