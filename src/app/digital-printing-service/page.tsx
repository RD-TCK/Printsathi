import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FileText,
  Layers,
  MapPin,
  Printer,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter, SectionHeading, TrialCallout } from "@/components/marketing-site";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, faqJsonLd, pageMetadata, serviceJsonLd } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Digital Printing Service & Print Automation Software | Printiva",
  description:
    "India's premier digital printing service & print automation platform. Upload documents directly from your phone, configure B&W or colour, pay via UPI, and collect instant printouts at local xerox shops.",
  path: "/digital-printing-service",
  keywords: [
    "digital printing service",
    "print automation software",
    "photocopy software",
    "online document printing India",
    "print documents from phone",
    "xerox shop near me",
    "colour printout service",
    "pay and print near me",
  ],
});

const serviceFaqs: ReadonlyArray<readonly [string, string]> = [
  [
    "What is a digital printing service?",
    "A digital printing service allows you to send digital files (such as PDFs, Word documents, spreadsheets, presentations, and photos) straight from your smartphone or laptop to a commercial printer without the need for manual printing plates or manual WhatsApp file transfers.",
  ],
  [
    "How does Printiva's digital printing service work?",
    "When you visit any Printiva-partnered print shop or xerox center, scan the counter QR code with your phone camera. Select your files, choose your page ranges, color mode (Monochrome or Colour), paper size (A4 or A3), and duplex settings, then pay via UPI or cash. The shop's physical printer prints your documents immediately.",
  ],
  [
    "Can shop owners use Printiva as photocopy and print automation software?",
    "Yes. Printiva provides print shop owners with a lightweight Windows Desktop Agent that connects their physical printers (HP, Canon, Epson, Brother, Ricoh, etc.) to the cloud. It eliminates WhatsApp counter chaos, automates page counting and pricing, and spools jobs to printers automatically in seconds.",
  ],
  [
    "What file formats are supported?",
    "Printiva supports PDF documents, Microsoft Word (.docx), PowerPoint (.pptx), Excel (.xlsx), and high-resolution images (.jpeg, .png, .webp). Files are converted into vector print streams for crisp, professional quality.",
  ],
];

