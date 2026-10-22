import { SiteHeader } from "@/components/site-header";
import { MarketingFooter, SectionHeading, Steps, TrialCallout, workflowSteps } from "@/components/marketing-site";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, howToJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "How Printiva Works — Scan the QR, Upload, Pay, Print",
  description:
    "How to print documents with Printiva in four steps: scan the shop's QR code, upload and preview your files, pay by UPI or card, and the shop's printer prints automatically.",
  path: "/how-it-works",
  keywords: ["how to print documents online", "QR code printing steps", "print from phone at a print shop"],
});

export default function HowItWorksPage() {
  return (
    <div>
      <JsonLd
        data={[
          howToJsonLd({
            name: "How to print a document at a Printiva print shop",
            description:
              "Print documents from your phone at a local print shop using its Printiva QR code, with no app download.",
            steps: workflowSteps,
          }),
          breadcrumbJsonLd([
            ["Home", "/"],
            ["How It Works", "/how-it-works"],
          ]),
        ]}
      />
      <SiteHeader />
      <main>
        <section className="bg-brand-50">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
            <SectionHeading
              as="h1"
              eyebrow="The journey"
              title="From a scan to a finished print."
              description="The product is being built in deliberate phases, with payment and printer controls staying on trusted server and local-agent boundaries."
            />
            <div className="mt-14">
              <Steps />
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            {[
              ["For customers", "One QR entry point keeps the journey easy to find from a phone."],
              ["For shop owners", "A shared order view is designed to reduce repeated manual coordination."],
              ["For the platform", "Orders, documents, and print jobs remain separately observable and secure."],
            ].map(([title, body]) => (
              <div key={title} className="border-t-2 border-brand-100 pt-5">
                <h2 className="text-lg font-semibold text-brand-950">{title}</h2>
                <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>
        <TrialCallout />
      </main>
      <MarketingFooter />
    </div>
  );
}
