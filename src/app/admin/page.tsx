import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { PortalShell } from "@/components/portal-shell";
import { EmptyState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { formatStatus, isHeartbeatFresh } from "@/lib/shop-portal";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const client = await createSupabaseServerClient();
  const user = await getCurrentUser();

  if (!client || !user) {
    return (
      <PortalShell
        eyebrow="Admin portal"
        title="Platform overview"
        description="System-wide visibility and operational controls."
      >
        <EmptyState
          title="Admin access required"
          description="You must be logged in as a platform administrator to view this page."
        />
      </PortalShell>
    );
  }

  // Query payments, shops, agents, printers, and transactions
  const [
    { data: payments },
    { data: shops },
    { data: orders },
    { data: transactions },
    { data: agents },
    { data: printers },
  ] = await Promise.all([
    client
      .from("payments")
      .select("id, status, amount, currency, provider_payment_id, provider_order_id, verified_at, created_at, order_id")
      .order("created_at", { ascending: false })
      .limit(100),
    client.from("shops").select("id, name, is_active"),
    client.from("orders").select("id, status, total_amount", { count: "exact", head: false }),
    client
      .from("payment_transactions")
      .select("id, payment_id, order_id, event_type, status, amount, currency, provider_payment_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    client
      .from("desktop_agents")
      .select(
        "id, name, shop_id, version, status, last_heartbeat_at, last_error, is_revoked, current_job_id, created_at, shops(name)",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    client.from("printers").select("id, shop_id, status, is_online, is_default"),
  ]);

  const paymentList = payments ?? [];
  const verifiedPayments = paymentList.filter((p) => p.status === "verified");
  const totalVerifiedRevenue = verifiedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const failedPayments = paymentList.filter((p) => p.status === "failed");
  const agentList = agents ?? [];
  const printerList = printers ?? [];
  const onlineAgents = agentList.filter(
    (a) => !a.is_revoked && isHeartbeatFresh(a.last_heartbeat_at) && a.status === "online",
  );

  return (
    <PortalShell
      eyebrow="Admin portal"
      title="Platform overview &amp; Payment Ledger"
      description="System-wide visibility across all shops, orders, and cryptographic Razorpay payment transactions."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-line bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Verified Revenue</p>
          <p className="mt-2 text-2xl font-bold text-brand-950">₹{totalVerifiedRevenue.toFixed(2)}</p>
          <p className="mt-1 text-xs text-muted">From {verifiedPayments.length} verified transactions</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Desktop Agents</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{onlineAgents.length} Online</p>
          <p className="mt-1 text-xs text-muted">
            {agentList.length} registered ({printerList.length} printers)
          </p>
        </div>
        <div className="rounded-xl border border-line bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Active Shops</p>
          <p className="mt-2 text-2xl font-bold text-brand-950">{shops?.filter((s) => s.is_active).length ?? 0}</p>
          <p className="mt-1 text-xs text-muted">{orders?.length ?? 0} orders recorded total</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Payment Failures</p>
          <p className="mt-2 text-2xl font-bold text-red-600">{failedPayments.length}</p>
          <p className="mt-1 text-xs text-muted">Eligible for retry</p>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-brand-950">Windows Desktop Agents</h2>
              <p className="mt-1 text-sm text-muted">
                Hardware bridge instances reporting live printer subsystem telemetry.
              </p>
            </div>
            <Badge tone="success">{onlineAgents.length} Online Now</Badge>
          </div>

          <div className="mt-6 overflow-x-auto">
            {agentList.length === 0 ? (
              <p className="text-sm text-muted py-4">No desktop agents registered yet.</p>
            ) : (
              <Table
                headers={["Agent Name", "Shop", "Status", "Version", "Last Heartbeat", "Current Job", "Registered"]}
                rows={agentList.map((a) => {
                  const shopData = Array.isArray(a.shops) ? a.shops[0] : a.shops;
                  const isFresh = !a.is_revoked && isHeartbeatFresh(a.last_heartbeat_at) && a.status === "online";

                  return [
                    <span className="font-semibold text-sm text-brand-950" key="name">
                      {a.name}
                    </span>,
                    <span className="text-xs font-medium" key="shop">
                      {shopData?.name || a.shop_id.slice(0, 8)}
                    </span>,
                    <Badge key="status" tone={a.is_revoked ? "danger" : isFresh ? "success" : "warning"}>
                      {a.is_revoked ? "REVOKED" : isFresh ? "ONLINE" : "OFFLINE"}
                    </Badge>,
                    <span className="text-xs" key="ver">
                      v{a.version || "1.0.0"}
                    </span>,
                    a.last_heartbeat_at ? new Date(a.last_heartbeat_at).toLocaleTimeString() : "—",
                    <span className="font-mono text-xs" key="job">
                      {a.current_job_id ? a.current_job_id.slice(0, 8) : "Idle"}
                    </span>,
                    new Date(a.created_at).toLocaleDateString(),
                  ];
                })}
              />
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-brand-950">Razorpay Payment Records</h2>
              <p className="mt-1 text-sm text-muted">Authoritative payment records tracked in Supabase.</p>
            </div>
            <Badge tone="success">{verifiedPayments.length} Verified</Badge>
          </div>

          <div className="mt-6 overflow-x-auto">
            {paymentList.length === 0 ? (
              <p className="text-sm text-muted py-4">No payment records created yet.</p>
            ) : (
              <Table
                headers={[
                  "Payment ID",
                  "Order ID",
                  "Amount",
                  "Status",
                  "Razorpay Payment ID",
                  "Verified At",
                  "Created",
                ]}
                rows={paymentList.map((p) => [
                  <span className="font-mono text-xs" key="p-id">
                    {p.id.slice(0, 8)}
                  </span>,
                  <span className="font-mono text-xs" key="order-id">
                    {p.order_id ? p.order_id.slice(0, 8) : "—"}
                  </span>,
                  `${p.currency} ${Number(p.amount).toFixed(2)}`,
                  <Badge
                    key="status"
                    tone={p.status === "verified" ? "success" : p.status === "failed" ? "danger" : "warning"}
                  >
                    {formatStatus(p.status)}
                  </Badge>,
                  <span className="font-mono text-xs" key="rzp-pay-id">
                    {p.provider_payment_id || "—"}
                  </span>,
                  p.verified_at ? new Date(p.verified_at).toLocaleString() : "—",
                  new Date(p.created_at).toLocaleString(),
                ])}
              />
            )}
          </div>
        </Card>

        {transactions && transactions.length > 0 ? (
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-brand-950">Audit Transaction Ledger</h2>
            <p className="mt-1 text-sm text-muted">
              Immutable event history of payment creation, signature verification, and webhooks.
            </p>
            <div className="mt-6 overflow-x-auto">
              <Table
                headers={["Event", "Order", "Amount", "Status", "Razorpay Reference", "Recorded At"]}
                rows={transactions.map((tx) => [
                  <span className="font-semibold text-xs text-brand-950" key="event">
                    {tx.event_type}
                  </span>,
                  <span className="font-mono text-xs" key="order">
                    {tx.order_id ? tx.order_id.slice(0, 8) : "—"}
                  </span>,
                  `${tx.currency} ${Number(tx.amount).toFixed(2)}`,
                  <Badge
                    key="status"
                    tone={tx.status === "verified" ? "success" : tx.status === "failed" ? "danger" : "warning"}
                  >
                    {formatStatus(tx.status)}
                  </Badge>,
                  <span className="font-mono text-xs text-muted" key="ref">
                    {tx.provider_payment_id || "—"}
                  </span>,
                  new Date(tx.created_at).toLocaleString(),
                ])}
              />
            </div>
          </Card>
        ) : null}
      </div>
    </PortalShell>
  );
}
