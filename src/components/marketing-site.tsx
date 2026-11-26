import Link from "next/link";
import {
  Check,
  ChevronDown,
  GitBranch,
  Layers,
  Printer,
  QrCode,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

/* ─── Section heading ─── */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  as: Heading = "h2",
}: {
  eyebrow?: string;
  title: string;
  description: string;
  align?: "left" | "center";
  as?: "h1" | "h2";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      {eyebrow ? (
        <p className="text-xs font-semibold text-brand-700 dark:text-emerald-400">{eyebrow}</p>
      ) : null}
      <Heading className="mt-2 text-3xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-4xl">{title}</Heading>
      <p className="mt-4 text-base leading-7 text-muted sm:text-lg">{description}</p>
    </div>
  );
}

/* ─── Footer (Clean & Focused) ─── */
export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-[#fafaf8] text-ink relative dark:border-white/[0.09] dark:bg-[#111622] dark:text-slate-200">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 sm:py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr] lg:px-8">
        <div>
          <Link href="/" className="group inline-flex items-center gap-2.5">
            <div className="relative flex items-center justify-center transition-transform group-hover:scale-105">
              <Logo size={32} className="shrink-0" />
            </div>
            <span className="text-xl font-bold tracking-tight text-brand-950 dark:text-white">
              Print<span className="text-brand-600 dark:text-emerald-400">iva</span>
            </span>
          </Link>
          <p className="mt-3.5 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-400">
            QR upload, per-page UPI checkout, and Windows print automation for local print shops.
          </p>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700 dark:text-emerald-400">Product</h2>
          <div className="mt-4 space-y-2.5 text-sm text-slate-600 dark:text-slate-400">
            <Link className="block transition-colors hover:text-brand-950 dark:hover:text-white" href="/features">
              Features
            </Link>
            <Link className="block transition-colors hover:text-brand-950 dark:hover:text-white" href="/how-it-works">
              How It Works
            </Link>
            <Link className="block transition-colors hover:text-brand-950 dark:hover:text-white" href="/pricing">
              Pricing
            </Link>
            <Link className="block transition-colors hover:text-brand-950 dark:hover:text-white" href="/download">
              Windows Agent
            </Link>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700 dark:text-emerald-400">Get Started</h2>
          <div className="mt-4 space-y-2.5 text-sm text-slate-600 dark:text-slate-400">
            <Link className="block transition-colors hover:text-brand-950 dark:hover:text-white" href="/register">
              7-Day Trial (₹100)
            </Link>
            <Link className="block transition-colors hover:text-brand-950 dark:hover:text-white" href="/login">
              Shop Login
            </Link>
            <Link className="block transition-colors hover:text-brand-950 dark:hover:text-white" href="/shops">
              Find a Print Shop
            </Link>
            <Link className="block transition-colors hover:text-brand-950 dark:hover:text-white" href="/track">
              Track Print Order
            </Link>
          </div>
        </div>
      </div>

      <div className="border-t border-line bg-white/70 dark:border-white/[0.08] dark:bg-[#07090d]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-5 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span>&copy; 2026 Printiva Inc.</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link className="transition-colors hover:text-brand-950 dark:hover:text-white" href="/privacy">
              Privacy
            </Link>
            <Link className="transition-colors hover:text-brand-950 dark:hover:text-white" href="/terms">
              Terms
            </Link>
            <Link className="transition-colors hover:text-brand-950 dark:hover:text-white" href="/refund">
              Refunds
            </Link>
            <Link className="transition-colors hover:text-brand-950 dark:hover:text-white" href="/shipping">
              Delivery
            </Link>
            <Link className="transition-colors hover:text-brand-950 dark:hover:text-white" href="/contact">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}

/* ─── Feature data ─── */
export const featureItems = [
  {
    label: "Counter QR",
    title: "Instant QR Entry",
    body: "Customers scan your counter sticker and upload files from a phone browser—no app download needed.",
    icon: QrCode,
  },
  {
    label: "Multi-file",
    title: "Batch Ordering",
    body: "Upload PDFs, images, and notes together with separate page ranges, copy counts, and color choices.",
    icon: Layers,
  },
  {
    label: "Auto Pricing",
    title: "Live Per-Page Totals",
    body: "Counts total and color pages automatically and calculates B&W, color, and duplex totals before payment.",
    icon: SlidersHorizontal,
  },
  {
    label: "Payments",
    title: "Verified UPI & Cash",
    body: "Razorpay confirms online UPI before printing starts; walk-in cash orders queue for one-click approval.",
    icon: ShieldCheck,
  },
  {
    label: "Spooler",
    title: "Direct Windows Printing",
    body: "Desktop agent sends jobs straight to Windows printer drivers so you never click through print dialogs.",
    icon: Printer,
  },
  {
    label: "Routing",
    title: "B&W and Color Split",
    body: "Routes color pages to color ink printers and B&W sheets to monochrome laser printers automatically.",
    icon: GitBranch,
  },
];

