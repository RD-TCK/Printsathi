import Link from "next/link";
import { ArrowRight, CheckCircle2, Cpu, Download, HardDrive, KeyRound, Printer, ShieldCheck, Usb, Zap } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter } from "@/components/marketing-site";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { Button } from "@/components/ui/button";

export const metadata = pageMetadata({
  title: "Download Print Automation Software for Windows — Printiva Desktop Agent",
  description:
    "Download Printiva print automation software for Windows 10 and 11 (64-bit). Connect your USB, Wi-Fi, or network printer to automatically print paid customer documents in seconds.",
  path: "/download",
  keywords: [
    "download print automation software",
    "printing software for Windows 10",
    "photocopy software download",
    "automatic print agent Windows",
    "xerox shop software PC download",
  ],
});

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-white text-ink">
      <JsonLd
        data={breadcrumbJsonLd([
          ["Home", "/"],
          ["Download", "/download"],
        ])}
      />
      <SiteHeader />

      <main>
        {/* Header Hero */}
        <section className="border-b border-line bg-slate-50/60 py-16 lg:py-20">
          <div className="mx-auto max-w-4xl px-6 text-center lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 mb-4">
              <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
              Official Production Release v1.8.35
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-brand-950 sm:text-5xl">
              Printiva Desktop Agent for Windows
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              The high-speed Windows service that pairs your physical laser or inkjet printer directly with customer QR uploads and instant UPI payments.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild size="lg" variant="primary">
                <a href="/api/agent/download" className="gap-2.5">
                  <Download className="size-5" />
                  Download Windows Agent (v1.8.35 .exe)
                </a>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/shop/printer">
                  Printer Setup Guide <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            <p className="mt-4 text-xs font-mono text-slate-500">
              64-bit Windows 10 &amp; 11 &bull; Lightweight &lt;48MB RAM &bull; Standalone executable
            </p>
          </div>
        </section>

        {/* System Specs & Architecture */}
        <section className="py-16 px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-8 lg:grid-cols-3">
              <div className="rounded-2xl border border-line bg-white p-6 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 mb-4">
                  <Cpu className="size-5" />
                </div>
                <h2 className="text-base font-bold text-brand-950">System Requirements</h2>
                <ul className="mt-3 space-y-2 text-xs font-mono text-slate-600">
                  <li className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">OS</span>
                    <span className="font-semibold text-slate-800">Windows 10 / 11 (64-bit)</span>
                  </li>
                  <li className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">RAM</span>
                    <span className="font-semibold text-slate-800">&lt; 48 MB footprint</span>
                  </li>
                  <li className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Disk Space</span>
                    <span className="font-semibold text-slate-800">~120 MB Storage</span>
                  </li>
                  <li className="flex justify-between py-1">
                    <span className="text-slate-400">Internet</span>
                    <span className="font-semibold text-slate-800">Standard Broadband / 4G</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-line bg-white p-6 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 mb-4">
                  <Usb className="size-5" />
                </div>
                <h2 className="text-base font-bold text-brand-950">Supported Printers</h2>
                <ul className="mt-3 space-y-2 text-xs font-mono text-slate-600">
                  <li className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Brands</span>
                    <span className="font-semibold text-slate-800">HP, Canon, Epson, Brother</span>
                  </li>
                  <li className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Copiers</span>
                    <span className="font-semibold text-slate-800">Ricoh, Konica Minolta</span>
                  </li>
                  <li className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Interfaces</span>
                    <span className="font-semibold text-slate-800">USB, Wi-Fi, Ethernet, WSD</span>
                  </li>
                  <li className="flex justify-between py-1">
                    <span className="text-slate-400">Paper Sizes</span>
                    <span className="font-semibold text-slate-800">A4, A3, Legal, Letter</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-line bg-white p-6 shadow-2xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 mb-4">
                  <ShieldCheck className="size-5" />
                </div>
                <h2 className="text-base font-bold text-brand-950">Security &amp; Privacy</h2>
                <ul className="mt-3 space-y-2 text-xs font-mono text-slate-600">
                  <li className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Spooler</span>
                    <span className="font-semibold text-slate-800">Win32 Native API</span>
                  </li>
                  <li className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">File Transport</span>
                    <span className="font-semibold text-slate-800">TLS 1.3 Encrypted</span>
                  </li>
                  <li className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Auto-Cleanup</span>
                    <span className="font-semibold text-slate-800">Instant After Spool</span>
                  </li>
                  <li className="flex justify-between py-1">
                    <span className="text-slate-400">Privilege</span>
                    <span className="font-semibold text-slate-800">Standard User (No Admin)</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Setup Walkthrough */}
            <div className="mt-16">
              <h2 className="text-xl font-bold tracking-tight text-brand-950 sm:text-2xl text-center mb-10">
                Three Simple Steps to Automatic Printing
              </h2>
              <div className="grid gap-6 sm:grid-cols-3">
                <div className="rounded-2xl border border-line bg-slate-50/50 p-6">
                  <span className="font-mono text-xs font-bold text-brand-700 uppercase tracking-widest">Step 01</span>
                  <div className="mt-3 flex items-center gap-2">
                    <Printer className="size-5 text-brand-700" />
                    <h3 className="text-base font-bold text-brand-950">Connect Printer</h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Ensure your printer driver is installed in Windows. Print a standard Windows test page to confirm paper feeds normally.
                  </p>
                </div>

                <div className="rounded-2xl border border-line bg-slate-50/50 p-6">
                  <span className="font-mono text-xs font-bold text-brand-700 uppercase tracking-widest">Step 02</span>
                  <div className="mt-3 flex items-center gap-2">
                    <KeyRound className="size-5 text-brand-700" />
                    <h3 className="text-base font-bold text-brand-950">Pair Agent</h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Launch PrintivaAgent.exe. In your shop portal under Printer Settings, copy your one-time 6-digit pairing code and hit connect.
                  </p>
                </div>

                <div className="rounded-2xl border border-line bg-slate-50/50 p-6">
                  <span className="font-mono text-xs font-bold text-brand-700 uppercase tracking-widest">Step 03</span>
                  <div className="mt-3 flex items-center gap-2">
                    <Zap className="size-5 text-brand-700" />
                    <h3 className="text-base font-bold text-brand-950">Automate Queue</h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Stick your counter QR code on your desk. Customer files pay via UPI and roll out of your printer tray within 2 seconds.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
