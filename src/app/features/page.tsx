import { SiteHeader } from "@/components/site-header";
import { FeatureGrid, MarketingFooter, SectionHeading, TrialCallout } from "@/components/marketing-site";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Printing Software Features — Print Automation & Photocopy Management",
  description:
    "Explore Printiva's print automation software features: QR code document upload, automatic page counting, multi-printer queue routing, split color/mono spooling, and native Windows printing.",
  path: "/features",
  keywords: [
    "print automation software features",
    "photocopy software capabilities",
    "printing software for Windows",
    "automatic print spooler software",
    "xerox shop management features",
    "cyber cafe printing tools",
  ],
});

export default function FeaturesPage() {
  return (
    <div>
      <JsonLd
        data={breadcrumbJsonLd([
          ["Home", "/"],
          ["Features", "/features"],
        ])}
      />
      <SiteHeader />
      <main>
        <section className="bg-brand-50">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
            <SectionHeading
              as="h1"
              eyebrow="Platform foundation"
              title="A calmer way to run print requests."
              description="Printiva connects the customer journey, the shop workflow, and the Windows printer bridge into one focused system."
            />
            <div className="mt-12">
              <FeatureGrid />
            </div>
          </div>
        </section>
        <TrialCallout />
      </main>
      <MarketingFooter />
    </div>
  );
}
