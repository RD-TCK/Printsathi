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
    <div className="min-h-screen bg-white text-ink overflow-x-clip">
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
        <section className="border-b border-line bg-gradient-to-b from-[#f2fbf6]/60 via-white to-white py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
              Windows 10 &amp; 11 Print Automation
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-brand-950 sm:text-5xl lg:text-6xl">
              Automated Printing Software for Shops &amp; Counters
            </h1>
            <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg max-w-2xl mx-auto">
              Replace WhatsApp Web downloads and infected USB pen drives with dedicated Windows printing software. Customers scan your counter QR, pay via UPI, and prints start automatically in under 2 seconds.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <Button asChild size="lg" variant="primary" className="rounded-full px-7">
                <Link href="/register">Start ₹100 for 7 Days Trial</Link>
              </Button>
              <Link
                href="/download"
                className="inline-flex items-center justify-center rounded-full border border-line bg-white px-6 py-3 text-sm font-semibold text-brand-950 shadow-2xs transition hover:bg-slate-50"
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
              <h2 className="text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">
                Built specifically as commercial shop printing software
              </h2>
              <p className="mt-3 text-base text-slate-600">
                Every workflow in Printiva is tuned to cut counter bottlenecks and protect your printers.
              </p>
            </div>

            <div className="mt-12 grid gap-px rounded-2xl border border-line bg-line overflow-hidden md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  tag: "Zero-USB Intake",
                  title: "QR Upload Instead of WhatsApp",
                  desc: "Customers upload PDFs, DOCX, PPTX, XLSX, and images from their own phone browser with zero app downloads.",
                },
                {
                  tag: "Live Per-Page Billing",
                  title: "Automatic Page Counting",
                  desc: "Counts total pages, detects color vs. B&W page ranges, and calculates single or double-sided totals automatically.",
                },
                {
                  tag: "Direct Win32 Spooler",
                  title: "Silent Native Windows Printing",
                  desc: "Under-48MB system tray agent talks directly to Windows printer drivers—no slow Chrome print popups.",
                },
                {
                  tag: "Hardware Isolation",
                  title: "Dual-Printer Smart Routing",
                  desc: "Sends B&W pages strictly to laser printers and color pages strictly to color tank printers.",
                },
                {
                  tag: "Verified Settlement",
                  title: "Razorpay UPI & Counter Cash",
                  desc: "Online payments are cryptographically verified before spooling, with instant token approval for cash orders.",
                },
                {
                  tag: "USB & Network Ready",
                  title: "Sleep Wake-Up & Queue Control",
                  desc: "Distinguishes deep-sleep printers from unplugged cables so your counter queue stays moving during rush hour.",
                },
              ].map((item) => (
                <div key={item.title} className="bg-white p-7 sm:p-8 hover:bg-slate-50/70 transition-colors">
                  <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-brand-700">
                    {item.tag}
                  </p>
                  <h3 className="mt-3 text-lg font-semibold text-brand-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SupportedPrinters />

        {/* FAQ */}
        <section className="mx-auto max-w-4xl px-6 py-20 lg:py-24 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">FAQ</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">
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
