import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { getAppUrl, publicEnv } from "@/lib/env";

// Regenerate hourly so newly registered shops reach search engines without a deploy.
export const revalidate = 3600;

const staticPages: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/digital-printing-service", priority: 0.9, changeFrequency: "weekly" },
  { path: "/shops", priority: 0.9, changeFrequency: "daily" },
  { path: "/features", priority: 0.8, changeFrequency: "monthly" },
  { path: "/how-it-works", priority: 0.8, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/download", priority: 0.6, changeFrequency: "monthly" },
  { path: "/track", priority: 0.5, changeFrequency: "yearly" },
  { path: "/register", priority: 0.5, changeFrequency: "yearly" },
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
  const lastModified = new Date();
  const shopIds = await listPublicShopIds();

  return [
    ...staticPages.map(({ path, priority, changeFrequency }) => ({
      url: `${baseUrl}${path}`,
      lastModified,
      changeFrequency,
      priority,
    })),
    ...shopIds.map((id) => ({
      url: `${baseUrl}/shop/${encodeURIComponent(id)}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
