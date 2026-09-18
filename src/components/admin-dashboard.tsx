"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Search, Store } from "lucide-react";
import type { AdminData } from "@/lib/admin-data";
import { summarizeJobs, agentOnline } from "@/lib/admin-metrics";
import {
  effectiveBillingMode,
  hasSubscriptionAccess,
  subscriptionEnd,
  subscriptionWarningDays,
} from "@/lib/subscription";
import { MetricCard } from "@/components/shop-page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import { Alert } from "@/components/ui/alert";

const money = (value: number | string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value));
const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Not recorded";
function status(value: string) {
  const tone = ["completed", "verified", "active", "online"].includes(value)
    ? "success"
    : ["failed", "expired", "revoked"].includes(value)
      ? "danger"
      : "warning";
  return <Badge tone={tone}>{value.replaceAll("_", " ")}</Badge>;
}
const tabs = ["Shops", "Jobs", "Orders", "Payments", "Subscriptions", "Devices", "Payment events"] as const;

function Records({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  const [page, setPage] = useState(0);
  const lastPage = Math.max(0, Math.ceil(rows.length / 20) - 1);
  const currentPage = Math.min(page, lastPage);
  if (!rows.length)
    return (
      <p className="rounded-xl border border-dashed border-line p-10 text-center text-muted">
        No records match these filters.
      </p>
    );
  return (
    <div className="space-y-3">
      <Table headers={headers} rows={rows.slice(currentPage * 20, (currentPage + 1) * 20)} />
      <div className="flex items-center justify-between gap-3 text-sm text-muted">
        <span>
          {rows.length} records · Page {currentPage + 1} of {lastPage + 1}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPage === lastPage}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AdminDashboard({ data }: { data: AdminData }) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [automatic, setAutomatic] = useState(true);
  const [shopId, setShopId] = useState("");
  const [search, setSearch] = useState("");
  const [days, setDays] = useState("30");
  const [tab, setTab] = useState<(typeof tabs)[number]>("Shops");
  const [jobStatus, setJobStatus] = useState("");
  useEffect(() => {
    if (!automatic) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !refreshing) startTransition(() => router.refresh());
    }, 15000);
    return () => clearInterval(timer);
  }, [automatic, refreshing, router]);

  const now = Date.parse(data.refreshedAt);
  const since = days === "all" ? 0 : now - Number(days) * 86400000;
  const inPeriod = (row: { created_at: string }) => Date.parse(row.created_at) >= since;
  const query = search.trim().toLowerCase();
  const shops = data.shops.filter(
    (shop) =>
      (!shopId || shop.id === shopId) &&
      [shop.name, shop.public_id, shop.email, shop.phone, shop.address].some((value) =>
        value?.toLowerCase().includes(query),
      ),
  );
  const ids = new Set(shops.map((shop) => shop.id));
  const names = new Map(data.shops.map((shop) => [shop.id, shop.name]));
  const orderShops = new Map(data.orders.map((order) => [order.id, order.shop_id]));
  const jobShops = new Map(data.jobs.map((job) => [job.id, job.shop_id]));
  const paymentShop = (payment: AdminData["payments"][number]) =>
    orderShops.get(payment.order_id) || jobShops.get(payment.print_job_id);
  const paymentShops = new Map(data.payments.map((payment) => [payment.id, paymentShop(payment)]));
  const eventShop = (event: AdminData["transactions"][number]) =>
    orderShops.get(event.order_id) || paymentShops.get(event.payment_id);
  const matchesShop = (id: string | undefined) => (!shopId && !query) || ids.has(id || "");

  const shopName = (id: string | null | undefined) => names.get(id || "") || "Unknown shop";
  const selected = data.shops.find((shop) => shop.id === shopId);
  const jobs = data.jobs.filter((job) => ids.has(job.shop_id) && inPeriod(job));
  const orders = data.orders.filter((order) => ids.has(order.shop_id) && inPeriod(order));
  const payments = data.payments.filter((payment) => matchesShop(paymentShop(payment)) && inPeriod(payment));
  const agents = data.agents.filter((agent) => ids.has(agent.shop_id));
  const printers = data.printers.filter((printer) => ids.has(printer.shop_id));
  const online = agents.filter((agent) => agentOnline(agent, now));
  const onlineIds = new Set(online.map((agent) => agent.id));
  const printerOnline = (printer: AdminData["printers"][number]) =>
    onlineIds.has(printer.desktop_agent_id) &&
    now - Date.parse(printer.last_seen_at || "") >= 0 &&
    now - Date.parse(printer.last_seen_at || "") < 30000 &&
    ["online", "printing"].includes(printer.status) &&
    !/onenote|pdf|xps|fax/i.test(printer.name);
  const summary = summarizeJobs(jobs);
  const verified = payments.filter((payment) => payment.status === "verified");
  const expiring = data.subscriptions.filter(
    (sub) => ids.has(sub.shop_id) && subscriptionWarningDays(sub, now) !== null,
  );
  const subscriptionPayments = data.subscriptionPayments.filter(
    (payment) => ids.has(payment.shop_id) && inPeriod(payment),
  );
  const transactions = data.transactions.filter((event) => matchesShop(eventShop(event)) && inPeriod(event));
  const recent = <T extends { created_at: string }>(rows: T[]) =>
    [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const filterKey = `${shopId}-${search}-${days}-${jobStatus}`;
  const control = "rounded-lg border border-line bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 text-xs font-semibold text-muted">
            Find a shop
            <div className="relative mt-1">
              <Search className="absolute left-3 top-2.5 size-4" />
              <input
                className={`${control} w-full pl-9`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, email, phone or address"
              />
            </div>
          </label>
          <label className="text-xs font-semibold text-muted">
            Shop
            <select
              className={`${control} mt-1 block max-w-64`}
              value={shopId}
              onChange={(event) => setShopId(event.target.value)}
            >
              <option value="">All shops</option>
              {data.shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Activity period
            <select className={`${control} mt-1 block`} value={days} onChange={(event) => setDays(event.target.value)}>
              <option value="1">Last 24 hours</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </label>
          <Button variant="secondary" disabled={refreshing} onClick={() => startTransition(() => router.refresh())}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted">
          <span>
            Updated {date(data.refreshedAt)} IST · Activity uses creation dates; shop and device status is current.
          </span>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={automatic} onChange={(event) => setAutomatic(event.target.checked)} />
            Refresh every 15 seconds
          </label>
        </div>
      </Card>

      {selected && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-brand-200 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Store className="size-5" />
              {selected.name}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {[selected.email, selected.phone, selected.address].filter(Boolean).join(" · ") ||
                "No contact details recorded"}
            </p>
            <p className="mt-1 text-xs text-muted">Joined {date(selected.created_at)} IST</p>
          </div>
          <Link
            href={`/shop/${selected.public_id}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-brand-700 underline"
          >
            Open customer page
          </Link>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Shops"
          value={String(shops.length)}
          detail={`${shops.filter((shop) => shop.is_active).length} active · ${online.length} agents online`}
        />
        <MetricCard
          label="Successful jobs"
          value={String(summary.completed)}
          detail={`${summary.pages} pages printed successfully`}
          tone="success"
        />
        <MetricCard
          label="Successful print revenue"
          value={money(summary.revenue)}
          detail="Completed job totals only"
        />
        <MetricCard
          label="Failed prints"
          value={String(summary.failed)}
          detail={`${summary.pending} paid jobs waiting or in progress`}
          tone={summary.failed ? "warning" : "success"}
        />
        <MetricCard
          label="Customer payments collected"
          value={money(verified.reduce((sum, payment) => sum + Number(payment.amount), 0))}
          detail={`${verified.length} verified payments · distinct from print revenue`}
        />
        <MetricCard
          label="Subscription sales"
          value={money(
            subscriptionPayments.reduce((sum, payment) => sum + (payment.plan === "monthly" ? 699 : 7499), 0),
          )}
          detail={`${subscriptionPayments.length} activated purchases at current plan prices`}
        />
        <MetricCard
          label="Connected printers"
          value={String(printers.filter(printerOnline).length)}
          detail={`${printers.length} registered · live agent and printer heartbeat required`}
        />
        <MetricCard
          label="Orders"
          value={String(orders.length)}
          detail={`${payments.filter((payment) => payment.status === "failed").length} failed payments`}
        />
      </div>
      {expiring.length > 0 && (
        <Alert tone="warning" title="Subscriptions ending soon">
          {expiring.length} shop subscriptions expire within seven days. Review the Subscriptions tab.
        </Alert>
      )}

      <div className="flex flex-wrap gap-2 border-b border-line pb-3" role="group" aria-label="Monitoring views">
        {tabs.map((item) => (
          <button
            key={item}
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === item ? "bg-brand-700 text-white" : "bg-white text-muted hover:bg-brand-50"}`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Shops" && (
        <Records
          key={`shops-${filterKey}`}
          headers={[
            "Shop",
            "Availability",
            "Billing",
            "Successful jobs / pages",
            "Print revenue",
            "Failed / pending",
            "Devices",
          ]}
          rows={shops.map((shop) => {
            const stats = summarizeJobs(jobs.filter((job) => job.shop_id === shop.id));
            const settings = data.settings.find((setting) => setting.shop_id === shop.id);
            const sub = data.subscriptions.find((subscription) => subscription.shop_id === shop.id);
            return [
              <button
                key="shop"
                className="text-left font-semibold text-brand-700 underline"
                onClick={() => {
                  setShopId(shop.id);
                  setSearch("");
                }}
              >
                {shop.name}
              </button>,
              status(shop.is_active && settings?.accepting_orders ? "active" : "paused"),
              effectiveBillingMode(settings?.billing_mode, sub, now) === "shop_subscription"
                ? "Shop subscription"
                : "Take from Customer",
              `${stats.completed} jobs / ${stats.pages} pages`,
              money(stats.revenue),
              `${stats.failed} / ${stats.pending}`,
              `${online.filter((agent) => agent.shop_id === shop.id).length} agents · ${printers.filter((printer) => printer.shop_id === shop.id && printerOnline(printer)).length} printers online`,
            ];
          })}
        />
      )}

      {tab === "Jobs" && (
        <div className="space-y-4">
          <label className="text-sm">
            Job status{" "}
            <select className={control} value={jobStatus} onChange={(event) => setJobStatus(event.target.value)}>
              <option value="">All statuses</option>
              {[
                "completed",
                "failed",
                "print_submitted",
                "printing",
                "queued",
                "claimed",
                "paid",
                "awaiting_payment",
                "draft",
                "cancelled",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <Records
            key={`jobs-${filterKey}`}
            headers={["Job", "Shop", "Status", "Selected pages", "Amount", "Failure reason", "Created (IST)"]}
            rows={recent(jobs)
              .filter((job) => !jobStatus || job.status === jobStatus)
              .map((job) => [
                job.id,
                shopName(job.shop_id),
                status(job.status),
                job.print_job_pages.reduce((sum, range) => sum + range.end_page - range.start_page + 1, 0),
                money(job.total_amount),
                job.failure_reason || "—",
                date(job.created_at),
              ])}
          />
        </div>
      )}
      {tab === "Orders" && (
        <Records
          key={`orders-${filterKey}`}
          headers={["Order", "Shop", "Status", "Amount", "Created (IST)"]}
          rows={recent(orders).map((order) => [
            order.public_id,
            shopName(order.shop_id),
            status(order.status),
            money(order.total_amount),
            date(order.created_at),
          ])}
        />
      )}
      {tab === "Payments" && (
        <Records
          key={`payments-${filterKey}`}
          headers={["Payment", "Shop", "Status", "Amount", "Razorpay reference", "Error", "Created (IST)"]}
          rows={recent(payments).map((payment) => [
            payment.id,
            shopName(paymentShop(payment)),
            status(payment.status),
            `${payment.currency} ${Number(payment.amount).toFixed(2)}`,
            payment.provider_payment_id || "—",
            payment.error_description || "—",
            date(payment.created_at),
          ])}
        />
      )}

      {tab === "Subscriptions" && (
        <div className="space-y-6">
          <Records
            key={`subscriptions-${filterKey}`}
            headers={["Shop", "Plan state", "Effective billing", "Expiry (IST)", "Warning"]}
            rows={shops.map((shop) => {
              const sub = data.subscriptions.find((subscription) => subscription.shop_id === shop.id);
              const settings = data.settings.find((setting) => setting.shop_id === shop.id);
              const warning = subscriptionWarningDays(sub, now);
              return [
                shop.name,
                status(hasSubscriptionAccess(sub, now) ? sub!.status : "expired"),
                effectiveBillingMode(settings?.billing_mode, sub, now) === "shop_subscription"
                  ? "Shop subscription"
                  : "Take from Customer",
                date(subscriptionEnd(sub)),
                warning === null ? "—" : `${warning} days left`,
              ];
            })}
          />
          <h2 className="text-lg font-semibold">Subscription payment history</h2>
          <Records
            key={`subscription-payments-${filterKey}`}
            headers={["Shop", "Plan", "Payment ID", "Period end (IST)", "Purchased (IST)"]}
            rows={recent(subscriptionPayments).map((payment) => [
              shopName(payment.shop_id),
              payment.plan,
              payment.payment_id,
              date(payment.period_end),
              date(payment.created_at),
            ])}
          />
        </div>
      )}

      {tab === "Devices" && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold">Desktop agents</h2>
          <Records
            key={`agents-${filterKey}`}
            headers={["Agent", "Shop", "Status", "Version", "Last heartbeat (IST)", "Current job", "Last error"]}
            rows={agents.map((agent) => [
              agent.name,
              shopName(agent.shop_id),
              status(agent.is_revoked ? "revoked" : agentOnline(agent, now) ? "online" : "offline"),
              agent.version || "—",
              date(agent.last_heartbeat_at),
              agent.current_job_id || "Idle",
              agent.last_error || "—",
            ])}
          />
          <h2 className="text-lg font-semibold">Printers</h2>
          <Records
            key={`printers-${filterKey}`}
            headers={["Printer", "Shop", "Connection", "Reported status", "Driver", "Last seen (IST)"]}
            rows={printers.map((printer) => [
              printer.name,
              shopName(printer.shop_id),
              status(printerOnline(printer) ? "online" : "offline"),
              printer.status,
              printer.driver_name || "—",
              date(printer.last_seen_at),
            ])}
          />
        </div>
      )}
      {tab === "Payment events" && (
        <Records
          key={`events-${filterKey}`}
          headers={["Event", "Shop", "Order", "Status", "Amount", "Razorpay reference", "Recorded (IST)"]}
          rows={recent(transactions).map((event) => [
            event.event_type,
            shopName(eventShop(event)),
            event.order_id || "—",
            status(event.status),
            `${event.currency} ${Number(event.amount).toFixed(2)}`,
            event.provider_payment_id || "—",
            date(event.created_at),
          ])}
        />
      )}
    </div>
  );
}
