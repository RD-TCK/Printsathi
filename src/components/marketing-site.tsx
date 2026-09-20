import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileStack,
  Printer,
  QrCode,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

/* ─── Section heading (kept for backwards compat, but page.tsx now inlines) ─── */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"
      }
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-7 text-muted sm:text-lg">
        {description}
      </p>
    </div>
  );
}

/* ─── Footer ─── */
export function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 bg-brand-950 text-white relative overflow-hidden">
      <div className="absolute top-0 right-1/4 -z-10 size-96 rounded-full bg-emerald-600/8 blur-3xl pointer-events-none" />

      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Link
            href="/"
            className="group inline-flex items-center gap-3"
          >
            <div className="relative flex items-center justify-center transition-transform group-hover:scale-105">
              <Logo size={38} className="shrink-0" />
            </div>
            <span className="text-2xl font-semibold tracking-tight text-white">
              Print
              <span className="text-emerald-400">iva</span>
            </span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/50">
            Connecting customers with local print shops through QR ordering,
            automated payments, and native Windows printing.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-950/80 px-3 py-1 text-xs font-medium text-emerald-400/80">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Agent v1.4.0 Live
            </span>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
            Product
          </h2>
          <div className="mt-4 space-y-3 text-sm text-white/50">
            <Link
              className="block transition-colors hover:text-white"
              href="/features"
            >
              Features & Specs
            </Link>
            <Link
              className="block transition-colors hover:text-white"
              href="/how-it-works"
            >
              How It Works
            </Link>
            <Link
              className="block transition-colors hover:text-white"
              href="/pricing"
            >
              Pricing
            </Link>
            <Link
              className="block transition-colors hover:text-white"
              href="/download"
            >
              Windows Desktop Agent
            </Link>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
            For Shops
          </h2>
          <div className="mt-4 space-y-3 text-sm text-white/50">
            <Link
              className="block transition-colors hover:text-white"
              href="/register"
            >
              Start Free Trial
            </Link>
            <Link
              className="block transition-colors hover:text-white"
              href="/login"
            >
              Shop Owner Login
            </Link>
            <Link
              className="block transition-colors hover:text-white"
              href="/shop/printer"
            >
              Printer Pairing
            </Link>
            <Link
              className="block transition-colors hover:text-white"
              href="/download"
            >
              Installation Guide
            </Link>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
            Customers
          </h2>
          <div className="mt-4 space-y-3 text-sm text-white/50">
            <Link
              className="block transition-colors hover:text-white"
              href="/shops"
            >
              Find a Print Shop
            </Link>
            <Link
              className="block transition-colors hover:text-white"
              href="/track"
            >
              Track Order
            </Link>
            <Link
              className="block transition-colors hover:text-white"
              href="/customer"
            >
              Order History
            </Link>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-xs text-white/30 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span>© 2026 Printiva Inc. All rights reserved.</span>
          <span className="text-white/20">Scan · Upload · Pay · Print</span>
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
    icon: QrCode,
    title: "Instant QR Entry",
    body: "Customers scan your counter sticker and land directly on your upload page. No app downloads.",
    tag: "Mobile-First",
  },
  {
    icon: FileStack,
    title: "Multi-Document Staging",
    body: "Upload PDFs, handouts, and multi-file jobs under one order. Each document has independent specs.",
    tag: "Batch Support",
  },
  {
    icon: Workflow,
    title: "Smart Page Controls",
    body: "Color switching, grayscale, page ranges, and paper weights — all configured before payment.",
    tag: "Precision",
  },
  {
    icon: ShieldCheck,
    title: "Verified Payments",
    body: "Integrated Razorpay. Zero manual UPI verification. Jobs unlock only after payment clears.",
    tag: "Automated",
  },
  {
    icon: Printer,
    title: "Native Print Spooler",
    body: "The Windows Agent speaks directly to thermal, laser, and color printers. No browser dialogs.",
    tag: "Zero Delay",
  },
  {
    icon: Zap,
    title: "Auto-Routing",
    body: "Color pages route to color printers; monochrome jobs to high-speed lasers — automatically.",
    tag: "Intelligent",
  },
];

