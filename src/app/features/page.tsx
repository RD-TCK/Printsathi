import { SiteHeader } from "@/components/site-header";
import { FeatureGrid, MarketingFooter, TrialCallout } from "@/components/marketing-site";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { Layers, Printer, ShieldCheck } from "lucide-react";

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
    <div className="min-h-screen bg-white text-ink dark:bg-[#090b0f] dark:text-slate-100">
      <JsonLd
        data={breadcrumbJsonLd([
          ["Home", "/"],
          ["Features", "/features"],
        ])}
      />
      <SiteHeader />

      <main>
        {/* Header */}
        <section className="border-b border-line bg-gradient-to-b from-emerald-50/50 via-white to-sky-50/30 dark:border-white/[0.08] dark:from-[#0e151a] dark:via-[#0d1016] dark:to-[#0c1218] py-16 lg:py-24">
          <div className="mx-auto max-w-4xl px-6 text-center lg:px-8">
            <h1 className="text-3xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-5xl">
              Features built for busy print counters
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              Printiva replaces manual WhatsApp downloads and hand page-counting with QR upload, automated billing, and direct Windows print spooling.
            </p>
          </div>
        </section>

        {/* Feature List */}
        <section className="py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <FeatureGrid />
          </div>
        </section>

        {/* Technical Deep Dive */}
        <section className="border-t border-line bg-slate-50/50 dark:border-white/[0.08] dark:bg-[#0d1016] py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center mb-14">
              <h2 className="text-3xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-4xl">
                Technical Architecture
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted">
                How Printiva handles concurrent student queues, PDF rendering, and direct printer communication.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <div className="rounded-2xl border border-line bg-white p-7 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-400 mb-4">
                  <Printer className="size-5" />
                </div>
                <h3 className="text-base font-bold text-brand-950">Win32 Spooler Integration</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Skips browser print dialogs. The Windows agent passes jobs directly to SumatraPDF and the Windows Print Spooler API.
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-white p-7 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-500/12 dark:text-cyan-400 mb-4">
                  <Layers className="size-5" />
                </div>
                <h3 className="text-base font-bold text-brand-950">Color &amp; Monochrome Routing</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Inspects incoming PDFs, splits black &amp; white sheets from color pages, and sends them to separate monochrome laser and color printers.
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-white p-7 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/12 dark:text-blue-400 mb-4">
                  <ShieldCheck className="size-5" />
                </div>
                <h3 className="text-base font-bold text-brand-950">Razorpay Webhook Verification</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Jobs dispatch to your printer only after server-side Razorpay confirmation, blocking fake UPI screenshot fraud.
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
