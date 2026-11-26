import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Zap } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter, FaqList, faqItems } from "@/components/marketing-site";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, faqJsonLd, pageMetadata, softwareJsonLd } from "@/lib/seo";
import { Button } from "@/components/ui/button";

export const metadata = pageMetadata({
  title: "Print Automation Software Pricing — ₹100 Trial for Xerox & Print Shops",
  description:
    "Transparent pricing for Printiva print automation & photocopy software. ₹100 for a 7-day trial, then ₹699/month or ₹7,499/year. Unlimited QR orders, auto-printing, and Razorpay checkout.",
  path: "/pricing",
  keywords: [
    "print automation software price",
    "photocopy software pricing",
    "xerox shop software cost",
    "print shop management software India",
    "printing software subscription",
    "Printiva pricing",
  ],
});

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white text-ink dark:bg-[#090b0f] dark:text-slate-100">
      <JsonLd
        data={[
          softwareJsonLd(),
          faqJsonLd(faqItems),
          breadcrumbJsonLd([
            ["Home", "/"],
            ["Pricing", "/pricing"],
          ]),
        ]}
      />
      <SiteHeader />

      <main>
        {/* Header */}
        <section className="border-b border-line bg-gradient-to-b from-emerald-50/50 via-white to-sky-50/30 dark:border-white/[0.08] dark:from-[#0e151a] dark:via-[#0d1016] dark:to-[#0c1218] py-16 lg:py-24">
          <div className="mx-auto max-w-4xl px-6 text-center lg:px-8">
            <h1 className="text-3xl font-bold tracking-tight text-brand-950 dark:text-white sm:text-5xl">
              Simple, Transparent Pricing
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
              Start with our ₹100 7-day trial. Test with your actual counter printers and customer orders before subscribing.
            </p>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-8 lg:grid-cols-2 items-stretch">
              {/* Card 1: 7-Day Trial */}
              <div className="rounded-2xl border border-line bg-white p-8 sm:p-10 shadow-xs flex flex-col justify-between">
                <div>
                  <span className="inline-block rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    7-Day Trial
                  </span>
                  <h2 className="mt-4 text-2xl font-bold text-brand-950">7-Day Full Trial</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Full access to the Windows desktop agent, counter QR generator, and customer upload queue.
                  </p>
                  <div className="mt-6 flex items-baseline gap-2">
                    <span className="text-4xl font-extrabold font-mono text-brand-950">₹100</span>
                    <span className="text-sm font-medium text-muted">one-time for 7 days</span>
                  </div>

                  <div className="mt-8 pt-6 border-t border-slate-100">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-900 mb-4">Included in trial</p>
                    <ul className="space-y-3">
                      {[
                        "Public shop counter QR code & sticker asset",
                        "Windows Desktop Agent (USB/Wi-Fi/Network printer)",
                        "Automatic per-page pricing (B&W and Color)",
                        "Integrated Razorpay UPI & cash counter queue",
                        "No manual print dialogs or page counting",
                      ].map((item) => (
                        <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                          <Check className="size-4 text-brand-700 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-8 pt-6">
                  <Button asChild size="lg" variant="secondary" className="w-full">
                    <Link href="/register" className="justify-center">
                      Start ₹100 Trial
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Card 2: Production Subscription */}
              <div className="rounded-2xl border-2 border-brand-700 bg-brand-50/30 dark:border-emerald-500/45 dark:bg-[#11141b] p-8 sm:p-10 shadow-sm flex flex-col justify-between relative">
                <div>
                  <span className="inline-block rounded-md bg-brand-100 dark:bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-brand-800 dark:text-emerald-300">
                    Monthly or Annual
                  </span>
                  <h2 className="mt-4 text-2xl font-bold text-brand-950 dark:text-white">Active Shop License</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Continuous printing automation, live queue management, and desktop agent updates.
                  </p>

                  <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <div>
                      <span className="text-4xl font-extrabold font-mono text-brand-950 dark:text-white">₹699</span>
                      <span className="text-sm font-medium text-muted"> / month</span>
                    </div>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-100/80 dark:text-emerald-300 dark:bg-emerald-500/15 px-2.5 py-1 rounded-md">
                      or ₹7,499/year (Save 10%+)
                    </span>
                  </div>

                  <div className="mt-8 pt-6 border-t border-brand-200/60 dark:border-white/[0.08]">
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-950 mb-4">Everything in trial plus</p>
                    <ul className="space-y-3">
                      {[
                        "Unlimited customer orders and document pages",
                        "Direct Razorpay payout routing with no platform fee",
                        "Multi-printer auto-routing (Laser B&W + Inkjet Color)",
                        "Counter queue center with ticket number token print",
                        "Real-time WhatsApp document upload support",
                        "Phone and WhatsApp support",
                      ].map((item) => (
                        <li key={item} className="flex items-start gap-2.5 text-sm text-slate-800">
                          <Check className="size-4 text-brand-700 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-8 pt-6">
                  <Button asChild size="lg" variant="primary" className="w-full">
                    <Link href="/register" className="justify-center">
                      Register Your Shop Now <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* Trust callout strip */}
            <div className="mt-12 rounded-xl border border-line bg-slate-50/80 p-6 flex flex-wrap items-center justify-around gap-6 text-xs font-medium text-slate-700">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-700" />
                Razorpay Verified Checkout
              </span>
              <span className="inline-flex items-center gap-2">
                <Zap className="size-4 text-brand-700" />
                Instant Activation
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-brand-700" />
                Cancel Anytime
              </span>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-line py-16 lg:py-24 px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-brand-950 dark:text-white">Pricing &amp; Trial Details</h2>
            </div>
            <div className="mt-10">
              <FaqList />
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
