import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  MapPin,
  Printer,
  Smartphone,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter, TrialCallout } from "@/components/marketing-site";
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
    <div className="min-h-screen bg-white text-ink overflow-x-hidden dark:bg-[#090b0f] dark:text-slate-100">
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
        <section className="relative isolate overflow-hidden bg-gradient-to-b from-brand-50/50 via-white to-white dark:from-[#0d1016] dark:via-[#090b0f] dark:to-[#090b0f] pb-20 pt-16 lg:pb-28 lg:pt-24">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-5xl lg:text-6xl lg:leading-[1.1]">
                Digital Printing Service for Local Shops
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted sm:text-xl">
                Scan a counter QR code, upload documents from your phone, pay online or at the counter, and pick up your prints in seconds.
              </p>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Button asChild variant="primary" className="h-12 px-7 text-base shadow-sm">
                  <Link href="/shops">
                    <MapPin className="size-4 mr-1.5" />
                    Find a Print Shop Near You
                  </Link>
                </Button>
                <Button asChild variant="secondary" className="h-12 px-6 text-base">
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
        <section className="py-20 lg:py-28 px-6 lg:px-8 bg-slate-50/70 dark:bg-[#0d1016] border-y border-line dark:border-white/[0.08]">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-4xl">
                Built for Customers &amp; Print Shop Owners
              </h2>
              <p className="mt-4 text-base text-muted sm:text-lg">
                Simple browser ordering for walk-in customers and direct Windows spooling for shops.
              </p>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              {/* Customer Journey Card */}
              <Card className="rounded-2xl border-brand-200/80 dark:border-white/[0.08] bg-white dark:bg-[#11141b] p-8 sm:p-10 shadow-2xs">
                <div className="flex size-12 items-center justify-center rounded-xl bg-brand-50 dark:bg-white/[0.06] text-brand-700 dark:text-emerald-400 mb-6">
                  <Smartphone className="size-6" />
                </div>
                <h3 className="text-2xl font-bold text-brand-950 dark:text-white">For Customers &amp; Students</h3>
                <p className="mt-3 text-muted text-sm sm:text-base leading-relaxed">
                  Print directly from your mobile browser without waiting in chat queues or passing over USB drives.
                </p>
                <ul className="mt-6 space-y-3.5 text-sm text-slate-700 dark:text-slate-300">
                  {[
                    "No app installation needed — works straight from your phone browser.",
                    "Live per-page price calculation before checkout.",
                    "Flexible options: Colour vs B&W, A4/A3, page ranges, and duplexing.",
                    "Pay via UPI (Google Pay, PhonePe, Paytm) or counter cash.",
                    "Live order status tracking from upload to print completion.",
                  ].map((feat) => (
                    <li key={feat} className="flex items-start gap-3">
                      <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/[0.08]">
                  <Link href="/shops" className="inline-flex items-center text-sm font-semibold text-brand-700 dark:text-emerald-400 hover:text-brand-900 gap-1.5">
                    Browse active print shops <ArrowRight className="size-4" />
                  </Link>
                </div>
              </Card>

              {/* Shop Owner Journey Card */}
              <Card className="rounded-2xl border-brand-200/80 dark:border-white/[0.08] bg-white dark:bg-[#11141b] p-8 sm:p-10 shadow-2xs">
                <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-white/[0.06] text-emerald-700 dark:text-emerald-400 mb-6">
                  <Printer className="size-6" />
                </div>
                <h3 className="text-2xl font-bold text-brand-950 dark:text-white">For Photocopy &amp; Xerox Shops</h3>
                <p className="mt-3 text-muted text-sm sm:text-base leading-relaxed">
                  Run print automation silently from your Windows system tray without changing your printers.
                </p>
                <ul className="mt-6 space-y-3.5 text-sm text-slate-700 dark:text-slate-300">
                  {[
                    "Eliminate WhatsApp clutter and untrusted customer USB drives.",
                    "Automatic page counting and split routing for color & mono printers.",
                    "Razorpay-verified online payments prevent counterfeit screenshots.",
                    "Counter token queue manages walk-in cash orders cleanly.",
                    "Windows Desktop Agent communicates with the print spooler in < 500ms.",
                  ].map((feat) => (
                    <li key={feat} className="flex items-start gap-3">
                      <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/[0.08]">
                  <Link href="/pricing" className="inline-flex items-center text-sm font-semibold text-brand-700 dark:text-emerald-400 hover:text-brand-900 gap-1.5">
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
              <h2 className="text-3xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-4xl">
                Traditional Xerox Counter vs. Printiva Automation
              </h2>
              <p className="mt-4 text-base text-muted">
                Compare manual counter handling against direct QR intake and Windows spooling.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-line dark:border-white/[0.08] bg-white dark:bg-[#11141b] shadow-xs">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-white/[0.04] text-xs uppercase tracking-wider text-slate-500 border-b border-line dark:border-white/[0.08]">
                  <tr>
                    <th className="p-4 sm:p-5">Task</th>
                    <th className="p-4 sm:p-5 text-red-600 dark:text-rose-400">Manual Counter</th>
                    <th className="p-4 sm:p-5 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/10">Printiva</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] text-slate-700 dark:text-slate-300">
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-brand-950 dark:text-white">File Sharing</td>
                    <td className="p-4 sm:p-5 text-red-700 dark:text-rose-300">WhatsApp / Bluetooth / Pen Drive</td>
                    <td className="p-4 sm:p-5 text-emerald-800 dark:text-emerald-300 bg-emerald-50/30 dark:bg-emerald-500/[0.06] font-medium">Mobile Web QR Scan (No App)</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-brand-950 dark:text-white">Page Counting &amp; Pricing</td>
                    <td className="p-4 sm:p-5 text-red-700 dark:text-rose-300">Manual scrolling, counting, and math</td>
                    <td className="p-4 sm:p-5 text-emerald-800 dark:text-emerald-300 bg-emerald-50/30 dark:bg-emerald-500/[0.06] font-medium">Automatic page &amp; color detection</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-brand-950 dark:text-white">Payment Verification</td>
                    <td className="p-4 sm:p-5 text-red-700 dark:text-rose-300">Manual check of phone screenshots</td>
                    <td className="p-4 sm:p-5 text-emerald-800 dark:text-emerald-300 bg-emerald-50/30 dark:bg-emerald-500/[0.06] font-medium">Server-verified Razorpay UPI / Card</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-brand-950 dark:text-white">Physical Printing</td>
                    <td className="p-4 sm:p-5 text-red-700 dark:text-rose-300">Manual Ctrl+P and tray selection</td>
                    <td className="p-4 sm:p-5 text-emerald-800 dark:text-emerald-300 bg-emerald-50/30 dark:bg-emerald-500/[0.06] font-medium">Background spooling in ~300ms–500ms</td>
                  </tr>
                  <tr>
                    <td className="p-4 sm:p-5 font-semibold text-brand-950 dark:text-white">Multi-Printer Routing</td>
                    <td className="p-4 sm:p-5 text-red-700 dark:text-rose-300">Operator manually splits B&amp;W and Color files</td>
                    <td className="p-4 sm:p-5 text-emerald-800 dark:text-emerald-300 bg-emerald-50/30 dark:bg-emerald-500/[0.06] font-medium">Auto-routes B&amp;W to laser, Color to tank</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ━━━ SUPPORTED HARDWARE & STANDARDS ━━━ */}
        <section className="bg-brand-950 dark:bg-[#0d1016] text-white py-20 lg:py-28 px-6 lg:px-8 border-y border-transparent dark:border-white/[0.08]">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Works With Your Existing Printer &amp; Windows PC
              </h2>
              <p className="mt-4 text-base text-white/60 sm:text-lg">
                No dedicated kiosk hardware needed. Connect the printers already on your counter.
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { title: "Printer Brands", desc: "HP, Canon, Epson, Brother, Ricoh, Konica Minolta, Xerox & more." },
                { title: "Connection Types", desc: "USB Direct, Wi-Fi Wireless, Local Ethernet LAN, WSD Network." },
                { title: "Operating Systems", desc: "Windows 10 and Windows 11 (64-bit), under 48 MB RAM." },
                { title: "Media Formats", desc: "A4, A3, Legal, Single-Sided & Hardware Double-Sided Duplex." },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                  <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm text-white/60 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ━━━ FAQS ━━━ */}
        <section className="py-20 lg:py-28 px-6 lg:px-8 mx-auto max-w-4xl">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-4xl">
              Frequently Asked Questions
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
