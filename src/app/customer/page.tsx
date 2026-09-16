import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Package,
  Printer,
  QrCode,
  XCircle,
} from "lucide-react";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Print Orders — PrintSathi Customer Portal",
  description: "View and track all your print orders from PrintSathi shops.",
};

function statusMeta(orderStatus: string, paymentStatus?: string, anyJobFailed?: boolean) {
  if (paymentStatus === "verified" && orderStatus === "completed") {
    return { label: "Printed ✓", color: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500", icon: CheckCircle2 };
  }
  if (paymentStatus === "verified" && anyJobFailed) {
    return { label: "Print issue", color: "bg-amber-100 text-amber-800", dot: "bg-amber-500", icon: XCircle };
  }
  if (paymentStatus === "verified") {
    return { label: "Printing…", color: "bg-blue-100 text-blue-800", dot: "bg-blue-500 animate-pulse", icon: Printer };
  }
  if (paymentStatus === "failed") {
    return { label: "Payment failed", color: "bg-red-100 text-red-800", dot: "bg-red-500", icon: XCircle };
  }
  return { label: "Awaiting payment", color: "bg-slate-100 text-slate-600", dot: "bg-slate-400", icon: Clock };
}

export default async function MyOrdersPage() {
  const user = await getCurrentUser();
  const client = await createSupabaseServerClient();

  if (!user || !client) return null; // layout handles redirect

  const { data: orders } = await client
    .from("orders")
    .select(`
      id,
      public_id,
      status,
      total_amount,
      currency,
      total_pages,
      color_pages,
      black_and_white_pages,
      created_at,
      shops (
        id,
        name,
        public_id,
        address
      ),
      payments (
        id,
        status,
        provider,
        provider_payment_id,
        amount,
        verified_at
      ),
      print_jobs (
        id,
        status,
        total_pages,
        documents (
          id,
          original_filename
        )
      )
    `)
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const orderList = orders ?? [];

  // Stats
  const totalSpent = orderList
    .filter((o) => {
      const p = Array.isArray(o.payments) ? o.payments[0] : o.payments;
      return (p as { status?: string } | null)?.status === "verified";
    })
    .reduce((sum, o) => sum + Number(o.total_amount), 0);

  const printedCount = orderList.filter((o) => o.status === "completed").length;
  const pendingCount = orderList.filter((o) => o.status !== "completed" && o.status !== "cancelled").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
          Customer Portal
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">My Print Orders</h1>
        <p className="mt-1 text-sm text-slate-500">
          All your print orders from PrintSathi shops — payments, status, and documents.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total orders", value: orderList.length, sub: "all time" },
          { label: "Printed", value: printedCount, sub: "completed" },
          { label: "Pending", value: pendingCount, sub: "in progress" },
          { label: "Total spent", value: `₹${totalSpent.toFixed(0)}`, sub: "verified payments" },
        ].map(({ label, value, sub }) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-[11px] text-slate-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* Orders list */}
      {orderList.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-20 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-emerald-50">
            <QrCode className="size-8 text-emerald-600" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-slate-900">No print orders yet</h2>
          <p className="mt-2 max-w-xs text-sm text-slate-500">
            Scan a QR code at any PrintSathi shop to upload your documents and print instantly.
          </p>
          <Link
            href="/shops"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <Printer className="size-4" />
            Find a shop
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orderList.map((order) => {
            const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
            const shop = Array.isArray(order.shops) ? order.shops[0] : order.shops;
            const jobs = Array.isArray(order.print_jobs) ? order.print_jobs : [];
            const anyFailed = jobs.some((j) => j.status === "failed");
            const paymentStatus = (payment as { status?: string } | null)?.status;
            const status = statusMeta(order.status, paymentStatus, anyFailed);
            const docs = jobs.flatMap((j) => Array.isArray(j.documents) ? j.documents : j.documents ? [j.documents] : []);

            return (
              <Link
                key={order.id}
                href={`/customer/orders/${order.public_id || order.id}`}
                className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-emerald-50">
                      <Package className="size-4 text-slate-500 group-hover:text-emerald-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          #{order.public_id || order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.color}`}
                        >
                          <span className={`size-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {shop?.name || "PrintSathi Shop"}
                        {shop?.address ? ` · ${shop.address}` : ""}
                      </p>
                      {docs.slice(0, 2).map((doc) => (
                        <p key={(doc as { id: string }).id} className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                          <FileText className="size-3" />
                          {(doc as { original_filename?: string }).original_filename || "Document"}
                        </p>
                      ))}
                      {docs.length > 2 && (
                        <p className="text-xs text-slate-400">+{docs.length - 2} more files</p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900">
                      ₹{Number(order.total_amount).toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {order.total_pages} pages
                      {order.color_pages ? ` · ${order.color_pages} color` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {new Date(order.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>

                {/* Payment receipt strip */}
                {paymentStatus === "verified" && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    <CreditCard className="size-3.5 shrink-0" />
                    <span className="font-medium">
                      Payment verified
                      {(payment as { provider_payment_id?: string } | null)?.provider_payment_id
                        ? ` · Txn: ${(payment as { provider_payment_id: string }).provider_payment_id}`
                        : ""}
                    </span>
                  </div>
                )}
                {paymentStatus === "failed" && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    <XCircle className="size-3.5 shrink-0" />
                    <span className="font-medium">Payment was not completed</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Scan CTA */}
      {orderList.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-3">
            <QrCode className="size-8 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-900">Need to print something new?</p>
              <p className="text-sm text-emerald-700">
                Scan a QR code at any PrintSathi shop to start a new order.
              </p>
            </div>
          </div>
          <Link
            href="/shops"
            className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <Printer className="size-4" />
            Find a shop
          </Link>
        </div>
      )}
    </div>
  );
}
