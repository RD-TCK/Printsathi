import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter, TrialCallout, FaqList } from "@/components/marketing-site";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, faqJsonLd, pageMetadata, softwareJsonLd } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Xerox Shop Software & Photocopy Management System | Printiva",
  description:
    "Complete xerox shop software and photocopy management system for Indian print centers and cyber cafes. Automate customer file uploads, per-page billing, UPI payments, and Windows printing.",
  path: "/xerox-shop-software",
  keywords: [
    "xerox shop software",
    "photocopy shop software",
    "photocopy software",
    "xerox shop billing software",
    "cyber cafe printing software",
    "printing software",
    "print shop management software",
  ],
  absoluteTitle: true,
});

const xeroxFaqs: ReadonlyArray<readonly [string, string]> = [
  [
    "How does xerox shop software handle customers who want to pay cash?",
    "Printiva supports both instant online Razorpay UPI and counter cash tokens. Cash requests enter your desktop agent's counter queue—you collect cash and click Print & Approve in one click.",
  ],
  [
    "Does my xerox shop need a new printer to use Printiva?",
    "No. Printiva connects to the printers already hooked up to your Windows 10 or Windows 11 PC—including HP LaserJet 1020/M1005, Canon imageCLASS/PIXMA, Epson EcoTank, Brother, Ricoh, and Kyocera models.",
  ],
  [
    "Can it print double-sided on printers without automatic duplex?",
    "Yes. Printiva detects hardware duplex capability automatically and provides guided odd-then-even double-sided batch printing for simplex printers.",
  ],
];

export default function XeroxShopSoftwarePage() {
  return (
    <div className="min-h-screen bg-white text-ink overflow-x-clip dark:bg-[#090b0f] dark:text-slate-100">
      <JsonLd
        data={[
          softwareJsonLd(),
          breadcrumbJsonLd([
            ["Home", "/"],
            ["Xerox Shop Software", "/xerox-shop-software"],
          ]),
          faqJsonLd(xeroxFaqs),
        ]}
      />
      <SiteHeader />

      <main>
        <section className="border-b border-line bg-gradient-to-b from-[#fafaf8] via-white to-white dark:border-white/[0.08] dark:from-[#0d1016] dark:via-[#090b0f] dark:to-[#090b0f] py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-5xl lg:text-6xl">
              Xerox Shop Software Built for High-Volume Counters
            </h1>
            <p className="mt-5 text-base leading-relaxed text-slate-600 dark:text-slate-300 sm:text-lg max-w-2xl mx-auto">
              Stop searching WhatsApp chats for student PDFs. Printiva turns any Windows PC and counter printer into a self-serve QR ordering, billing, and auto-printing station.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <Button asChild size="lg" variant="primary" className="rounded-full px-7">
                <Link href="/register">Start ₹100 for 7 Days Trial</Link>
              </Button>
              <Link
                href="/printing-software"
                className="inline-flex items-center justify-center rounded-full border border-line bg-white px-6 py-3 text-sm font-semibold text-brand-950 shadow-2xs transition hover:bg-slate-50 dark:border-white/[0.12] dark:bg-[#131720] dark:text-slate-100 dark:hover:bg-[#1a1f2b]"
              >
                Explore Printing Software
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-px rounded-2xl border border-line dark:border-white/[0.08] bg-line dark:bg-white/[0.08] overflow-hidden md:grid-cols-2">
              {[
                {
                  title: "Handle 10+ simultaneous uploads cleanly",
                  desc: "Each customer scans your counter QR, uploads multiple documents, picks custom page ranges, and gets a unique token number without desktop clutter.",
                },
                {
                  title: "Exact per-page pricing before print",
                  desc: "Set your shop's exact B&W, Color, A4, A3, and double-sided rates once. Customers pay the computed amount via UPI or cash.",
                },
                {
                  title: "Automatic B&W vs. Color split",
                  desc: "Color and monochrome pages route strictly to matching machines so B&W jobs stay off your color ink tanks.",
                },
                {
                  title: "WhatsApp Direct + QR Counter Sync",
                  desc: "When customers send files on WhatsApp, the desktop agent replies with one clean configuration and print link.",
                },
              ].map((card) => (
                <div key={card.title} className="bg-white dark:bg-[#11141b] p-8 hover:bg-slate-50/70 dark:hover:bg-[#161a23] transition-colors">
                  <h2 className="text-xl font-bold text-brand-950 dark:text-white">{card.title}</h2>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-16 lg:py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl">
              Xerox &amp; photocopy shop FAQs
            </h2>
          </div>
          <FaqList items={xeroxFaqs} />
        </section>

        <TrialCallout />
      </main>

      <MarketingFooter />
    </div>
  );
}
