import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentProfile } from "@/lib/supabase/server";

export async function ProtectedLayout({ children, allowedRoles }: { children: ReactNode; allowedRoles?: string[] }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (allowedRoles && !allowedRoles.includes(profile.role)) redirect("/");
  return <>{children}</>;
}
