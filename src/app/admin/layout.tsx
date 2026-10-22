import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NO_INDEX } from "@/lib/seo";
import { ProtectedLayout } from "@/components/protected-layout";
export const metadata: Metadata = { robots: NO_INDEX };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <ProtectedLayout allowedRoles={["admin"]}>{children}</ProtectedLayout>;
}
