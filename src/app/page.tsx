import Link from "next/link";
import { ArrowDownRight, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import {
  FeatureGrid,
  FaqList,
  MarketingFooter,
  SectionHeading,
  Steps,
  TrialCallout,
} from "@/components/marketing-site";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Scan. Upload. Pay. Print.",
  description: "PrintSathi gives local print shops and their customers one clearer way to get print work done.",
  openGraph: {
    title: "PrintSathi | Scan. Upload. Pay. Print.",
    description: "A clearer way for local shops and their customers to print together.",
    type: "website",
  },
};

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="relative isolate min-h-[680px] overflow-hidden bg-brand-950 text-white">
          <div className="absolute inset-0 -z-20 bg-[url('https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=2200&q=85')] bg-cover bg-center" />
          <div className="absolute inset-0 -z-10 bg-brand-950/78" />
          <div className="mx-auto grid min-h-[680px] max-w-7xl items-end gap-14 px-6 pb-16 pt-24 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:px-8 lg:pb-20">
            <div className="max-w-3xl">
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-brand-100">
                <span className="size-2 rounded-full bg-brand-600" />
                The print shop workflow, rethought
              </p>
              <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
                Automated printing for the places people already trust.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-white/75">
                PrintSathi connects a shop&apos;s QR code, a customer&apos;s order, and the shop&apos;s future local
                print bridge in one focused platform.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/register">
                    Start Free 15-Day Trial <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href="/how-it-works">
                    See How It Works <ArrowDownRight className="size-4" />
                  </Link>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/70">
                {["Built for local shops", "One order, many documents", "Printer bridge planned separately"].map(
                  (item) => (
                    <span className="inline-flex items-center gap-2" key={item}>
                      <Check className="size-4 text-brand-100" />
                      {item}
                    </span>
                  ),
                )}
              </div>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-white/15 pb-5">
                <div>
                  <p className="text-sm font-semibold">PrintSathi order view</p>
                  <p className="mt-1 text-xs text-white/55">Designed for one clear status</p>
                </div>
                <ShieldCheck className="size-6 text-brand-100" />
              </div>
              <div className="space-y-4 py-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/65">3 documents</span>
                  <span className="font-semibold text-brand-100">₹ —</span>
                </div>
                <div className="space-y-2">
                  <div className="h-2 rounded-full bg-white/15" />
                  <div className="h-2 w-4/5 rounded-full bg-white/15" />
                  <div className="h-2 w-3/5 rounded-full bg-white/15" />
                </div>
              </div>
              <div className="rounded-lg bg-brand-100 p-4 text-brand-950">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Future order journey</p>
                <p className="mt-2 text-sm font-semibold">Scan → Upload → Configure → Pay → Print</p>
              </div>
            </div>
          </div>
        </section>
        <section className="bg-brand-50">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
            <SectionHeading
              eyebrow="How it works"
              title="A short path from counter to completion."
              description="PrintSathi is being assembled around the moments that make printing feel unnecessarily manual today."
            />
            <div className="mt-12">
              <Steps />
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
          <SectionHeading
            eyebrow="Core features"
            title="The pieces of a better print day."
            description="The architecture is ready for these capabilities; each workflow will be enabled and validated in its own product phase."
          />
          <div className="mt-12">
            <FeatureGrid limit={6} />
          </div>
        </section>
        <section className="border-y border-line bg-white">
          <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:px-8 lg:py-24">
            <SectionHeading
              eyebrow="For shop owners"
              title="Spend less time translating print requests."
              description="Give customers a clear entry point, keep orders understandable, and build toward a local workflow that does not ask the browser to control a printer."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  title: "Fewer repeated questions",
                  body: "A QR-led customer path keeps the brief, documents, and status in one place.",
                },
                {
                  title: "Orders with context",
                  body: "One order can hold multiple documents while each print job stays trackable.",
                },
                {
                  title: "A measured foundation",
                  body: "Payments, pricing, and printer execution are kept behind the right server and desktop boundaries.",
                },
                {
                  title: "A 15-day start",
                  body: "Start with a free trial, then choose monthly or yearly subscription billing.",
                },
              ].map((item) => (
                <div className="border-l-2 border-brand-100 pl-5" key={item.title}>
                  <h3 className="font-semibold text-brand-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-3xl px-6 py-20 lg:px-8 lg:py-24">
          <SectionHeading
            align="center"
            eyebrow="Questions"
            title="Clear answers, without the fine print."
            description="The product is being built openly. These answers separate what is designed from what is already live."
          />
          <div className="mt-10">
            <FaqList />
          </div>
        </section>
        <TrialCallout />
      </main>
      <MarketingFooter />
    </div>
  );
}
