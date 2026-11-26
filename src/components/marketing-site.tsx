import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
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
  eyebrow: string;
  title: string;
  description: string;
  align?: "left" | "center";
  as?: "h1" | "h2";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</p>
      <Heading className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">{title}</Heading>
      <p className="mt-4 text-base leading-7 text-muted sm:text-lg">{description}</p>
    </div>
  );
}

/* ─── Footer ─── */
export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-[#fafaf8] text-ink relative">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.1fr] lg:px-8">
        <div>
          <Link href="/" className="group inline-flex items-center gap-2.5">
            <div className="relative flex items-center justify-center transition-transform group-hover:scale-105">
              <Logo size={34} className="shrink-0" />
            </div>
            <span className="text-xl font-bold tracking-tight text-brand-950">
              Print<span className="text-brand-600">iva</span>
            </span>
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">
            Automating customer document intake, per-page pricing, UPI payments, and physical Windows printing for local print shops.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link
              href="/download"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200/90 bg-white px-3.5 py-1.5 text-xs font-medium text-emerald-800 shadow-2xs transition hover:border-emerald-300 hover:bg-emerald-50/60"
            >
              <span className="size-1.5 rounded-full bg-emerald-600" />
              Windows Agent v1.8.36 &rarr;
            </Link>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Product</h2>
          <div className="mt-4 space-y-2.5 text-sm text-slate-600">
            <Link className="block transition-colors hover:text-brand-950" href="/printing-software">
              Printing Software
            </Link>
            <Link className="block transition-colors hover:text-brand-950" href="/xerox-shop-software">
              Xerox Shop Software
            </Link>
            <Link className="block transition-colors hover:text-brand-950" href="/features">
              Features &amp; Specs
            </Link>
            <Link className="block transition-colors hover:text-brand-950" href="/pricing">
              Pricing
            </Link>
            <Link className="block transition-colors hover:text-brand-950" href="/blog">
              Blog &amp; Guides
            </Link>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">For Shops</h2>
          <div className="mt-4 space-y-2.5 text-sm text-slate-600">
            <Link className="block transition-colors hover:text-brand-950" href="/register">
              ₹100 for 7 Days Trial
            </Link>
            <Link className="block transition-colors hover:text-brand-950" href="/login">
              Shop Owner Login
            </Link>
            <Link className="block transition-colors hover:text-brand-950" href="/shop/printer">
              Printer Pairing
            </Link>
            <Link className="block transition-colors hover:text-brand-950" href="/download">
              Windows Desktop Agent
            </Link>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Customers</h2>
          <div className="mt-4 space-y-2.5 text-sm text-slate-600">
            <Link className="block transition-colors hover:text-brand-950" href="/digital-printing-service">
              Digital Printing Service
            </Link>
            <Link className="block transition-colors hover:text-brand-950" href="/shops">
              Find a Print Shop
            </Link>
            <Link className="block transition-colors hover:text-brand-950" href="/track">
              Track Print Order
            </Link>
            <Link className="block transition-colors hover:text-brand-950" href="/contact">
              Support &amp; Feedback
            </Link>
          </div>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">System</h2>
          <div className="mt-4 space-y-2 text-xs font-mono text-slate-600">
            <p>Platform: Windows 10/11 x64</p>
            <p>Spool Latency: &lt; 500ms</p>
            <p>Agent Size: &lt; 48 MB RAM</p>
            <p>Verified: Razorpay &amp; UPI</p>
          </div>
        </div>
      </div>

      <div className="border-t border-line bg-white/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span>&copy; 2026 Printiva Inc. All rights reserved.</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-slate-500">
            <Link className="transition-colors hover:text-brand-950" href="/privacy">
              Privacy
            </Link>
            <span>&middot;</span>
            <Link className="transition-colors hover:text-brand-950" href="/terms">
              Terms
            </Link>
            <span>&middot;</span>
            <Link className="transition-colors hover:text-brand-950" href="/refund">
              Refunds
            </Link>
            <span>&middot;</span>
            <Link className="transition-colors hover:text-brand-950" href="/shipping">
              Delivery
            </Link>
            <span>&middot;</span>
            <Link className="transition-colors hover:text-brand-950" href="/contact">
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
    title: "Instant QR Entry",
    body: "Customers scan your counter sticker and open your upload page in any mobile browser. No app to install.",
    tag: "Counter Intake",
  },
  {
    title: "Multi-Document Batching",
    body: "Upload multiple PDFs, images, and notes in one order with separate color, page range, and copy settings.",
    tag: "Batch Queue",
  },
  {
    title: "Per-Page Print Controls",
    body: "Page counts, color vs B&W split, duplexing, and paper sizes calculate automatically before checkout.",
    tag: "Pricing Engine",
  },
  {
    title: "Verified UPI & Cash",
    body: "Razorpay verifies online UPI payments before spooling, with instant counter cash approval built in.",
    tag: "Payments",
  },
  {
    title: "Native Windows Spooler",
    body: "A lightweight desktop agent talks straight to Windows printer drivers—no browser Ctrl+P dialogs.",
    tag: "Desktop Agent",
  },
  {
    title: "Dual-Printer Routing",
    body: "Color pages route automatically to color printers while B&W sheets route to fast laser machines.",
    tag: "Smart Routing",
  },
];

