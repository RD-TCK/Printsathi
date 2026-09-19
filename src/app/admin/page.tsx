import { PortalShell } from "@/components/portal-shell";
import { Alert } from "@/components/ui/alert";
import { AdminDashboard } from "@/components/admin-dashboard";
import { loadAdminData } from "@/lib/admin-data";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin dashboard" };

export default async function AdminPage() {
  let data;
  let failed = false;
  try {
    data = await loadAdminData();
  } catch (error) {
    console.error("Admin monitoring unavailable", error);
    failed = true;
  }
  return (
    <PortalShell
      eyebrow="Platform administration"
      title="Every shop. One overview."
      description="Monitor printing, revenue, payments, subscriptions, and connected devices across Printiva."
    >
      {failed ? (
        <Alert tone="error" title="Monitoring data unavailable">
          Could not load complete platform data. Refresh to retry. No partial totals are displayed.
        </Alert>
      ) : data ? (
        <AdminDashboard data={data} />
      ) : (
        <Alert tone="warning" title="Administrator access required">
          Sign in with an account whose profile has the admin role.{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </Alert>
      )}
    </PortalShell>
  );
}
