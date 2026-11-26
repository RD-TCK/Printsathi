import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { getAppUrl, publicEnv } from "@/lib/env";
import { BLOG_POSTS } from "@/lib/blog-posts";

// Regenerate hourly so newly registered shops reach search engines without a deploy.
export const revalidate = 3600;

const SITE_RELEASE_DATE = new Date("2026-11-26");

const staticPages: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  includeImages?: boolean;
}> = [
  { path: "", priority: 1.0, changeFrequency: "weekly", includeImages: true },
  { path: "/printing-software", priority: 0.9, changeFrequency: "weekly", includeImages: true },
  { path: "/xerox-shop-software", priority: 0.9, changeFrequency: "weekly", includeImages: true },
  { path: "/digital-printing-service", priority: 0.9, changeFrequency: "weekly", includeImages: true },
  { path: "/shops", priority: 0.9, changeFrequency: "daily" },
  { path: "/blog", priority: 0.85, changeFrequency: "weekly" },
  { path: "/features", priority: 0.8, changeFrequency: "monthly", includeImages: true },
  { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly", includeImages: true },
  { path: "/pricing", priority: 0.85, changeFrequency: "monthly" },
  { path: "/download", priority: 0.75, changeFrequency: "monthly", includeImages: true },
  { path: "/track", priority: 0.5, changeFrequency: "monthly" },
  { path: "/register", priority: 0.6, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/refund", priority: 0.3, changeFrequency: "yearly" },
  { path: "/shipping", priority: 0.3, changeFrequency: "yearly" },
];

async function listPublicShopIds(): Promise<string[]> {
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) return [];
  try {
    // Anonymous client: the sitemap must only ever contain what the public directory view exposes.
    const client = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await client.from("public_shop_directory").select("public_id").eq("is_active", true).limit(5000);
    return (data ?? []).map((shop) => shop.public_id).filter(Boolean);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getAppUrl();
  const shopIds = await listPublicShopIds();
  const today = new Date();
  const siteImages = [`${baseUrl}/opengraph-image`, `${baseUrl}/hero-printer.webp`];

  return [
    ...staticPages.map(({ path, priority, changeFrequency, includeImages }) => ({
      url: `${baseUrl}${path}`,
      lastModified: changeFrequency === "daily" ? today : SITE_RELEASE_DATE,
      changeFrequency,
      priority,
      ...(includeImages ? { images: siteImages } : {}),
    })),
    ...BLOG_POSTS.map((post) => ({
      url: `${baseUrl}/blog/${post.slug}`,
      lastModified: new Date(post.publishedAt),
      changeFrequency: "monthly" as const,
      priority: 0.75,
      images: [`${baseUrl}/opengraph-image`],
    })),
    ...shopIds.map((id) => ({
      url: `${baseUrl}/shop/${encodeURIComponent(id)}`,
      lastModified: today,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
