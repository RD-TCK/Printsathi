import { SiteHeader } from "@/components/site-header";
import { MarketingFooter, Steps, TrialCallout, workflowSteps } from "@/components/marketing-site";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, howToJsonLd, pageMetadata } from "@/lib/seo";
import { ShieldCheck, Smartphone, Terminal } from "lucide-react";

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
    <div className="min-h-screen bg-white text-ink dark:bg-[#090b0f] dark:text-slate-100">
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
        <section className="border-b border-line bg-gradient-to-b from-emerald-50/50 via-white to-sky-50/30 dark:border-white/[0.08] dark:from-[#0e151a] dark:via-[#0d1016] dark:to-[#0c1218] py-16 lg:py-24">
          <div className="mx-auto max-w-4xl px-6 text-center lg:px-8">
            <h1 className="text-3xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-5xl">
              Four Steps from Counter Scan to Print
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              Built for Indian photocopy shops, campus xerox counters, and cyber cafes where speed and verified payment matter.
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
        <section className="border-t border-line bg-slate-50/50 dark:border-white/[0.08] dark:bg-[#0d1016] py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center mb-14">
              <h2 className="text-3xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-4xl">
                A Calmer Workflow for Everyone at the Counter
              </h2>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <div className="rounded-2xl border border-line bg-white p-7 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-500/12 dark:text-cyan-400 mb-4">
                  <Smartphone className="size-5" />
                </div>
                <h3 className="text-base font-bold text-brand-950">For Customers</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  No app install needed. Scan the counter sticker, pick pages, choose B&amp;W or color, and pay via any UPI app without sharing your phone number.
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-white p-7 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-400 mb-4">
                  <Terminal className="size-5" />
                </div>
                <h3 className="text-base font-bold text-brand-950">For Shopkeepers</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  No more downloading random WhatsApp attachments, fighting USB pen-drive virus infections, or verifying fake payment screenshots. Printiva automatically collects payments and feeds your printer.
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-white p-7 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/12 dark:text-blue-400 mb-4">
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