export default function DigitalPrintingServicePage() {
  return (
    <div className="min-h-screen bg-white text-ink overflow-x-hidden">
      <JsonLd
        data={[
          serviceJsonLd(),
          breadcrumbJsonLd([
            ["Home", "/"],
            ["Digital Printing Service", "/digital-printing-service"],
          ]),
          faqJsonLd(serviceFaqs),
        ]}
      />
      <SiteHeader />

      <main>
        {/* ━━━ HERO SECTION ━━━ */}
        <section className="relative isolate overflow-hidden bg-gradient-to-b from-brand-50/60 via-white to-white pb-20 pt-16 lg:pb-28 lg:pt-24">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(#16a34a_0.5px,transparent_0.5px)] [background-size:32px_32px] opacity-[0.03]" />
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-100/60 px-4 py-1.5 text-xs font-semibold text-brand-800 mb-6">
                <Sparkles className="size-3.5 text-brand-600" />
                Next-Generation Digital Printing &amp; Photocopy Automation
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight text-brand-950 sm:text-5xl lg:text-6xl lg:leading-[1.1]">
                High-Speed <span className="font-display gradient-text">Digital Printing Service</span> &amp; Print Automation
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted sm:text-xl">
                The modern printing software platform bridging mobile customers and local xerox shops. Scan a QR code, upload documents from your phone, pay securely, and collect crisp prints in seconds.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Button asChild variant="primary" className="h-12 px-7 text-base shadow-lg shadow-brand-700/20">
                  <Link href="/shops">
                    <MapPin className="size-4 mr-1.5" />
                    Find a Print Shop Near You
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="h-12 px-6 text-base border-brand-200 hover:bg-brand-50">
                  <Link href="/pricing">
                    For Shop Owners: Try for ₹100
                    <ArrowRight className="size-4 ml-1.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ━━━ DUAL AUDIENCE VALUE PROPOSITION ━━━ */}
        <section className="py-20 lg:py-28 px-6 lg:px-8 bg-slate-50/70 border-y border-line">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">Dual Ecosystem</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">
                Engineered for Both Customers &amp; Print Shop Owners
              </h2>
              <p className="mt-4 text-base text-muted sm:text-lg">
                Whether you need urgent document printouts or run a busy xerox counter, Printiva simplifies every step.
              </p>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              {/* Customer Journey Card */}
              <Card className="rounded-3xl border-brand-200/80 bg-white p-8 sm:p-10 shadow-sm transition hover:shadow-md">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 mb-6">
                  <Smartphone className="size-6" />
                </div>
                <h3 className="text-2xl font-bold text-brand-950">For Customers &amp; Students</h3>
                <p className="mt-3 text-muted text-sm sm:text-base leading-relaxed">
                  Never stand in long queues or hand over your phone to strangers. Print documents privately and instantly.
                </p>
                <ul className="mt-6 space-y-3.5 text-sm text-slate-700">
                  {[
                    "Zero app installation required — works straight from your mobile browser.",
                    "Live per-page price calculator before you pay; no hidden surprises.",
                    "Flexible options: Colour vs B&W, A4/A3, page ranges, and double-sided duplex.",
                    "Pay securely via UPI (Google Pay, PhonePe, Paytm) or at the counter with Cash.",
                    "Real-time order tracking from upload to physical print completion.",
                  ].map((feat) => (
                    <li key={feat} className="flex items-start gap-3">
                      <CheckCircle2 className="size-5 shrink-0 text-emerald-600 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 pt-6 border-t border-slate-100">
                  <Link href="/shops" className="inline-flex items-center text-sm font-semibold text-brand-700 hover:text-brand-900 gap-1.5">
                    Browse active print shops <ArrowRight className="size-4" />
                  </Link>
                </div>
              </Card>

              {/* Shop Owner Journey Card */}
              <Card className="rounded-3xl border-brand-200/80 bg-white p-8 sm:p-10 shadow-sm transition hover:shadow-md">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 mb-6">
                  <Printer className="size-6" />
                </div>
                <h3 className="text-2xl font-bold text-brand-950">For Photocopy &amp; Xerox Shops</h3>
                <p className="mt-3 text-muted text-sm sm:text-base leading-relaxed">
                  Transform your counter with autonomous print automation software that operates silently in your system tray.
                </p>
                <ul className="mt-6 space-y-3.5 text-sm text-slate-700">
                  {[
                    "Eliminate WhatsApp clutter and virus-infected customer USB pen drives.",
                    "Automated page counting and split-queue hardware routing for color & mono printers.",
                    "Razorpay-verified online payments prevent counterfeit UPI screenshots.",
                    "Counter token queue system manages walk-in cash customers with zero friction.",
                    "Native Windows Desktop Agent communicates directly with the print spooler in &lt; 500ms.",
                  ].map((feat) => (
                    <li key={feat} className="flex items-start gap-3">
                      <CheckCircle2 className="size-5 shrink-0 text-emerald-600 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 pt-6 border-t border-slate-100">
                  <Link href="/pricing" className="inline-flex items-center text-sm font-semibold text-brand-700 hover:text-brand-900 gap-1.5">
                    Start 7-day trial for ₹100 <ArrowRight className="size-4" />
                  </Link>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* ━━━ COMPARISON TABLE ━━━ */}
        <section className="py-20 lg:py-28 px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-14">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">Why It Matters</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">
                Traditional Xerox Counter vs. Printiva Digital Automation
              </h2>
              <p className="mt-4 text-base text-muted">
                See how print automation software saves up to 4 hours per day for shopkeepers and cuts counter wait times by 75%.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-line">
                  <tr>
                    <th className="p-4 sm:p-5">Feature / Task</th>
                    <th className="p-4 sm:p-5 text-red-600">Traditional WhatsApp Xerox</th>
                    <th className="p-4 sm:p-5 text-emerald-700 bg-emerald-50/50">Printiva Print Automation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-brand-950">Customer File Sharing</td>
                    <td className="p-4 sm:p-5 text-red-700">WhatsApp / Bluetooth / Pen Drive (clogs memory)</td>
                    <td className="p-4 sm:p-5 text-emerald-800 bg-emerald-50/30 font-medium">Instant Mobile Web QR Scan (Zero App)</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-brand-950">Page Counting &amp; Rate Calculation</td>
                    <td className="p-4 sm:p-5 text-red-700">Manual scrolling, counting, and mental math</td>
                    <td className="p-4 sm:p-5 text-emerald-800 bg-emerald-50/30 font-medium">Instant automatic vector page &amp; color detection</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-brand-950">Payment Verification</td>
                    <td className="p-4 sm:p-5 text-red-700">Manual check of easily faked screenshot</td>
                    <td className="p-4 sm:p-5 text-emerald-800 bg-emerald-50/30 font-medium">Cryptographically verified Razorpay UPI / Card</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-brand-950">Physical Printing Process</td>
                    <td className="p-4 sm:p-5 text-red-700">Manual Ctrl+P, selecting trays, color dialogues</td>
                    <td className="p-4 sm:p-5 text-emerald-800 bg-emerald-50/30 font-medium">Automatic background spooling in ~300ms–500ms</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-brand-950">Multi-Printer Hardware Routing</td>
                    <td className="p-4 sm:p-5 text-red-700">Operator manually splits B&amp;W and Color files</td>
                    <td className="p-4 sm:p-5 text-emerald-800 bg-emerald-50/30 font-medium">Smart split-queue sends B&amp;W to mono, Color to color</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ━━━ SUPPORTED HARDWARE & STANDARDS ━━━ */}
        <section className="bg-brand-950 text-white py-20 lg:py-28 px-6 lg:px-8 relative overflow-hidden">
          <div className="absolute top-0 right-1/4 -z-10 size-96 rounded-full bg-emerald-600/10 blur-3xl pointer-events-none" />
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Universal Compatibility</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Works With Any Printer Brand &amp; Windows PC
              </h2>
              <p className="mt-4 text-base text-white/60 sm:text-lg">
                No expensive proprietary kiosks required. Printiva operates with your current hardware setup.
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { title: "Printer Brands", desc: "HP, Canon, Epson, Brother, Ricoh, Konica Minolta, Xerox & more." },
                { title: "Connection Types", desc: "USB Direct, Wi-Fi Wireless, Local Ethernet LAN, WSD Network." },
                { title: "Operating Systems", desc: "Windows 10 and Windows 11 (64-bit). Ultra-lightweight (&lt; 48MB RAM)." },
                { title: "Media Formats", desc: "A4, A3, Legal, Single-Sided & Hardware Double-Sided Duplex." },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
                  <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm text-white/55 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ━━━ FAQS ━━━ */}
        <section className="py-20 lg:py-28 px-6 lg:px-8 mx-auto max-w-4xl">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">Frequently Asked Questions</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">
              Everything You Need to Know About Digital Printing Software
            </h2>
          </div>

          <div className="divide-y divide-slate-200">
            {serviceFaqs.map(([question, answer]) => (
              <div key={question} className="py-6">
                <h3 className="text-lg font-semibold text-brand-950">{question}</h3>
                <p className="mt-2 text-sm sm:text-base leading-relaxed text-muted">{answer}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ━━━ FINAL CTA ━━━ */}
        <TrialCallout />
      </main>

      <MarketingFooter />
    </div>
  );
}
