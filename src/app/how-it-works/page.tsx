import { SiteHeader } from "@/components/site-header";
import { MarketingFooter, Steps, TrialCallout, workflowSteps } from "@/components/marketing-site";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, howToJsonLd, pageMetadata } from "@/lib/seo";
import { ArrowRight, CheckCircle2, QrCode, ShieldCheck, Smartphone, Terminal } from "lucide-react";

export const metadata = pageMetadata({
  title: "How Print Automation Works — QR Ordering & Automatic Photocopy Software",
  description:
    "Learn how Printiva print automation software streamlines photocopy & print shops in 4 steps: customer scans QR, uploads files, pays via UPI/Cash, and your printer spools automatically.",
  path: "/how-it-works",
  keywords: [
    "how print automation software works",
    "photocopy software workflow",
    "automatic printing process",
    "QR code document printing",
    "xerox shop automation steps",
  ],
});

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-white text-ink">
      <JsonLd
        data={[
          howToJsonLd({
            name: "How to print a document at a Printiva print shop",
            description:
              "Print documents from your phone at a local print shop using its Printiva QR code, with no app download.",
            steps: workflowSteps,
          }),
          breadcrumbJsonLd([
            ["Home", "/"],
            ["How It Works", "/how-it-works"],
          ]),
        ]}
      />
      <SiteHeader />

      <main>
        {/* Header */}
        <section className="border-b border-line bg-slate-50/60 py-16 lg:py-24">
          <div className="mx-auto max-w-4xl px-6 text-center lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">The 4-Step Pipeline</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-5xl">
              Four Steps from Counter Scan to Print
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              Built for busy Indian photocopy shops, university xerox counters, and cyber cafes where speed, accuracy, and verified payments matter.
            </p>
          </div>
        </section>

        {/* Steps */}
        <section className="py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Steps />
          </div>
        </section>

        {/* Stakeholder Deep Dive */}
        <section className="border-t border-line bg-slate-50/50 py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Experience Design</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">
                A Calmer Workflow for Everyone at the Counter
              </h2>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <div className="rounded-2xl border border-line bg-white p-7 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 mb-4">
                  <Smartphone className="size-5" />
                </div>
                <h3 className="text-base font-bold text-brand-950">For Customers</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Zero apps to install. Customers scan your counter sticker, pick pages, configure color or B&amp;W, and pay via any UPI app (GPay, PhonePe, Paytm). No phone numbers or chat sharing required.
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-white p-7 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 mb-4">
                  <Terminal className="size-5" />
                </div>
                <h3 className="text-base font-bold text-brand-950">For Shopkeepers</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  No more downloading random WhatsApp attachments, fighting USB pen-drive virus infections, or verifying fake payment screenshots. Printiva automatically collects payments and feeds your printer.
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-white p-7 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 mb-4">
                  <ShieldCheck className="size-5" />
                </div>
                <h3 className="text-base font-bold text-brand-950">For Your Hardware</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Jobs are converted into optimized print streams before reaching your local printer spooler, preventing spooler crashes, paper waste, and mismatched orientation errors.
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
