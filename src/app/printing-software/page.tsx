import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter, TrialCallout, FaqList } from "@/components/marketing-site";
import { SupportedPrinters } from "@/components/supported-printers";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, faqJsonLd, pageMetadata, softwareJsonLd } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Printing Software for Windows Print Shops & Cyber Cafes | Printiva",
  description:
    "Looking for fast, reliable printing software for your shop? Printiva connects your Windows 10/11 printer to QR customer ordering, auto page counting, Razorpay UPI payments, and instant 2-second automatic printing.",
  path: "/printing-software",
  keywords: [
    "printing software",
    "printing software for Windows",
    "printing software for shop",
    "automatic printing software",
    "print shop software",
    "print automation software",
    "best printing software India",
  ],
  absoluteTitle: true,
});

const printingSoftwareFaqs: ReadonlyArray<readonly [string, string]> = [
  [
    "What makes Printiva different from regular Windows printing tools?",
    "Unlike manual PDF viewers or generic spool monitors, Printiva is full-stack printing software for shops: customers scan your counter QR, upload files from their phone, see automatic per-page pricing, and pay via UPI or cash before your Windows printer automatically prints the job.",
  ],
  [
    "Which printers work with Printiva printing software?",
    "Any Windows 10 or Windows 11 compatible printer from HP, Canon, Epson, Brother, Ricoh, Kyocera, or Konica Minolta connected over USB, Wi-Fi, Ethernet, or WSD.",
  ],
  [
    "Does this printing software support separate Color and Black & White printers?",
    "Yes. Printiva detects hardware capabilities and lets you isolate Color vs. B&W printers so monochrome PDFs never waste color ink tanks.",
  ],
  [
    "How much does Printiva printing software cost?",
    "You can test Printiva in your shop with a ₹100 7-day trial. Ongoing plans are ₹699/month or ₹7,499/year with unlimited orders and automatic desktop agent updates.",
  ],
];

export default function PrintingSoftwarePage() {
  return (
    <div className="min-h-screen bg-white text-ink overflow-x-clip dark:bg-[#090b0f] dark:text-slate-100">
      <JsonLd
        data={[
          softwareJsonLd(),
          breadcrumbJsonLd([
            ["Home", "/"],
            ["Printing Software", "/printing-software"],
          ]),
          faqJsonLd(printingSoftwareFaqs),
        ]}
      />
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="border-b border-line bg-gradient-to-b from-[#f2fbf6]/60 via-white to-white dark:border-white/[0.08] dark:from-[#0d1016] dark:via-[#090b0f] dark:to-[#090b0f] py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-5xl lg:text-6xl">
              Automated Printing Software for Shops &amp; Counters
            </h1>
            <p className="mt-5 text-base leading-relaxed text-slate-600 dark:text-slate-300 sm:text-lg max-w-2xl mx-auto">
              Replace WhatsApp Web downloads and customer USB pen drives with Windows printing software. Customers scan your counter QR, pay via UPI, and print automatically in under 2 seconds.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <Button asChild size="lg" variant="primary" className="rounded-full px-7">
                <Link href="/register">Start ₹100 for 7 Days Trial</Link>
              </Button>
              <Link
                href="/download"
                className="inline-flex items-center justify-center rounded-full border border-line bg-white px-6 py-3 text-sm font-semibold text-brand-950 shadow-2xs transition hover:bg-slate-50 dark:border-white/[0.12] dark:bg-[#131720] dark:text-slate-100 dark:hover:bg-[#1a1f2b]"
              >
                Download Windows Agent
              </Link>
            </div>
          </div>
        </section>

        {/* Core Capabilities */}
        <section className="py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-4xl">
                Built for shop counters
              </h2>
              <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
                Direct browser-to-printer automation designed to keep counter queues moving.
              </p>
            </div>

            <div className="mt-12 grid gap-px rounded-2xl border border-line dark:border-white/[0.08] bg-line dark:bg-white/[0.08] overflow-hidden md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "QR Upload Instead of WhatsApp",
                  desc: "Customers upload PDFs, DOCX, PPTX, XLSX, and images straight from a mobile browser without installing an app.",
                },
                {
                  title: "Automatic Page Counting",
                  desc: "Counts total pages, detects color vs. B&W page ranges, and calculates single or double-sided totals live.",
                },
                {
                  title: "Silent Native Windows Printing",
                  desc: "Under-48 MB system tray agent sends paid jobs straight to Windows printer drivers without browser popups.",
                },
                {
                  title: "Dual-Printer Smart Routing",
                  desc: "Sends B&W pages to monochrome laser printers and color pages to color ink-tank printers automatically.",
                },
                {
                  title: "Razorpay UPI & Counter Cash",
                  desc: "Online payments are confirmed via Razorpay webhooks before spooling, with one-click token approval for cash.",
                },
                {
                  title: "Sleep Wake-Up & Queue Control",
                  desc: "Distinguishes deep-sleep printers from unplugged cables so print queues stay responsive.",
                },
              ].map((item) => (
                <div key={item.title} className="bg-white dark:bg-[#11141b] p-7 sm:p-8 hover:bg-slate-50/70 dark:hover:bg-[#161a23] transition-colors">
                  <h3 className="text-lg font-semibold text-brand-950 dark:text-white">{item.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SupportedPrinters />

        {/* FAQ */}
        <section className="mx-auto max-w-4xl px-6 py-20 lg:py-24 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-4xl">
              Printing software questions, answered.
            </h2>
          </div>
          <FaqList items={printingSoftwareFaqs} />
        </section>

        <TrialCallout />
      </main>

      <MarketingFooter />
    </div>
  );
}
