import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/env";

// Signed-in workspaces, APIs, and auth plumbing carry nothing worth indexing.
const privatePaths = [
  "/api/",
  "/admin",
  "/customer",
  "/auth/",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/shop/dashboard",
  "/shop/jobs",
  "/shop/analytics",
  "/shop/pricing",
  "/shop/printer",
  "/shop/qr",
  "/shop/settings",
  "/shop/subscription",
  // Shop links shared over WhatsApp carry a private order token in the query string.
  "/*?*token=",
  "/*?*orderId=",
];

// Answer engines and AI assistants: named explicitly so the allow rule is unambiguous.
const aiCrawlers = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Amazonbot",
  "CCBot",
  "DuckAssistBot",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppUrl();
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: privatePaths },
      { userAgent: aiCrawlers, allow: "/", disallow: privatePaths },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
