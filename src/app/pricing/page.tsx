import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter, SectionHeading, FaqList } from "@/components/marketing-site";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Pricing", description: "Printiva trial and subscription plans for print shops." };

export default function PricingPage() {
  return (
    <div>
      <SiteHeader />
      <main>
        <section className="bg-brand-50">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
            <SectionHeading
              eyebrow="Simple to start"
              title="Try the workflow before you commit."
              description="Every new shop begins with a 7-day free trial. Choose ₹699/month or ₹7,499/year with Razorpay checkout."
            />
            <Card className="mx-auto mt-12 max-w-2xl border-brand-100 p-8 shadow-lg shadow-brand-950/5 sm:p-10">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">Shop trial</p>
                  <h2 className="mt-3 text-3xl font-semibold text-brand-950">7 days free</h2>
                </div>
                <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-800">
                  Yearly: save 10%+
                </span>
              </div>
              <p className="mt-5 max-w-xl leading-7 text-muted">
                Pay ₹699 monthly or ₹7,499 yearly (₹889 less than twelve monthly payments).
                Subscription plans waive customer platform fees and unlock full shop features.
              </p>
              <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                {[
                  "Public shop QR entry",
                  "Owner workspace foundation",
                  "Multi-document order model",
                  "Windows printer integration",
                ].map((item) => (
                  <li className="flex items-center gap-2 text-sm text-muted" key={item}>
                    <Check className="size-4 text-brand-600" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button className="mt-8" asChild>
                <Link href="/register">
                  Start free 7-day trial <ArrowRight className="size-4" />
                </Link>
              </Button>
            </Card>
          </div>
        </section>
        <section className="mx-auto max-w-3xl px-6 py-20 lg:px-8">
          <SectionHeading
            eyebrow="Questions"
            title="A few useful answers."
            description="The details below reflect what is designed today and what still belongs to later product phases."
          />
          <div className="mt-10">
            <FaqList />
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