/* ─── Feature grid ─── */
export function FeatureGrid({ limit }: { limit?: number }) {
  const items = limit ? featureItems.slice(0, limit) : featureItems;
  return (
    <div className="grid gap-px rounded-2xl border border-line bg-line overflow-hidden md:grid-cols-2 lg:grid-cols-3">
      {items.map(({ title, body, tag }) => (
        <div
          key={title}
          className="group bg-white p-7 sm:p-8 transition-colors duration-200 hover:bg-slate-50/70"
        >
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-brand-700">
            {tag}
          </p>
          <h3 className="mt-3 text-lg font-semibold tracking-tight text-brand-950">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Trial callout ─── */
export function TrialCallout() {
  return (
    <section className="py-16 px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-3xl bg-brand-950 p-8 sm:p-12 lg:p-14 text-white shadow-lg border border-brand-900 relative">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-400">For print shop owners</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl text-white">
              End counter chaos in under 5 minutes.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-300 sm:text-lg">
              Start with our ₹100 for 7 days trial. Install the agent, print your QR counter sticker, and automate your queue today.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3.5 shrink-0">
            <Button asChild size="lg" variant="primary">
              <Link href="/register">
                Start ₹100 for 7 Days Trial
              </Link>
            </Button>
            <Link
              href="/download"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-white/15"
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
    <div className="divide-y divide-line rounded-2xl border border-line bg-white">
      {items.map(([question, answer]) => (
        <details key={question} className="group p-6 transition-colors hover:bg-slate-50/50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-brand-950 sm:text-lg">
            <span>{question}</span>
            <ChevronDown className="size-5 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">{answer}</p>
        </details>
      ))}
    </div>
  );
}

export const faqItems: FaqItem[] = [
  [
    "What is Printiva print automation software?",
    "Printiva is India's leading print automation software and photocopy management system for xerox shops, cyber cafes, and commercial printers. It automates customer document upload via mobile QR code, auto-prices pages, verifies online UPI or counter payments, and prints directly on your physical Windows printer without manual clicks.",
  ],
  [
    "Can I use Printiva as photocopy software in my xerox shop?",
    "Yes. Printiva is purpose-built as photocopy software for xerox centers. Customers scan your counter QR code, configure color (B&W or Color), paper size (A4/A3), copies, and single or double-sided printing, eliminating manual page-counting and WhatsApp file chaos completely.",
  ],
  [
    "Which printers are compatible with Printiva printing software?",
    "Printiva works seamlessly with any standard monochrome or color laser/inkjet printer from HP, Canon, Epson, Brother, Ricoh, or Konica Minolta connected to a 64-bit Windows 10 or 11 PC via USB, Wi-Fi, Ethernet, or WSD network protocols.",
  ],
  [
    "How does automatic printing work?",
    "Customers scan your counter QR, upload documents, and pay online or at the counter. Once confirmed, the Windows Desktop Agent picks up the job and commands the Windows Print Spooler to feed paper in ~300ms–500ms.",
  ],
  [
    "How does Printiva solve the WhatsApp printing problem?",
    "Traditional print shops waste 60% of their time downloading files from WhatsApp, clogging phone memory, checking fake payment screenshots, and opening print dialogs manually. Printiva replaces WhatsApp with a clean browser QR workflow with zero app installation needed.",
  ],
  [
    "Do I need a separate machine?",
    "No. The agent runs silently on any Windows 10/11 PC connected to your printers. It uses less than 48MB RAM and stays in your system tray.",
  ],
  [
    "How are payments handled?",
    "Payments go through Razorpay directly to your account. Each transaction is validated cryptographically before any print payload is sent. Offline counter cash payments with token queue management are also fully supported.",
  ],
  [
    "What file formats work?",
    "PDF is fully supported with native rendering and page extraction. Word documents (DOCX), images (JPEG, PNG, WEBP), and presentations are converted into print-ready streams.",
  ],
  [
    "What does it cost after the trial?",
    "₹100 for 7 days trial. Then ₹699/month or ₹7,499/year with full support, unlimited orders, and automatic agent updates.",
  ],
];

/* ─── 4-Step workflow ─── */
export function Steps() {
  const steps = workflowSteps;

  return (
    <div className="grid gap-px rounded-2xl border border-line bg-line overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
      {steps.map(({ num, title, desc }) => (
        <div
          key={num}
          className="group bg-white p-7 sm:p-8 flex flex-col justify-between transition-colors duration-200 hover:bg-slate-50/70"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold tracking-[0.16em] text-brand-700">
                STEP {num}
              </span>
              <span className="h-0.5 w-5 rounded-full bg-brand-600/30 transition-all duration-200 group-hover:w-9 group-hover:bg-brand-600" />
            </div>
            <h3 className="mt-5 text-base font-semibold tracking-tight text-brand-950">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{desc}</p>
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
          <Check className="mt-0.5 size-4 shrink-0 text-brand-700" />
          {item}
        </li>
      ))}
    </ul>
  );
}
