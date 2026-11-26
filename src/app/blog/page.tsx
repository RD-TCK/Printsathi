import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter, TrialCallout } from "@/components/marketing-site";
import { JsonLd } from "@/components/json-ld";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Printiva Blog — Printing Software & Printer Guides (English & हिंदी)",
  description:
    "Practical guides in English and Hindi for print shop owners and cyber cafes: Windows printing software, fixing USB printer offline issues, dual-printer color routing, and QR counter printing.",
  path: "/blog",
  keywords: [
    "printing software blog",
    "printing software in hindi",
    "printer offline solution hindi",
    "printer troubleshooting guides",
    "xerox shop automation tips",
    "Windows print spooler guides",
    "printing software India",
  ],
  absoluteTitle: true,
});

export default function BlogIndexPage() {
  const englishPosts = BLOG_POSTS.filter((p) => p.language === "en");
  const hindiPosts = BLOG_POSTS.filter((p) => p.language === "hi");

  return (
    <div className="min-h-screen bg-white text-ink overflow-x-clip dark:bg-[#090b0f] dark:text-slate-100">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            ["Home", "/"],
            ["Blog", "/blog"],
          ]),
        ]}
      />
      <SiteHeader />

      <main>
        <section className="border-b border-line bg-[#fafaf8] dark:border-white/[0.08] dark:bg-[#0d1016] py-16 lg:py-20 px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
              Printiva Resources • English &amp; हिंदी
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-brand-950 sm:text-5xl">
              Guides on Printing Software &amp; Counter Hardware
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg max-w-2xl mx-auto">
              Practical articles in English and Hindi on Windows printer spooling, dual-printer B&amp;W/color routing, duplex billing, and automating local xerox counters.
            </p>
            <div className="mt-7 flex items-center justify-center gap-3 text-xs font-semibold">
              <a
                href="#english-guides"
                className="rounded-full border border-line bg-white px-4 py-2 text-brand-950 hover:bg-slate-50"
              >
                English Guides ({englishPosts.length})
              </a>
              <a
                href="#hindi-guides"
                className="rounded-full border border-emerald-200 bg-emerald-50/70 px-4 py-2 text-emerald-900 hover:bg-emerald-100/70"
              >
                हिंदी गाइड / Hindi ({hindiPosts.length})
              </a>
            </div>
          </div>
        </section>

        {/* English Guides */}
        <section id="english-guides" className="py-16 lg:py-20 px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-xl font-bold tracking-tight text-brand-950 mb-6">English Guides</h2>
            <div className="grid gap-px rounded-2xl border border-line bg-line overflow-hidden md:grid-cols-2 lg:grid-cols-3">
              {englishPosts.map((post) => (
                <article
                  key={post.slug}
                  className="bg-white p-7 sm:p-8 flex flex-col justify-between transition-colors hover:bg-slate-50/70"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono uppercase tracking-[0.12em]">
                      <span className="font-semibold text-brand-700">{post.category}</span>
                      <span className="text-slate-400">{post.readTime}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-bold tracking-tight text-brand-950 leading-snug">
                      <Link href={`/blog/${post.slug}`} className="hover:text-brand-700 transition-colors">
                        {post.title}
                      </Link>
                    </h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                      {post.description}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                    <time dateTime={post.publishedAt} className="font-mono text-slate-400">
                      {post.publishedAt}
                    </time>
                    <Link
                      href={`/blog/${post.slug}`}
                      className="font-semibold text-brand-700 hover:text-brand-950 hover:underline"
                    >
                      Read guide
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Hindi Guides */}
        <section id="hindi-guides" lang="hi" className="border-t border-line bg-[#fafaf8]/70 dark:border-white/[0.08] dark:bg-[#0d1016] py-16 lg:py-20 px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-xl font-bold tracking-tight text-brand-950 mb-6">
              हिंदी गाइड — प्रिंट शॉप और प्रिंटर जानकारी
            </h2>
            <div className="grid gap-px rounded-2xl border border-line bg-line overflow-hidden md:grid-cols-2">
              {hindiPosts.map((post) => (
                <article
                  key={post.slug}
                  className="bg-white p-7 sm:p-8 flex flex-col justify-between transition-colors hover:bg-slate-50/70"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono uppercase tracking-[0.12em]">
                      <span className="font-semibold text-brand-700">{post.category}</span>
                      <span className="text-slate-400">{post.readTime}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-bold tracking-tight text-brand-950 leading-snug">
                      <Link href={`/blog/${post.slug}`} className="hover:text-brand-700 transition-colors">
                        {post.title}
                      </Link>
                    </h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                      {post.description}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                    <time dateTime={post.publishedAt} className="font-mono text-slate-400">
                      {post.publishedAt}
                    </time>
                    <Link
                      href={`/blog/${post.slug}`}
                      className="font-semibold text-brand-700 hover:text-brand-950 hover:underline"
                    >
                      पूरा लेख पढ़ें
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <TrialCallout />
      </main>

      <MarketingFooter />
    </div>
  );
}
