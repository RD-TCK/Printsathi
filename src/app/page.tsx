import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileStack,
  Play,
  Printer,
  QrCode,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import {
  FeatureGrid,
  FaqList,
  MarketingFooter,
  Steps,
  TrialCallout,
} from "@/components/marketing-site";
import { Button } from "@/components/ui/button";
import { InteractivePrinter } from "@/components/interactive-printer";

export const metadata = {
  title: "Printiva — Scan. Upload. Pay. Print.",
  description:
    "Modern automated printing OS for local print shops. Customers scan, upload, pay — your Windows printer prints hands-free.",
  openGraph: {
    title: "Printiva — Scan. Upload. Pay. Print.",
    description:
      "A clearer, faster way for local shops and their customers to print together.",
    type: "website",
  },
};

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-ink overflow-x-hidden">
      <SiteHeader />

      <main>
        {/* ━━━ HERO ━━━ */}
        <section className="relative isolate overflow-hidden">
          {/* Light background layers */}
          <div className="absolute inset-0 -z-20 bg-gradient-to-b from-brand-50/50 via-white to-white" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(#16a34a_0.5px,transparent_0.5px)] [background-size:32px_32px] opacity-[0.025]" />
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 -z-10 w-[900px] h-[600px] rounded-full bg-emerald-200/25 blur-[140px]" />
          <div className="absolute top-[30%] right-[-15%] -z-10 w-[400px] h-[400px] rounded-full bg-teal-100/30 blur-[100px]" />

          <div className="mx-auto max-w-7xl px-6 pb-20 pt-16 lg:px-8 lg:pt-24 lg:pb-28">
            <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-16 items-center">
              {/* Left: Copy */}
              <div>
                {/* Badge */}
                <div className="reveal inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50/80 px-4 py-1.5 text-xs font-medium text-brand-700">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                  </span>
                  Built for print-shop owners
                </div>

                {/* Headline */}
                <h1 className="reveal reveal-d1 mt-7 text-4xl font-semibold tracking-tight text-brand-950 sm:text-5xl lg:text-[3.5rem] lg:leading-[1.08]">
                  Your counter printer,{" "}
                  <br className="hidden sm:block" />
                  <span className="font-display gradient-text">
                    on&nbsp;autopilot.
                  </span>
                </h1>

                {/* Subhead */}
                <p className="reveal reveal-d2 mt-6 max-w-lg text-base leading-7 text-muted sm:text-lg sm:leading-8">
                  Customers scan your QR, upload a file, pay via
                  Razorpay — and it prints on your Windows machine.
                  No WhatsApp. No Ctrl+P.
                </p>

                {/* CTA */}
                <div className="reveal reveal-d3 mt-9 flex flex-wrap items-center gap-4">
                  <Button asChild size="lg" variant="primary">
                    <Link href="/register" className="group">
                      Start free 7-day trial
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </Button>

                  <Link
                    href="/how-it-works"
                    className="group inline-flex items-center gap-2 rounded-xl border border-line bg-white px-5 py-3 text-sm font-medium text-brand-900 shadow-xs transition-all hover:border-brand-300 hover:shadow-md active:scale-[0.98]"
                  >
                    <Play className="size-3.5 fill-brand-600 text-brand-600" />
                    See how it works
                  </Link>
                </div>

                {/* Trust */}
                <div className="reveal reveal-d4 mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-7 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-brand-500" />
                    Razorpay verified
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Zap className="size-3.5 text-brand-500" />
                    2-second dispatch
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Printer className="size-3.5 text-brand-500" />
                    Any Windows printer
                  </span>
                </div>
              </div>

              {/* Right: Interactive 3D Printer */}
              <div className="reveal reveal-d3 relative flex items-center justify-center lg:justify-end">
                <InteractivePrinter />
              </div>
            </div>
          </div>
        </section>

        {/* ━━━ STATS STRIP ━━━ */}
        <section className="border-y border-line bg-brand-50/40 py-8">
          <div className="mx-auto max-w-5xl px-6">
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-xs font-medium text-muted">
              {[
                { icon: Zap, stat: "2s", label: "Avg. dispatch time" },
                {
                  icon: Printer,
                  stat: "100%",
                  label: "Native Windows printing",
                },
                {
                  icon: ShieldCheck,
                  stat: "Razorpay",
                  label: "Verified payments",
                },
                { icon: FileStack, stat: "<48MB", label: "Agent footprint" },
              ].map(({ icon: Icon, stat, label }, i) => (
                <div key={label} className="flex items-center gap-3">
                  {i > 0 && (
                    <div className="hidden sm:block h-8 w-px bg-brand-200 -ml-6 mr-0" />
                  )}
                  <div className="flex size-10 items-center justify-center rounded-xl bg-white border border-line text-brand-600 shadow-xs">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-brand-950">
                      {stat}
                    </p>
                    <p className="text-muted">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ━━━ OLD vs NEW ━━━ */}
        <section className="py-24 lg:py-32 px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                The modern solution
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
                Stop drowning in{" "}
                <span className="font-display gradient-text">WhatsApp</span>{" "}
                print requests.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted sm:text-lg">
                Traditional shops waste 60% of counter time downloading files,
                counting pages, and verifying UPI screenshots.
              </p>
            </div>

            <div className="mt-16 grid gap-8 md:grid-cols-2">
              {/* Old Way */}
              <div className="group rounded-3xl border border-red-200/60 bg-gradient-to-b from-red-50/40 to-white p-8 transition-all duration-300 hover:shadow-lg hover:shadow-red-950/5">
                <div className="inline-flex items-center gap-2 rounded-full bg-red-100/80 px-3 py-1 text-xs font-semibold text-red-700">
                  The old way
                </div>
                <h3 className="mt-5 text-2xl font-semibold text-brand-950">
                  Chaos at the counter
                </h3>
                <ul className="mt-6 space-y-4 text-sm text-brand-900/70">
                  {[
                    "Customer shares docs via WhatsApp, clogging your phone memory.",
                    "Manual page counting to calculate per-page pricing.",
                    "Waiting for fake UPI payment confirmation screenshots.",
                    "Ctrl+P, pick settings, open dialogs — for every single job.",
                  ].map((text) => (
                    <li key={text} className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-bold">
                        ✕
                      </span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Printiva Way */}
              <div className="group relative rounded-3xl border border-brand-200 bg-gradient-to-b from-brand-50/50 to-white p-8 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-950/5 overflow-hidden">
                <div className="absolute top-0 right-0 size-64 rounded-full bg-emerald-300/10 blur-3xl pointer-events-none" />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-full bg-brand-100/80 px-3 py-1 text-xs font-semibold text-brand-800">
                    <Sparkles className="size-3 text-brand-600" />
                    The Printiva way
                  </div>
                  <h3 className="mt-5 text-2xl font-semibold text-brand-950">
                    Automated & effortless
                  </h3>
                  <ul className="mt-6 space-y-4 text-sm text-brand-900">
                    {[
                      "Customer scans your QR — uploads directly from phone.",
                      "Automated page detection, color split, and instant pricing.",
                      "Razorpay-verified payment before jobs enter the queue.",
                      "Silent Agent dispatches to the correct physical printer.",
                    ].map((text) => (
                      <li key={text} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-600" />
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="section-glow-divider mx-auto max-w-4xl" />

        {/* ━━━ WORKFLOW ━━━ */}
        <section className="py-24 lg:py-32">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                Workflow
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
                From scan to{" "}
                <span className="font-display gradient-text">warm paper</span>{" "}
                in seconds.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted sm:text-lg">
                A streamlined four-step flow so your technicians can focus on
                finishing work.
              </p>
            </div>
            <div className="mt-16">
              <Steps />
            </div>
          </div>
        </section>

        <div className="section-glow-divider mx-auto max-w-4xl" />

        {/* ━━━ FEATURES ━━━ */}
        <section className="mx-auto max-w-7xl px-6 py-24 lg:py-32 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              Powerful features
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
              Engineered for{" "}
              <span className="font-display gradient-text">real-world</span>{" "}
              print shops.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted sm:text-lg">
              Every detail tuned for speed, hardware reliability, and zero
              queue bottlenecks.
            </p>
          </div>
          <div className="mt-16">
            <FeatureGrid limit={6} />
          </div>
        </section>

        {/* ━━━ WINDOWS AGENT ━━━ */}
        <section className="bg-brand-950 py-24 lg:py-32 relative overflow-hidden">
          <div className="absolute top-0 left-1/3 -z-10 size-[600px] rounded-full bg-emerald-600/10 blur-[160px] pointer-events-none" />
          <div className="absolute bottom-0 right-0 -z-10 size-96 rounded-full bg-teal-500/8 blur-[100px] pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(#22c55e_0.5px,transparent_0.5px)] [background-size:32px_32px] opacity-[0.03]" />

          <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
            <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-12 items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                  Hardware native
                </p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl lg:leading-[1.1]">
                  The Windows{" "}
                  <span className="font-display italic text-emerald-400">
                    Desktop Agent
                  </span>
                </h2>
                <p className="mt-5 text-base leading-7 text-white/55 sm:text-lg">
                  Browsers can&apos;t control hardware or switch paper drawers.
                  Printiva uses a lightweight service in your system tray that
                  bridges directly with the Windows Print Spooler.
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Button asChild variant="primary">
                    <Link href="/download">
                      <Download className="size-4" />
                      Download Installer
                    </Link>
                  </Button>
                  <Link
                    href="/shop/printer"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white"
                  >
                    <Printer className="size-4" />
                    Setup Guide
                  </Link>
                </div>
              </div>

              {/* Spec card */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4 backdrop-blur-sm">
                <div className="flex items-center justify-between border-b border-white/5 pb-3 text-xs">
                  <span className="font-semibold text-white">
                    System Compatibility
                  </span>
                  <span className="font-medium text-emerald-400">
                    100% Tested
                  </span>
                </div>
                {[
                  ["OS", "Windows 10 / 11 (64-bit)"],
                  ["Memory", "< 48 MB RAM"],
                  ["Protocols", "USB, Wi-Fi, Ethernet, WSD"],
                  ["Response", "2-Second Poll Interval"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between py-1 text-xs font-mono"
                  >
                    <span className="text-white/35">{label}</span>
                    <span
                      className={`font-medium ${
                        label === "Response"
                          ? "text-emerald-400"
                          : "text-white/75"
                      }`}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ━━━ FAQ ━━━ */}
        <section className="mx-auto max-w-4xl px-6 py-24 lg:py-32 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              Common questions
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">
              Everything you need to know.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted sm:text-lg">
              Shop onboarding, hardware, payments, and our free trial.
            </p>
          </div>
          <div className="mt-14">
            <FaqList />
          </div>
        </section>

        {/* ━━━ FINAL CTA ━━━ */}
        <TrialCallout />
      </main>

      <MarketingFooter />
    </div>
  );
}
