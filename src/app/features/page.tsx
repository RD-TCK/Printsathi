import { SiteHeader } from "@/components/site-header";
import { FeatureGrid, MarketingFooter, SectionHeading, TrialCallout } from "@/components/marketing-site";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { Cpu, FileStack, Layers, Printer, ShieldCheck, Zap } from "lucide-react";

export const metadata = pageMetadata({
  title: "Printing Software Features — Print Automation & Photocopy Management",
  description:
    "Explore Printiva's print automation software features: QR code document upload, automatic page counting, multi-printer queue routing, split color/mono spooling, and native Windows printing.",
  path: "/features",
  keywords: [
    "print automation software features",
    "photocopy software capabilities",
    "printing software for Windows",
    "automatic print spooler software",
    "xerox shop management features",
    "cyber cafe printing tools",
  ],
});

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-white text-ink">
      <JsonLd
        data={breadcrumbJsonLd([
          ["Home", "/"],
          ["Features", "/features"],
        ])}
      />
      <SiteHeader />

      <main>
        {/* Header */}
        <section className="border-b border-line bg-slate-50/60 py-16 lg:py-24">
          <div className="mx-auto max-w-4xl px-6 text-center lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Platform Foundation</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-5xl">
              Engineered for Speed, Reliability, and Zero Queue Bottlenecks
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              Printiva replaces chaotic WhatsApp file transfers and manual page counting with an automated pipeline from customer smartphone to Windows print spooler.
            </p>
          </div>
        </section>

        {/* Feature Grid */}
        <section className="py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <FeatureGrid />
          </div>
        </section>

        {/* Technical Deep Dive */}
        <section className="border-t border-line bg-slate-50/50 py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Under the Hood</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">
                Technical Specifications &amp; Architecture
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted">
                How Printiva handles high-concurrency student queues, PDF rendering, and direct driver communication.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <div className="rounded-2xl border border-line bg-white p-7 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 mb-4">
                  <Printer className="size-5" />
                </div>
                <h3 className="text-base font-bold text-brand-950">Win32 Spooler Integration</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Bypasses browser print dialogs completely. The native agent speaks directly to SumatraPDF and the Windows Print Spooler API, eliminating print delays and driver lockups.
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-white p-7 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 mb-4">
                  <Layers className="size-5" />
                </div>
                <h3 className="text-base font-bold text-brand-950">Color &amp; Monochrome Routing</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  The system analyzes incoming PDFs, separates black &amp; white pages from full-color sheets, and can split jobs across dedicated high-speed laser and color inkjet trays.
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-white p-7 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 mb-4">
                  <ShieldCheck className="size-5" />
                </div>
                <h3 className="text-base font-bold text-brand-950">Razorpay Webhook Verification</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Jobs are dispatched to printers only after server-side cryptographic verification of the UPI transaction, preventing payment fraud and screenshot scams completely.
                </p>
              </div>
            </div>
          </div>
        </section>

        <TrialCallout />
      </main>

      <MarketingFooter />
    </div>
  );
}