/* ─── Feature grid ─── */
export function FeatureGrid({ limit }: { limit?: number }) {
  const items = limit ? featureItems.slice(0, limit) : featureItems;
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {items.map(({ icon: Icon, title, body, tag }) => (
        <div
          key={title}
          className="group relative rounded-2xl border border-line bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:border-brand-300/60 hover:shadow-xl hover:shadow-emerald-950/[0.04]"
        >
          {/* Hover accent line */}
          <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-brand-500 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

          <div className="flex items-center justify-between">
            <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-all duration-300 group-hover:bg-brand-600 group-hover:text-white group-hover:shadow-md group-hover:shadow-brand-600/25">
              <Icon className="size-5" />
            </div>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700 border border-brand-100">
              {tag}
            </span>
          </div>

          <h3 className="mt-5 text-lg font-semibold tracking-tight text-brand-950">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Trial callout ─── */
export function TrialCallout() {
  return (
    <section className="relative overflow-hidden py-16 px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-3xl bg-brand-950 p-8 sm:p-12 lg:p-16 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 size-96 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 size-96 rounded-full bg-emerald-400/8 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(#22c55e_0.5px,transparent_0.5px)] [background-size:24px_24px] opacity-[0.04]" />

        <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              For print shop owners
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl text-white">
              End counter chaos in{" "}
              <span className="font-display italic text-emerald-400">
                under 5 minutes.
              </span>
            </h2>
            <p className="mt-4 text-base leading-7 text-white/60 sm:text-lg">
              Start with a full 7-day free trial. Install the agent, print your
              QR sticker, and watch customer queues flow hands-free.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 shrink-0">
            <Button asChild size="lg" variant="secondary" className="shadow-lg">
              <Link href="/register" className="group">
                Start free trial
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Link
              href="/download"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white"
            >
              Download Agent
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ─── */
export function FaqList() {
  const items = [
    [
      "What is Printiva?",
      "Printiva is a modern printing OS for local shops. It combines mobile QR ordering, automated payments, and a silent Windows agent that routes jobs to your physical printers.",
    ],
    [
      "How does automatic printing work?",
      "Customers scan your counter QR, upload documents, and pay online. Once payment confirms, the Desktop Agent picks up the job and commands the Windows Print Spooler instantly.",
    ],
    [
      "Do I need a separate machine?",
      "No. The agent runs silently on any Windows 10/11 PC connected to your printers. It uses less than 48MB RAM and stays in your system tray.",
    ],
    [
      "How are payments handled?",
      "Payments go through Razorpay directly to your account. Each transaction is validated cryptographically before any print payload is sent.",
    ],
    [
      "What file formats work?",
      "PDF is fully supported with native rendering and page extraction. Word documents, images, and presentations are converted into print-ready streams.",
    ],
    [
      "What does it cost after the trial?",
      "7 days free. Then ₹699/month or ₹7,499/year with full support, unlimited orders, and automatic agent updates.",
    ],
  ];

  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-white">
      {items.map(([question, answer]) => (
        <details
          key={question}
          className="group p-6 transition-colors hover:bg-brand-50/30"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-brand-950 sm:text-lg">
            <span>{question}</span>
            <ChevronDown className="size-5 shrink-0 text-brand-400 transition-transform duration-300 group-open:rotate-180" />
          </summary>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted sm:text-base">
            {answer}
          </p>
        </details>
      ))}
    </div>
  );
}

/* ─── 4-Step workflow ─── */
export function Steps() {
  const steps = [
    {
      num: "01",
      title: "Scan Counter QR",
      desc: "Customer scans your shop sticker with any smartphone camera. No app needed.",
      icon: QrCode,
    },
    {
      num: "02",
      title: "Upload & Preview",
      desc: "Upload PDFs or images. Auto page-count and color options display instantly.",
      icon: FileStack,
    },
    {
      num: "03",
      title: "Confirm & Pay",
      desc: "Automated pricing based on your rates. Instant UPI or card via Razorpay.",
      icon: ShieldCheck,
    },
    {
      num: "04",
      title: "Agent Auto-Prints",
      desc: "Agent fetches the job in 2 seconds and triggers your local printer spooler.",
      icon: Printer,
    },
  ];

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map(({ num, title, desc, icon: Icon }, idx) => (
        <div
          key={num}
          className="group relative rounded-2xl border border-line bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-brand-300/50"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-3xl font-semibold text-brand-200 group-hover:text-brand-400 transition-colors">
              {num}
            </span>
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-all">
              <Icon className="size-5" />
            </div>
          </div>
          <h3 className="mt-5 text-lg font-semibold text-brand-950">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">{desc}</p>
          {idx < steps.length - 1 ? (
            <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 z-10">
              <ArrowRight className="size-5 text-brand-200" />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-6 text-muted">
          <Check className="mt-0.5 size-4 shrink-0 text-brand-600" />
          {item}
        </li>
      ))}
    </ul>
  );
}
