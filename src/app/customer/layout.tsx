import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { CustomerPortalShell } from "@/components/customer-portal-shell";

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const client = await createSupabaseServerClient();
  const user = await getCurrentUser();

  // Must be logged in; redirect to customer-specific login
  if (!user || !client) redirect("/login");

  // Fetch profile - block shop owners from entering customer portal
  const { data: profile } = await client
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  // Shop staff/owners go to their own portal at /shop
  if (profile?.role === "shop_owner" || profile?.role === "shop_staff" || profile?.role === "admin") {
    redirect("/shop");
  }

  return (
    <CustomerPortalShell userName={profile?.full_name} email={user.email}>
      {children}
    </CustomerPortalShell>
  );
}
