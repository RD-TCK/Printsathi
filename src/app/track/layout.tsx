import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Track Print Order — Real-Time Print Queue & Status",
  description:
    "Track your print order status in real time on Printiva. Enter your public Order ID to check printing status, token queue position, and document details.",
  path: "/track",
  keywords: [
    "track print order",
    "printout status",
    "Printiva order tracking",
    "xerox token status",
    "print queue status online",
  ],
});

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}

