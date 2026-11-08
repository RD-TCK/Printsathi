import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.1.36",
    "192.168.1.36:3000",
    "localhost",
    "localhost:3000",
    "127.0.0.1",
    "127.0.0.1:3000",
  ],
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  serverExternalPackages: ["sharp", "pdfjs-dist", "@napi-rs/canvas"],
  turbopack: { root: process.cwd() },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  experimental: {
    agentUpgrade: "security",
    optimizePackageImports: ["lucide-react", "clsx", "tailwind-merge", "@supabase/ssr", "zod"],
    serverActions: {
      bodySizeLimit: "50mb",
    },
    proxyClientMaxBodySize: "50mb",
  },
  async headers() {
    return [
      {
        source: "/:all*(svg|jpg|png|webp|ico|woff|woff2)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
