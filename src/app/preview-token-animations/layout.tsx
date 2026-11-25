import type { ReactNode } from "react";
import { NO_INDEX } from "@/lib/seo";

export const metadata = {
  title: "Token Animation Preview",
  robots: NO_INDEX,
};

export default function PreviewTokenAnimationsLayout({ children }: { children: ReactNode }) {
  return children;
}
