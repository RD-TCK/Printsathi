import Link from "next/link";
import { Download, ExternalLink, Printer } from "lucide-react";
import { getShopContext, formatStatus, isHeartbeatFresh } from "@/lib/shop-portal";
import { ShopPageHeader, MetricCard, StatusRow } from "@/components/shop-page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { WebAutoPrintStation } from "@/components/web-auto-print";

export const dynamic = "force-dynamic";

export default async function ShopDashboardPage() {
  const context = await getShopContext();
  if (!context)
    return (
      <Alert tone="error" title="Shop workspace unavailable">
        No shop membership is connected to this account.
      </Alert>
    );
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [settings, subscription, agent, printer, jobs, pages] = await Promise.all([
    context.client.from("shop_settings").select("accepting_orders").eq("shop_id", context.shop.id).maybeSingle(),
    context.client
      .from("subscriptions")
      .select("status, trial_end, current_period_end")
      .eq("shop_id", context.shop.id)
      .maybeSingle(),
    context.client
      .from("desktop_agents")
      .select("status, last_heartbeat_at, name, version")
      .eq("shop_id", context.shop.id)
      .eq("is_revoked", false)
      .order("last_heartbeat_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    context.client
      .from("printers")
      .select("status, name, last_seen_at, driver_name, is_default")
      .eq("shop_id", context.shop.id)
      .order("is_default", { ascending: false })
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    context.client
      .from("print_jobs")
      .select("status, total_amount, created_at", { count: "exact", head: false })
      .eq("shop_id", context.shop.id)
      .gte("created_at", start.toISOString()),
    context.client
      .from("print_job_pages")
      .select("start_page, end_page, print_job_id, print_jobs!inner(shop_id, created_at)")
      .eq("print_jobs.shop_id", context.shop.id)
      .gte("print_jobs.created_at", start.toISOString()),
  ]);
  const jobRows = jobs.data ?? [];
  const paidJobRows = jobRows.filter((job) =>
    ["paid", "queued", "claimed", "printing", "print_submitted", "completed"].includes(job.status),
  );
  const pending = jobRows.filter((job) => ["queued", "claimed", "printing", "print_submitted", "paid"].includes(job.status)).length;
  const completed = jobRows.filter((job) => job.status === "completed").length;
  const failed = jobRows.filter((job) => job.status === "failed").length;
  const revenue = paidJobRows.reduce((sum, job) => sum + Number(job.total_amount || 0), 0);
  const totalPages = (pages.data ?? []).reduce((sum, page) => sum + page.end_page - page.start_page + 1, 0);
  const agentConnected = agent.data?.status === "online" && isHeartbeatFresh(agent.data?.last_heartbeat_at);
  const printerReady = agentConnected && isHeartbeatFresh(printer.data?.last_seen_at, 30000) && ["online", "printing"].includes(printer.data?.status ?? "") && !/onenote|pdf|xps|fax/i.test(printer.data?.name || "");
  const subscriptionValid =
    subscription.data?.status === "trial"
      ? Boolean(subscription.data.trial_end && new Date(subscription.data.trial_end) > new Date())
      : subscription.data?.status === "active";
  const shopOpen = context.shop.is_active && Boolean(settings.data?.accepting_orders) && subscriptionValid;
  const operational = shopOpen && agentConnected && printerReady;
  return (
    <div className="space-y-8">
      <ShopPageHeader
        eyebrow="Live Operations"
        title={`Welcome back, ${context.profile.full_name || "shop owner"}.`}
        description="Manage paid orders, connected printers, and automatic printing from your Windows agent."
        action={
          <Button asChild variant="secondary">
            <Link href="/shop/qr">
              Open Customer QR <ExternalLink className="size-4" />
            </Link>
          </Button>
        }
      />

      {/* Auto-Print Station runs live right on the main dashboard */}
      <WebAutoPrintStation shopName={context.shop.name} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Today's jobs" value={String(jobRows.length)} detail="From recorded print jobs" />
        <MetricCard label="Pages today" value={String(totalPages)} detail="From configured page ranges" />
        <MetricCard
          label="Today's revenue"
          value={jobs.data ? `₹${revenue.toFixed(2)}` : "—"}
          detail={jobs.data ? "Recorded job totals" : "Awaiting data"}
        />
        <MetricCard
          label="Processing today"
          value={String(pending)}
          detail={`${completed} completed · ${failed} failed`}
          tone={pending || failed ? "warning" : "success"}
        />
      </div>
      {!shopOpen ? (
        <Alert tone="warning" title="Shop is not accepting orders">
          Customers can see this shop, but printing is not available until the shop is active, the subscription is
          valid, and accepting orders is enabled.
        </Alert>
      ) : (
        <Alert tone={operational ? "success" : "warning"} title={operational ? "Printer connected" : "Connect the Windows agent and printer"}>
          Automatic printing requires the paired Windows agent, a connected physical printer, and verified payment. Live connection and payment setup appear above.
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-brand-950">System status</h2>
            <p className="mt-1 text-sm text-muted">
              Shop access and subscription settings. Live hardware status appears above.
            </p>
          </CardHeader>
          <CardContent>
            <StatusRow
              label="Shop"
              value={context.shop.is_active ? "ACTIVE" : "OFFLINE"}
              detail={context.shop.is_active ? "Shop is published" : "Shop is hidden from customers"}
              tone={context.shop.is_active ? "success" : "warning"}
            />
            <StatusRow
              label="Subscription"
              value={formatStatus(subscription.data?.status)}
              detail={
                subscription.data?.trial_end
                  ? `Trial ends ${new Date(subscription.data.trial_end).toLocaleDateString()}`
                  : "View subscription details"
              }
              tone={subscriptionValid ? "success" : "warning"}
            />
            <StatusRow
              label="Accepting orders"
              value={settings.data?.accepting_orders ? "ENABLED" : "PAUSED"}
              detail={settings.data?.accepting_orders ? "Customers can create orders" : "Customer ordering is paused"}
              tone={settings.data?.accepting_orders ? "success" : "warning"}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-brand-950">Printing readiness</h2>
            <p className="mt-1 text-sm text-muted">
              Keep the Windows agent running on the computer connected to the printer.
            </p>
          </CardHeader>
          <CardContent>
            <Badge tone="neutral">AUTOMATIC WINDOWS PRINTING</Badge>
            <p className="mt-4 text-sm leading-6 text-muted">
              Install the printer driver, confirm a Windows test page prints, then pair the agent with the code on the Printer page. Submitted jobs require confirmation after the pages come out.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild variant="primary">
                <Link href="/shop/jobs">
                  <Printer className="size-4" />
                  View print jobs
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/download">
                  <Download className="size-4" />
                  Download Windows agent
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
