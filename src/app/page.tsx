import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { FeatureGrid, FaqList, MarketingFooter, TrialCallout, faqItems, workflowSteps } from "@/components/marketing-site";
import { Button } from "@/components/ui/button";
import { LandingScrollStage } from "@/components/landing-scroll-stage";
import { SupportedPrinters } from "@/components/supported-printers";
import { JsonLd } from "@/components/json-ld";
import { faqJsonLd, howToJsonLd, pageMetadata, softwareJsonLd } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Printiva — Printing Software & Print Automation System for Xerox Shops",
  description:
    "India's automated printing software and photocopy shop system. Customers scan your counter QR, upload files, and pay via UPI; your Windows printer prints automatically in 2 seconds. Start 7-day trial for ₹100.",
  path: "/",
  keywords: [
    "printing software",
    "print automation software",
    "printing software for Windows",
    "photocopy software",
    "photocopy shop software",
    "xerox shop software",
    "print shop management software",
    "cyber cafe printing software",
  ],
  absoluteTitle: true,
});

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-ink overflow-x-clip dark:bg-[#121722] dark:text-slate-100">
      <JsonLd
        data={[
          softwareJsonLd(),
          faqJsonLd(faqItems),
          howToJsonLd({
            name: "How Printiva automates printing from phone to Windows printer",
            description:
              "Customers scan a shop counter QR code, upload documents, pay via UPI or cash, and the Windows Desktop Agent prints automatically.",
            steps: workflowSteps,
          }),
        ]}
      />
      <SiteHeader />

      <main className="relative isolate">
        {/* Hero + Scroll-Driven Right->Left Printer & How It Works 3D Simulation */}
        <LandingScrollStage />

        {/* Solid Foreground Sections sit at z-20 above PrintPhysicsCanvas (z-10) */}
        <div className="relative z-20 bg-white dark:bg-[#121722]">
          {/* ━━━ SPECS STRIP ━━━ */}
          <section id="stats-strip" className="border-b border-line dark:border-white/[0.09] dark:bg-[#161c2a]">
            <div className="mx-auto max-w-7xl">
              <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-line dark:divide-white/[0.08]">
                {[
                  { stat: "< 500ms", label: "Spooler dispatch" },
                  { stat: "USB & LAN", label: "Any Windows printer" },
                  { stat: "Razorpay", label: "UPI & cash queue" },
                  { stat: "< 48 MB", label: "Tray memory usage" },
                ].map(({ stat, label }) => (
                  <div key={label} className="px-4 py-6 sm:px-6 sm:py-8 text-left sm:text-center">
                    <p className="text-xl sm:text-3xl font-semibold font-mono text-brand-950 dark:text-white tabular-nums tracking-tight">
                      {stat}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ━━━ BEFORE vs AFTER COMPARISON ━━━ */}
          <section className="py-14 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl">
              <div className="max-w-2xl">
                <p className="text-xs font-mono font-medium uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
                  Counter workflow
                </p>
                <h2 className="mt-2 text-2xl sm:text-4xl font-bold tracking-tight text-brand-950 dark:text-white leading-[1.15]">
                  What changes at the counter.
                </h2>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-400">
                  Customers upload and pay from their phone so you skip file downloads, manual page counting, and payment checks.
                </p>
              </div>

              <div className="mt-8 sm:mt-10 rounded-2xl border border-line dark:border-white/[0.11] bg-white dark:bg-[#192030] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_22px_50px_-18px_rgba(0,0,0,0.55)] overflow-hidden">
                {/* Desktop Column Header */}
                <div className="hidden md:grid md:grid-cols-[180px_1fr_1.05fr] border-b border-line dark:border-white/[0.09] text-xs font-semibold">
                  <div className="px-6 py-3.5 text-slate-500 dark:text-slate-300 bg-slate-50/70 dark:bg-[#141a28]">
                    Stage
                  </div>
                  <div className="px-6 py-3.5 text-slate-500 dark:text-slate-300 bg-slate-50/70 dark:bg-[#141a28]">
                    Manual counter
                  </div>
                  <div className="px-6 py-3.5 border-l border-emerald-200/80 dark:border-emerald-500/25 bg-emerald-50/85 dark:bg-[#152824] dark:bg-gradient-to-b dark:from-emerald-500/[0.16] dark:to-emerald-500/[0.07] text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                    <span>With Printiva</span>
                    <span className="font-mono text-[11px] font-medium text-emerald-700/80 dark:text-emerald-400/80">
                      Automated
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-line dark:divide-white/[0.08]">
                  {[
                    {
                      num: "01",
                      stage: "File intake",
                      before: "WhatsApp downloads and customer USB pen drives filling counter storage.",
                      after: "Customer scans counter QR and uploads straight from their phone browser.",
                      result: "Zero file clutter",
                    },
                    {
                      num: "02",
                      stage: "Page pricing",
                      before: "Opening files by hand to count B&W vs. color pages and compute totals.",
                      after: "Automatic page count, color split, and per-page pricing before checkout.",
                      result: "Live total upfront",
                    },
                    {
                      num: "03",
                      stage: "Payment",
                      before: "Inspecting UPI screenshots on customer phones during busy hours.",
                      after: "Razorpay verifies online UPI or issues a cash counter token number.",
                      result: "Verified before print",
                    },
                    {
                      num: "04",
                      stage: "Printing",
                      before: "Clicking through Ctrl+P, paper tray, and duplex dialogs for every order.",
                      after: "Desktop agent routes B&W and color jobs straight to matching printers.",
                      result: "< 500ms spool",
                    },
                  ].map((row) => (
                    <div
                      key={row.stage}
                      className="grid md:grid-cols-[180px_1fr_1.05fr] text-sm leading-relaxed"
                    >
                      {/* Stage */}
                      <div className="px-5 pt-5 pb-2 md:px-6 md:py-5 flex items-baseline gap-2.5">
                        <span className="font-mono text-xs font-medium text-slate-400 dark:text-slate-500">
                          {row.num}
                        </span>
                        <span className="font-semibold text-brand-950 dark:text-white">
                          {row.stage}
                        </span>
                      </div>

                      {/* Manual / Before */}
                      <div className="px-5 pb-3 md:px-6 md:py-5 text-slate-500 dark:text-slate-400">
                        <span className="md:hidden text-[11px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">
                          Manual counter
                        </span>
                        {row.before}
                      </div>

                      {/* With Printiva */}
                      <div className="px-4 pb-4 md:p-0">
                        <div className="h-full rounded-xl md:rounded-none border border-emerald-200/80 md:border-0 md:border-l md:border-emerald-200/80 dark:border-emerald-500/25 dark:md:border-emerald-500/25 bg-emerald-50/70 dark:bg-emerald-500/[0.10] dark:shadow-[inset_1px_0_0_rgba(52,211,153,0.14)] px-4 py-3 md:px-6 md:py-5 flex flex-col justify-between gap-2">
                          <div>
                            <span className="md:hidden text-[11px] font-mono font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block mb-1">
                              With Printiva
                            </span>
                            <p className="font-medium text-brand-950 dark:text-slate-100">
                              {row.after}
                            </p>
                          </div>
                          <span className="inline-flex w-fit items-center rounded border border-emerald-200/90 bg-white/80 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-800 dark:border-emerald-400/25 dark:bg-[#121926]/90 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:text-emerald-300">
                            {row.result}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="section-glow-divider mx-auto max-w-5xl" />

          {/* ━━━ FEATURES ━━━ */}
          <section className="mx-auto max-w-7xl px-5 sm:px-6 py-14 sm:py-20 lg:py-24 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16 items-start">
              <div className="lg:sticky lg:top-28 max-w-md">
                <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-brand-950 dark:text-white leading-[1.15]">
                  Built for daily print counters.
                </h2>
                <p className="mt-3 sm:mt-4 text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-400">
                  Customers scan your QR, set options, and pay upfront while your Windows printer handles the rest.
                </p>
                <div className="mt-5 sm:mt-6">
                  <Link
                    href="/features"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300"
                  >
                    See full feature specs <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>

              <FeatureGrid limit={6} />
            </div>
          </section>

          {/* ━━━ SUPPORTED PRINTERS CAROUSEL ━━━ */}
          <SupportedPrinters />

          {/* ━━━ WINDOWS AGENT ━━━ */}
          <section className="bg-slate-50/75 dark:bg-[#161d2b] py-14 sm:py-20 lg:py-24 relative overflow-hidden text-ink dark:text-slate-100 border-y border-line dark:border-white/[0.09]">
            <div
              className="hidden dark:block pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_75%_50%,rgba(16,185,129,0.09),transparent_72%)]"
              aria-hidden="true"
            />
            <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
              <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-10 lg:gap-12 items-center">
                <div>
                  <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-brand-950 dark:text-white">
                    The Windows Desktop Agent
                  </h2>
                  <p className="mt-3 sm:mt-4 text-sm sm:text-lg leading-relaxed text-slate-600 dark:text-slate-300">
                    Browsers cannot control paper trays or talk directly to USB drivers. Printiva runs a tray service that hands paid files to the Windows Print Spooler without manual dialogs.
                  </p>
                  <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3">
                    <Button asChild variant="primary" className="w-full sm:w-auto">
                      <Link href="/download">
                        <Download className="size-4" />
                        Download v1.8.37 (.exe)
                      </Link>
                    </Button>
                    <Link
                      href="/shop/printer"
                      className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 py-2.5 text-sm font-semibold text-brand-950 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 dark:border-white/[0.14] dark:bg-[#1d2536] dark:text-slate-100 dark:hover:bg-[#242e42] dark:hover:border-white/25"
                    >
                      Setup Guide
                    </Link>
                  </div>
                </div>

                {/* Technical Spec Card */}
                <div className="rounded-2xl border border-line bg-white p-5 sm:p-7 shadow-2xs space-y-3.5 dark:border-white/[0.12] dark:bg-[#1a2232] dark:bg-gradient-to-b dark:from-[#212a3e] dark:to-[#182030] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_20px_48px_-16px_rgba(0,0,0,0.55)]">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.08] pb-3 text-xs">
                    <span className="font-semibold text-brand-950 dark:text-white">System Specification</span>
                    <span className="font-medium text-emerald-700 dark:text-emerald-400 font-mono">
                      v1.8.37 Release
                    </span>
                  </div>
                  {[
                    ["Operating System", "Windows 10 / 11 (64-bit)"],
                    ["Memory Footprint", "< 48 MB RAM"],
                    ["Supported Protocols", "USB, Wi-Fi, Ethernet, WSD"],
                    ["Spool Latency", "< 500ms Dispatch"],
                    ["Spooler Driver", "Direct Win32 Print Spooler API"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 py-1.5 text-xs font-mono border-b border-slate-100 dark:border-white/[0.06] last:border-b-0">
                      <span className="text-slate-500 dark:text-slate-400">{label}</span>
                      <span className={`font-medium text-right ${label === "Spool Latency" ? "text-emerald-700 dark:text-emerald-400 font-bold" : "text-brand-950 dark:text-slate-200"}`}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ━━━ FAQ ━━━ */}
          <section id="faq-section" className="mx-auto max-w-4xl px-5 sm:px-6 py-14 sm:py-20 lg:py-24 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-brand-950 dark:text-white">
                Frequently asked questions.
              </h2>
              <p className="mt-3 text-sm sm:text-lg leading-relaxed text-muted">
                Setup, printer compatibility, payments, and trial terms.
              </p>
            </div>
            <div className="mt-8 sm:mt-10">
              <FaqList />
            </div>
          </section>

          {/* ━━━ FINAL CTA ━━━ */}
          <TrialCallout />
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
