import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  FileStack,
  QrCode,
  ShieldCheck,
  Smartphone,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-brand-950 sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-muted">{description}</p>
    </div>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-brand-950 text-white">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-14 lg:grid-cols-[1.2fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Link href="/" className="text-2xl font-bold tracking-tight">
            Print<span className="text-brand-100">Sathi</span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-6 text-white/65">
            A clearer way for local shops and their customers to print together.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Product</h2>
          <div className="mt-4 space-y-3 text-sm text-white/65">
            <Link className="block hover:text-white" href="/features">
              Features
            </Link>
            <Link className="block hover:text-white" href="/how-it-works">
              How it works
            </Link>
            <Link className="block hover:text-white" href="/pricing">
              Pricing
            </Link>
            <Link className="block hover:text-white" href="/download">
              Desktop bridge
            </Link>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold">For shops</h2>
          <div className="mt-4 space-y-3 text-sm text-white/65">
            <Link className="block hover:text-white" href="/register">
              Start a free trial
            </Link>
            <Link className="block hover:text-white" href="/login">
              Shop owner login
            </Link>
            <Link className="block hover:text-white" href="/download">
              Agent download
            </Link>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Customers</h2>
          <div className="mt-4 space-y-3 text-sm text-white/65">
            <Link className="block hover:text-white" href="/shops">Find a shop</Link>
            <Link className="block hover:text-white" href="/track">Track an order</Link>
            <Link className="block hover:text-white" href="/customer">My orders</Link>
            <p>For help with printed pages, contact the shop shown on your order.</p>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-5 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span>© 2026 PrintSathi. Built for better print days.</span>
          <span>Scan. Upload. Pay. Print.</span>
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

export const featureItems = [
  {
    icon: QrCode,
    title: "QR-based shop entry",
    body: "Give every shop one clear, public link customers can open from a scan.",
  },
  {
    icon: FileStack,
    title: "Multiple documents",
    body: "The platform is designed for one order with many independently configured documents.",
  },
  {
    icon: Workflow,
    title: "Page-level choices",
    body: "Color, black and white, and paper size can vary across page ranges.",
  },
  {
    icon: ShieldCheck,
    title: "Verified payments",
    body: "Payment verification is designed to happen on the server before printing unlocks.",
  },
  {
    icon: Clock3,
    title: "Less manual work",
    body: "A future desktop bridge will connect shop workflows to local printers.",
  },
  {
    icon: Smartphone,
    title: "Made for phones",
    body: "A mobile-first customer entry point keeps the journey quick at the counter.",
  },
];

export function FeatureGrid({ limit }: { limit?: number }) {
  const items = limit ? featureItems.slice(0, limit) : featureItems;
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {items.map(({ icon: Icon, title, body }) => (
        <Card key={title} className="border-white/60 bg-white/80 p-6 shadow-sm">
          <Icon className="size-6 text-brand-600" />
          <h3 className="mt-7 text-lg font-semibold text-brand-950">{title}</h3>
          <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
        </Card>
      ))}
    </div>
  );
}

export function TrialCallout() {
  return (
    <section className="bg-brand-700">
      <div className="mx-auto flex max-w-7xl flex-col gap-7 px-6 py-14 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-100">For shop owners</p>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-white">
            Make every print request easier to handle.
          </h2>
          <p className="mt-3 max-w-xl leading-7 text-white/75">
            Start with a 15-day trial. Connect the parts of your shop workflow as the PrintSathi platform grows.
          </p>
        </div>
        <Button asChild variant="secondary" size="lg">
          <Link href="/register">
            Start free 15-day trial <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function FaqList() {
  const items = [
    [
      "What is PrintSathi?",
      "PrintSathi is a platform for connecting customers with local print shops through a simple QR-led ordering journey.",
    ],
    [
      "How does QR printing work?",
      "A shop's public QR link opens its customer entry page. Customers upload PDFs, configure page ranges and paper types, pay via Razorpay, and the shop's Windows Desktop Agent delivers the job to the printer.",
    ],
    [
      "Does the shop need a computer?",
      "Yes. A Windows computer at the shop runs the Desktop Agent. The browser never touches the printer — only the credentialed Agent bridges to the Windows Print Spooler.",
    ],
    [
      "How does the printer connect?",
      "The Desktop Agent discovers Windows printers via the native spooler, reports status to the Portal, and submits paid print jobs using the Windows PrintTo verb.",
    ],
    [
      "What documents will be supported?",
      "PDF is fully supported today. The architecture tracks additional formats (DOC/DOCX, spreadsheets, presentations, images, text) and a normalisation pipeline is planned for them.",
    ],
    [
      "Is there a free trial?",
      "New shops start on a 15-day free trial. Shop plans cost ₹699/month or ₹7,499/year, payable with Razorpay.",
    ],
  ];
  return (
    <div className="divide-y divide-line rounded-xl border border-line bg-white">
      {items.map(([question, answer]) => (
        <details key={question} className="group p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-brand-950">
            <span>{question}</span>
            <ChevronDown className="size-5 shrink-0 text-brand-600 transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">{answer}</p>
        </details>
      ))}
    </div>
  );
}

export function Steps() {
  const steps = [
    ["01", "Customer scans QR", "A shop's public link opens on any phone."],
    ["02", "Documents are prepared", "The future customer flow will upload and validate files."],
    ["03", "Print choices are configured", "Each document can have its own page-level requirements."],
    ["04", "One order is paid", "A verified order payment will unlock eligible jobs."],
    ["05", "The shop completes printing", "Individual jobs remain trackable through the local print workflow."],
  ];
  return (
    <div className="grid gap-5 md:grid-cols-5">
      {steps.map(([number, title, body]) => (
        <div
          key={number}
          className="relative border-l-2 border-brand-100 pl-5 md:border-l-0 md:border-t-2 md:pl-0 md:pt-5"
        >
          <span className="text-sm font-semibold text-brand-600">{number}</span>
          <h3 className="mt-4 font-semibold text-brand-950">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
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
