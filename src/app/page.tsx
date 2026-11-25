import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, Download, Play, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { FeatureGrid, FaqList, MarketingFooter, Steps, TrialCallout } from "@/components/marketing-site";
import { Button } from "@/components/ui/button";
import { HeroAnimatedHeading } from "@/components/hero-animated-heading";
import { AuthBackgroundDecoration } from "@/components/auth-background-decoration";
import { JsonLd } from "@/components/json-ld";
import { faqItems } from "@/components/marketing-site";
import { faqJsonLd, pageMetadata, softwareJsonLd } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Printiva — #1 Print Automation Software & Photocopy Management System",
  description:
    "India's leading print automation software & photocopy management system. Automate printing in xerox shops & cyber cafes: customers scan QR, upload files, and pay; your Windows printer prints automatically. Start 7-day trial for ₹100.",
  path: "/",
  keywords: [
    "print automation software",
    "printing software",
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
    <div className="min-h-screen bg-white text-ink overflow-x-clip">
      <JsonLd data={[softwareJsonLd(), faqJsonLd(faqItems)]} />
      <SiteHeader />

      <main className="relative isolate">
        {/* ━━━ HERO ━━━ */}
        <section className="relative isolate overflow-hidden min-h-[calc(100vh-4rem)] flex items-center justify-center border-b border-line">
          {/* Architectural Background */}
          <div className="absolute inset-0 -z-30 bg-gradient-to-b from-[#fafaf8] via-white to-white" />

          {/* 3D Print Shop Scene: Full-Height Stretched Backdrop */}
          <div className="absolute inset-0 -z-20 pointer-events-none select-none overflow-hidden">
            <Image
              src="/hero-printiva-scene.webp"
              alt="Printiva Automated Print Shop Counter"
              fill
              priority
              sizes="100vw"
              className="object-cover object-center md:object-fill opacity-75 sm:opacity-85"
            />
            {/* Soft uniform emerald/lime tint across the scene so foreground copy stays readable without hiding the printer */}
            <div
              className="absolute inset-0 bg-gradient-to-br from-emerald-50/40 via-white/30 to-lime-50/40"
              aria-hidden="true"
            />
          </div>

          {/* Background Decoration Same as Auth Page (including soft lime & green ambient tint orbs) */}
          <AuthBackgroundDecoration />

          {/* Centralized Content Container */}
          <div className="relative mx-auto max-w-3xl px-6 pb-10 pt-10 sm:pt-12 sm:pb-12 lg:px-8 w-full flex flex-col items-center text-center z-10">
            {/* Light, Non-Obscuring Central Feather & Subtle Green/Lime Glow */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-[640px] h-[95%] bg-[radial-gradient(closest-side,rgba(255,255,255,0.28)_20%,rgba(255,255,255,0.1)_60%,transparent_100%)] pointer-events-none -z-10"
              aria-hidden="true"
            />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[480px] h-[180px] sm:h-[240px] rounded-full bg-gradient-to-tr from-emerald-400/12 via-lime-300/15 to-teal-200/8 blur-[70px] pointer-events-none -z-10"
              aria-hidden="true"
            />

            {/* Dynamic Moving Headline with Editorial Typography */}
            <HeroAnimatedHeading />

            {/* Clean, Single-Flow Subhead */}
            <p className="reveal reveal-d2 mt-5 max-w-lg text-base leading-relaxed text-slate-800 font-normal text-center [text-shadow:0_1px_12px_rgba(255,255,255,0.9)]">
              Customers scan your counter QR, pay via UPI, and print automatically in 2 seconds — no pen drives, no virus risks, no lost files.
            </p>

            {/* CTA Hierarchy */}
            <div className="reveal reveal-d3 mt-7 flex flex-col items-center gap-4 w-full">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg" className="rounded-full bg-brand-950 text-white hover:bg-emerald-950 px-7 py-3 text-[13px] font-semibold tracking-wide shadow-sm hover:shadow-md transition-all active:scale-[0.98]">
                  <Link href="/register">
                    Start ₹100 for 7 Days Trial
                  </Link>
                </Button>

                <Link
                  href="/how-it-works"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 backdrop-blur-md px-5 py-3 text-[13px] font-medium text-slate-800 hover:text-slate-950 hover:bg-white hover:border-slate-300 shadow-xs transition-all active:scale-[0.98]"
                >
                  <Play className="size-3 fill-slate-800 text-slate-800" />
                  See 30-sec demo
                </Link>
              </div>

              {/* Single Clean Hardware Pill */}
              <div className="inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 rounded-full border border-slate-200/80 bg-white/85 backdrop-blur-md px-4 py-1.5 text-xs text-slate-600 shadow-2xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-600" />
                  Windows 10 &amp; 11 Agent
                </span>
                <span className="text-slate-300">•</span>
                <Link
                  href="/download"
                  className="font-medium text-emerald-800 hover:text-emerald-950 hover:underline inline-flex items-center gap-1"
                >
                  Download v1.8.34 (.exe)
                  <Download className="size-3 text-emerald-800" />
                </Link>
              </div>
            </div>

            {/* Scroll Indicator */}
            <div className="reveal reveal-d4 mt-8 flex flex-col items-center">
              <a
                href="#stats-strip"
                className="group flex flex-col items-center gap-1 text-slate-500 hover:text-emerald-800 transition-colors"
                aria-label="Scroll to overview"
              >
                <div className="w-4 h-7 rounded-full border border-slate-400/80 bg-white/70 group-hover:border-emerald-700 flex items-start justify-center p-0.5 transition-colors">
                  <div className="w-1 h-2 rounded-full bg-slate-500 group-hover:bg-emerald-700 animate-scroll-down transition-colors" />
                </div>
                <span className="text-[9px] font-mono tracking-[0.2em] uppercase text-slate-500 group-hover:text-emerald-800 transition-colors">
                  Scroll
                </span>
              </a>
            </div>
          </div>
        </section>

        {/* ━━━ STATS STRIP ━━━ */}
        <section id="stats-strip" className="border-b border-line/80 bg-white/70 backdrop-blur-xs py-9">
          <div className="mx-auto max-w-5xl px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 text-center">
              {[
                { stat: "2s", label: "Avg. dispatch time" },
                { stat: "100%", label: "Windows print spooling" },
                { stat: "Razorpay", label: "Verified UPI & cards" },
                { stat: "<48MB", label: "Agent memory footprint" },
              ].map(({ stat, label }, idx) => (
                <div key={label} className={idx > 0 ? "pt-4 sm:pt-0 space-y-1" : "space-y-1"}>
                  <p className="text-3xl sm:text-4xl font-light font-mono text-slate-900 tabular-nums tracking-tight">
                    {stat}
                  </p>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ━━━ OLD vs NEW ━━━ */}
        <section className="py-20 lg:py-28 px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">The modern solution</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl lg:text-5xl">
                Stop drowning in WhatsApp print requests.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted sm:text-lg">
                Traditional counters waste 60% of their day downloading files, counting pages, and verifying manual UPI screenshots.
              </p>
            </div>

            <div className="mt-14 grid gap-8 md:grid-cols-2">
              {/* Old Way */}
              <div className="rounded-2xl border border-rose-200/80 bg-rose-50/30 p-8">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">
                  The old way
                </div>
                <h3 className="mt-5 text-xl font-bold text-brand-950">Chaos at the counter</h3>
                <ul className="mt-6 space-y-4 text-sm text-slate-700">
                  {[
                    "Customers share docs via WhatsApp, clogging phone memory and chat history.",
                    "Manual page counting on slow PDF viewers to calculate per-page pricing.",
                    "Waiting for and verifying fake UPI payment confirmation screenshots.",
                    "Manual Ctrl+P, selecting paper drawers, duplex settings for every job.",
                  ].map((text) => (
                    <li key={text} className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                        <X className="size-3" />
                      </span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Printiva Way */}
              <div className="rounded-2xl border border-brand-200/80 bg-brand-50/40 p-8">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-800">
                  The Printiva way
                </div>
                <h3 className="mt-5 text-xl font-bold text-brand-950">Automated &amp; effortless</h3>
                <ul className="mt-6 space-y-4 text-sm text-slate-800">
                  {[
                    "Customer scans counter QR sticker and uploads directly from mobile browser.",
                    "Automatic page detection, color vs B&W split, and instant per-page pricing.",
                    "Cryptographically verified UPI payment before jobs enter the queue.",
                    "Silent Windows Desktop Agent dispatches immediately to physical printers.",
                  ].map((text) => (
                    <li key={text} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-700" />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <div className="section-glow-divider mx-auto max-w-5xl" />

        {/* ━━━ WORKFLOW ━━━ */}
        <section className="py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Workflow</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl lg:text-5xl">
                Four steps from scan to print.
              </h2>
              <p className="mt-4 text-base leading-7 text-muted sm:text-lg">
                Customers upload from their phone, pay upfront, and collect prints at your counter.
              </p>
            </div>
            <div className="mt-14">
              <Steps />
            </div>
          </div>
        </section>

        <div className="section-glow-divider mx-auto max-w-5xl" />

        {/* ━━━ FEATURES ━━━ */}
        <section className="mx-auto max-w-7xl px-6 py-20 lg:py-28 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Hardware &amp; Software Features</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl lg:text-5xl">
              Engineered for real-world print shops.
            </h2>
            <p className="mt-4 text-base leading-7 text-muted sm:text-lg">
              Every detail tuned for speed, hardware reliability, and zero queue bottlenecks.
            </p>
          </div>
          <div className="mt-14">
            <FeatureGrid limit={6} />
          </div>
        </section>

        {/* ━━━ SEO PILLAR: PRINT AUTOMATION & PHOTOCOPY SOFTWARE ━━━ */}
        <section className="bg-slate-50/70 border-t border-line py-20 lg:py-28 px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Built for Indian Xerox &amp; Print Counters</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl lg:text-5xl">
                The Complete Print Automation Software &amp; Photocopy Suite
              </h2>
              <p className="mt-4 text-base leading-7 text-muted sm:text-lg">
                Built for university xerox shops, cyber cafes, and print centers—automating customer intake, payment, and physical printing.
              </p>
            </div>

            <div className="mt-14 grid gap-px rounded-2xl border border-line bg-line overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
              <div className="bg-white p-7 sm:p-8 flex flex-col justify-between transition-colors hover:bg-slate-50/70">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-brand-950">Print Automation Software</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                    Eliminate manual printer dialogs and repetitive file openings. The Windows desktop agent talks natively to the print spooler to feed pages in under 500ms.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <Link href="/features" className="text-xs font-semibold text-brand-700 hover:text-brand-900 inline-flex items-center">
                    Explore print automation
                  </Link>
                </div>
              </div>

              <div className="bg-white p-7 sm:p-8 flex flex-col justify-between transition-colors hover:bg-slate-50/70">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-brand-950">Photocopy &amp; Xerox Software</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                    Stop chasing files over WhatsApp. Customers scan your counter QR, pick A4/A3, B&amp;W or color, and duplexing with live per-page pricing.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <Link href="/digital-printing-service" className="text-xs font-semibold text-brand-700 hover:text-brand-900 inline-flex items-center">
                    Digital printing service
                  </Link>
                </div>
              </div>

              <div className="bg-white p-7 sm:p-8 flex flex-col justify-between transition-colors hover:bg-slate-50/70">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-brand-950">Universal Printer Compatibility</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                    Works with HP LaserJet, Canon imageCLASS, Epson EcoTank, Brother, Ricoh, and Konica Minolta printers over USB, Wi-Fi, Ethernet, or WSD.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <Link href="/download" className="text-xs font-semibold text-brand-700 hover:text-brand-900 inline-flex items-center">
                    Download Windows Agent
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ━━━ WINDOWS AGENT ━━━ */}
        <section className="bg-brand-950 py-20 lg:py-28 relative text-white border-t border-brand-900">
          <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
            <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-12 items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Hardware Native Architecture</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                  The Windows Desktop Agent
                </h2>
                <p className="mt-4 text-base leading-relaxed text-slate-300 sm:text-lg">
                  Web browsers cannot control paper trays or communicate with hardware drivers. Printiva runs a lightweight background agent in your Windows system tray that speaks directly to the Windows Print Spooler.
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Button asChild variant="primary">
                    <Link href="/download">
                      <Download className="size-4" />
                      Download v1.8.34 (.exe)
                    </Link>
                  </Button>
                  <Link
                    href="/shop/printer"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/15"
                  >
                    Setup Guide
                  </Link>
                </div>
              </div>

              {/* Technical Spec Card */}
              <div className="rounded-2xl border border-white/15 bg-black/30 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 text-xs">
                  <span className="font-semibold text-white">System Specification</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400 font-mono">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    Verified Production
                  </span>
                </div>
                {[
                  ["Operating System", "Windows 10 / 11 (64-bit)"],
                  ["Memory Footprint", "< 48 MB RAM"],
                  ["Supported Protocols", "USB, Wi-Fi, Ethernet, WSD"],
                  ["Spool Latency", "< 500ms Dispatch"],
                  ["Spooler Driver", "Direct Win32 Print Spooler API"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between py-1.5 text-xs font-mono border-b border-white/5 last:border-b-0">
                    <span className="text-slate-400">{label}</span>
                    <span className={`font-medium ${label === "Spool Latency" ? "text-emerald-400 font-bold" : "text-white"}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ━━━ FAQ ━━━ */}
        <section className="mx-auto max-w-4xl px-6 py-20 lg:py-28 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Common questions</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">
              Everything you need to know.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              Shop onboarding, hardware drivers, UPI payments, and our ₹100 for 7 days trial.
            </p>
          </div>
          <div className="mt-12">
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
