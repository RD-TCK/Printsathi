import { SiteHeader } from "@/components/site-header";
import { FeatureGrid, MarketingFooter, SectionHeading, TrialCallout } from "@/components/marketing-site";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Print Shop Software Features — QR Ordering, Auto Pricing & Printing",
  description:
    "Printiva features for print shops: QR code ordering, multi-document uploads, page-range and colour controls, Razorpay-verified payments, and a Windows agent that prints automatically.",
  path: "/features",
  keywords: ["print shop software features", "QR ordering for print shops", "automatic print routing"],
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
