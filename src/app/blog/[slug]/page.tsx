import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { MarketingFooter, TrialCallout } from "@/components/marketing-site";
import { JsonLd } from "@/components/json-ld";
import { BLOG_POSTS, getBlogPost } from "@/lib/blog-posts";
import { blogPostingJsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) {
    return pageMetadata({
      title: "Article Not Found",
      description: "Requested guide was not found.",
      path: `/blog/${slug}`,
    });
  }
  return pageMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
    keywords: post.keywords,
    locale: post.language === "hi" ? "hi_IN" : "en_IN",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const related = BLOG_POSTS.filter((p) => p.slug !== post.slug && p.language === post.language).slice(0, 3);
  const inLanguage = post.language === "hi" ? "hi-IN" : "en-IN";

  return (
    <div className="min-h-screen bg-white text-ink overflow-x-clip">
      <JsonLd
        data={[
          blogPostingJsonLd({
            title: post.title,
            description: post.description,
            path: `/blog/${post.slug}`,
            publishedAt: post.publishedAt,
            keywords: post.keywords,
            inLanguage,
          }),
          breadcrumbJsonLd([
            ["Home", "/"],
            ["Blog", "/blog"],
            [post.title, `/blog/${post.slug}`],
          ]),
        ]}
      />
      <SiteHeader />

      <main>
        <article lang={inLanguage} className="mx-auto max-w-3xl px-6 py-14 lg:py-20 lg:px-8">
          <nav className="mb-8 flex items-center gap-2 text-xs text-slate-500">
            <Link href="/" className="hover:text-brand-950">Home</Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-brand-950">Blog</Link>
            <span>/</span>
            <span className="text-brand-700 font-medium truncate">{post.category}</span>
          </nav>

          <header className="border-b border-line pb-8">
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono uppercase tracking-[0.12em]">
              <span className="font-semibold text-brand-700">{post.category}</span>
              <span className="text-slate-300">•</span>
              <time dateTime={post.publishedAt} className="text-slate-500">{post.publishedAt}</time>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500">{post.readTime}</span>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-brand-950 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]">
              {post.title}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
              {post.description}
            </p>
          </header>

          <div className="mt-10 space-y-10">
            {post.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-xl font-bold tracking-tight text-brand-950 sm:text-2xl">
                  {section.heading}
                </h2>
                <div className="mt-3.5 space-y-4 text-base leading-7 text-slate-700">
                  {section.paragraphs.map((para) => (
                    <p key={para}>{para}</p>
                  ))}
                </div>
                {section.bullets && section.bullets.length > 0 ? (
                  <ul className="mt-4 space-y-2.5 rounded-xl border border-line bg-[#fafaf8] p-5 text-sm leading-6 text-slate-700">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2.5">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-700" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          {/* Contextual Product Link Strip */}
          <div className="mt-12 rounded-2xl border border-line bg-[#f2fbf6]/70 p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-brand-950">
                {post.language === "hi"
                  ? "क्या आप अपनी दुकान का प्रिंटर ऑटोमैटिक बनाना चाहते हैं?"
                  : "Ready to automate your shop printer?"}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {post.language === "hi"
                  ? "₹100 में 7 दिन के ट्रायल के साथ Printiva Windows Printing Software आज़माएं।"
                  : "Try Printiva printing software for Windows with our ₹100 7-day trial."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 shrink-0">
              <Link
                href="/printing-software"
                className="rounded-full border border-line bg-white px-4 py-2 text-xs font-semibold text-brand-950 hover:bg-slate-50"
              >
                Printing Software
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-brand-950 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-950"
              >
                {post.language === "hi" ? "₹100 ट्रायल शुरू करें" : "Start ₹100 Trial"}
              </Link>
            </div>
          </div>

          {/* Related Guides */}
          <aside className="mt-16 border-t border-line pt-12">
            <h2 className="text-lg font-bold text-brand-950">
              {post.language === "hi" ? "प्रिंटर और दुकान से जुड़े अन्य लेख" : "More printer & shop guides"}
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {related.map((item) => (
                <Link
                  key={item.slug}
                  href={`/blog/${item.slug}`}
                  className="rounded-xl border border-line bg-white p-5 transition-colors hover:bg-slate-50"
                >
                  <p className="font-mono text-[10px] uppercase tracking-wider text-brand-700">
                    {item.category}
                  </p>
                  <h3 className="mt-2 text-sm font-semibold text-brand-950 leading-snug">
                    {item.title}
                  </h3>
                </Link>
              ))}
            </div>
          </aside>
        </article>

        <TrialCallout />
      </main>

      <MarketingFooter />
    </div>
  );
}