/* ─── Feature list (ruled editorial rows, no boxed card grid) ─── */
export function FeatureGrid({ limit }: { limit?: number }) {
  const items = limit ? featureItems.slice(0, limit) : featureItems;
  return (
    <div className="divide-y divide-line border-y border-line dark:divide-white/[0.08] dark:border-white/[0.08]">
      {items.map(({ label, title, body, icon: Icon }) => (
        <div
          key={title}
          className="group grid gap-2.5 py-5 sm:py-6 sm:grid-cols-[175px_1fr] sm:gap-8 sm:items-baseline transition-colors duration-150 hover:bg-emerald-50/40 dark:hover:bg-white/[0.03] px-3 -mx-3 rounded-lg"
        >
          <div className="flex items-center gap-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <Icon className="size-4 shrink-0" />
            <span>{label}</span>
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-brand-950 dark:text-white">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Trial callout ─── */
export function TrialCallout() {
  return (
    <section className="py-12 sm:py-16 px-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-2xl bg-brand-950 p-6 sm:p-12 lg:p-14 text-white border border-emerald-900/60 dark:bg-[#182030] dark:bg-gradient-to-br dark:from-[#1f293d] dark:via-[#182030] dark:to-[#132220] dark:border-white/[0.12] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_22px_54px_-16px_rgba(0,0,0,0.58)] relative">
        <div className="flex flex-col gap-6 sm:gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-4xl text-white">
              Try Printiva on your counter printer.
            </h2>
            <p className="mt-2.5 sm:mt-3 text-sm sm:text-lg leading-relaxed text-slate-300 dark:text-slate-400">
              Start a ₹100 7-day trial. Install the agent, print your QR sticker, and test live counter orders today.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full lg:w-auto">
            <Button asChild size="lg" variant="primary" className="w-full sm:w-auto">
              <Link href="/register">
                Start ₹100 for 7 Days Trial
              </Link>
            </Button>
            <Link
              href="/download"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-white/15 dark:border-white/[0.12] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
            >
              Download Windows Agent
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ─── */
export type FaqItem = readonly [question: string, answer: string];

export function FaqList({ items = faqItems }: { items?: ReadonlyArray<FaqItem> }) {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-white dark:divide-white/[0.08] dark:border-white/[0.11] dark:bg-[#192030] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_20px_44px_-16px_rgba(0,0,0,0.55)] overflow-hidden">
      {items.map(([question, answer]) => (
        <details key={question} className="group p-4 sm:p-6 transition-colors hover:bg-slate-50/50 dark:hover:bg-[#1f283b]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] sm:text-base font-semibold text-brand-950 dark:text-white">
            <span>{question}</span>
            <ChevronDown className="size-4 sm:size-5 shrink-0 text-slate-400 dark:text-slate-500 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <p className="mt-2.5 sm:mt-3 max-w-3xl text-sm leading-relaxed text-muted sm:text-[15px]">{answer}</p>
        </details>
      ))}
    </div>
  );
}

export const faqItems: FaqItem[] = [
  [
    "Which printers work with Printiva?",
    "Any standard monochrome or color laser/inkjet printer (HP, Canon, Epson, Brother, Ricoh, Konica Minolta) connected to a 64-bit Windows 10 or 11 PC via USB, Wi-Fi, or LAN.",
  ],
  [
    "How does automatic printing work?",
    "Customers scan your counter QR, upload files, and pay online or at the counter. Once verified, the Windows Desktop Agent dispatches jobs straight to the Windows Print Spooler in under 500ms—no Ctrl+P needed.",
  ],
  [
    "Do I need a separate PC?",
    "No. The lightweight agent (<48 MB RAM) runs quietly in your system tray alongside your existing Windows software.",
  ],
  [
    "How are UPI & cash payments handled?",
    "Online UPI payments are verified cryptographically through Razorpay before spooling begins. Cash counter token queues are also built in.",
  ],
  [
    "What does it cost after the trial?",
    "Start with ₹100 for a full 7-day trial, then continue for ₹699/month or ₹7,499/year with unlimited orders and automatic updates.",
  ],
];

/* ─── 4-Step workflow ─── */
export function Steps() {
  const steps = workflowSteps;

  return (
    <div className="grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map(({ num, title, desc }) => (
        <div
          key={num}
          className="rounded-xl border border-line bg-white p-6 sm:p-7 flex flex-col justify-between transition-colors duration-200 hover:border-emerald-500/45 dark:border-white/[0.08] dark:bg-[#11141b] dark:hover:border-emerald-400/40"
        >
          <div>
            <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Step {num}
            </span>
            <h3 className="mt-3 text-base font-semibold tracking-tight text-brand-950 dark:text-white">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export const workflowSteps = [
  {
    num: "01",
    title: "Scan Counter QR",
    desc: "Customer scans your desk QR sticker with any phone camera. No app to download.",
  },
  {
    num: "02",
    title: "Upload & Preview",
    desc: "They upload PDFs or images, inspect page counts, and pick B&W or color options.",
  },
  {
    num: "03",
    title: "Pay Upfront",
    desc: "Per-page total calculates live. Paid via verified Razorpay UPI or counter cash.",
  },
  {
    num: "04",
    title: "Print Automatically",
    desc: "Windows Desktop Agent spools paid files straight to your printer in under 2 seconds.",
  },
];

export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-6 text-muted">
          <Check className="mt-0.5 size-4 shrink-0 text-brand-700 dark:text-emerald-400" />
          {item}
        </li>
      ))}
    </ul>
  );
}
