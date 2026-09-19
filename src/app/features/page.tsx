import { SiteHeader } from "@/components/site-header";
import { FeatureGrid, MarketingFooter, SectionHeading, TrialCallout } from "@/components/marketing-site";

export const metadata = {
  title: "Features",
  description: "Explore the Printiva platform foundation for modern local printing.",
};

export default function FeaturesPage() {
  return (
    <div>
      <SiteHeader />
      <main>
        <section className="bg-brand-50">
          <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
            <SectionHeading
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
