import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  MapPin,
  Package,
  Printer,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderId: string }> };

export async function generateMetadata({ params }: Props) {
  const { orderId } = await params;
  return {
    title: `Order #${orderId.slice(0, 8).toUpperCase()} — PrintSathi`,
    description: "View your print order details and real-time status.",
  };
}

export default async function OrderDetailPage({ params }: Props) {
  const { orderId } = await params;
  const user = await getCurrentUser();
  const client = await createSupabaseServerClient();

  if (!user || !client) return null; // layout handles redirect

  // Look up by public_id OR uuid — whichever matches
  const { data: order } = await client
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
        address,
        phone,
        email
      ),
      payments (
        id,
        status,
        provider,
        provider_payment_id,
        provider_order_id,
        payment_method,
        amount,
        verified_at,
        error_description
      ),
      print_jobs (
        id,
        status,
        failure_reason,
        total_pages,
        total_amount,
        printed_at,
        documents (
          id,
          original_filename,
          mime_type,
          page_count
        )
      )
    `)
    .eq("customer_id", user.id)   // 🔒 only this customer's orders
    .eq(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId) ? "id" : "public_id", orderId)
    .maybeSingle();

  if (!order) notFound();

  const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
  const shop = Array.isArray(order.shops) ? order.shops[0] : order.shops;
  const jobs = Array.isArray(order.print_jobs) ? order.print_jobs : [];
  const isVerified = (payment as { status?: string } | null)?.status === "verified";
  const isFailed = (payment as { status?: string } | null)?.status === "failed";
  const allPrinted = jobs.length > 0 && jobs.every((j) => j.status === "completed");
  const allSubmitted = jobs.length > 0 && jobs.every((j) => ["print_submitted", "completed"].includes(j.status));
  const anyFailed = jobs.some((j) => j.status === "failed");

  // Timeline steps
  const timeline = [
    {
      label: "Order created",
      done: true,
      time: new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
    },
    {
      label: "Payment verified",
      done: isVerified,
      failed: isFailed,
      time: isVerified
        ? new Date((payment as { verified_at: string }).verified_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
        : isFailed
          ? "Payment failed"
          : "Awaiting payment…",
    },
    {
      label: "Sent to printer",
      done: isVerified && allSubmitted,
      time: isVerified && allSubmitted ? "Dispatched by the Windows agent" : "Waiting for the Windows agent",
    },
    {
      label: "Printed & complete",
      done: allPrinted && isVerified,
      failed: anyFailed,
      time: allPrinted && isVerified
        ? jobs.find((j) => j.printed_at)
          ? new Date((jobs.find((j) => j.printed_at) as { printed_at: string }).printed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
          : "Completed"
        : anyFailed
          ? "Print encountered an issue"
          : "—",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Back */}
      <Link
        href="/customer"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-emerald-700 transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to my orders
      </Link>

      {/* Header card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-900 px-6 py-7 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Order #{order.public_id || order.id.slice(0, 8).toUpperCase()}
              </p>
              <h1 className="mt-1 text-2xl font-bold">
                {shop?.name || "PrintSathi Shop"}
              </h1>
              {shop?.address && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-300">
                  <MapPin className="size-3.5 shrink-0" />
                  {shop.address}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-3xl font-extrabold">₹{Number(order.total_amount).toFixed(2)}</p>
              <p className="text-sm text-slate-300">
                {order.total_pages} pages
                {order.color_pages ? ` · ${order.color_pages} color` : ""}
                {order.black_and_white_pages ? ` · ${order.black_and_white_pages} B&W` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Payment status banner */}
        <div
          className={`flex items-center gap-3 px-6 py-4 border-b border-slate-100 ${
            isVerified
              ? "bg-emerald-50"
              : isFailed
                ? "bg-red-50"
                : "bg-amber-50"
          }`}
        >
          {isVerified ? (
            <ShieldCheck className="size-5 shrink-0 text-emerald-600" />
          ) : isFailed ? (
            <XCircle className="size-5 shrink-0 text-red-600" />
          ) : (
            <Clock className="size-5 shrink-0 text-amber-600" />
          )}
          <div>
            <p
              className={`text-sm font-semibold ${
                isVerified ? "text-emerald-800" : isFailed ? "text-red-800" : "text-amber-800"
              }`}
            >
              {isVerified
                ? "Payment verified — your documents have been sent to print"
                : isFailed
                  ? "Payment was not completed"
                  : "Awaiting payment confirmation"}
            </p>
            {isVerified && (payment as { provider_payment_id?: string } | null)?.provider_payment_id && (
              <p className="text-xs text-emerald-600">
                Transaction ID: {(payment as { provider_payment_id: string }).provider_payment_id}
              </p>
            )}
            {isFailed && (payment as { error_description?: string } | null)?.error_description && (
              <p className="text-xs text-red-600">
                {(payment as { error_description: string }).error_description}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT — Documents & jobs */}
        <div className="space-y-5">
          <h2 className="text-base font-bold text-slate-900">Print jobs & documents</h2>
          {jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              No print jobs created yet for this order.
            </div>
          ) : (
            jobs.map((job) => {
              const jobDocs = Array.isArray(job.documents)
                ? job.documents
                : job.documents
                  ? [job.documents]
                  : [];
              const jobStatus =
                job.status === "completed"
                  ? { label: "Printed", color: "bg-emerald-100 text-emerald-800" }
                  : job.status === "failed"
                    ? { label: "Failed", color: "bg-red-100 text-red-800" }
                    : isVerified
                      ? { label: "Printing…", color: "bg-blue-100 text-blue-800" }
                      : { label: "Queued", color: "bg-slate-100 text-slate-600" };

              return (
                <div
                  key={job.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-slate-100">
                        <Printer className="size-4 text-slate-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            Job #{job.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${jobStatus.color}`}
                          >
                            {jobStatus.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {job.total_pages} pages · ₹{Number(job.total_amount).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    {job.status === "completed" && (
                      <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
                    )}
                    {job.status === "failed" && (
                      <XCircle className="size-5 text-red-500 shrink-0" />
                    )}
                  </div>

                  {/* Documents in this job */}
                  {jobDocs.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {jobDocs.map((doc) => (
                        <div
                          key={(doc as { id: string }).id}
                          className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                        >
                          <FileText className="size-3.5 shrink-0 text-slate-400" />
                          <span className="font-medium text-slate-700 truncate">
                            {(doc as { original_filename?: string }).original_filename || "Document"}
                          </span>
                          {(doc as { page_count?: number }).page_count && (
                            <span className="ml-auto shrink-0 text-slate-400">
                              {(doc as { page_count: number }).page_count} pages
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {job.failure_reason && (
                    <p className="mt-2 text-xs text-red-600">
                      Issue: {job.failure_reason}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT — Timeline + payment details */}
        <div className="space-y-5">
          {/* Order timeline */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Order timeline</h2>
            <ol className="mt-4 space-y-0">
              {timeline.map((step, i) => (
                <li key={step.label} className="flex gap-3">
                  {/* Line + dot */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex size-7 items-center justify-center rounded-full border-2 shrink-0 ${
                        step.failed
                          ? "border-red-400 bg-red-50"
                          : step.done
                            ? "border-emerald-400 bg-emerald-50"
                            : "border-slate-200 bg-white"
                      }`}
                    >
                      {step.failed ? (
                        <XCircle className="size-3.5 text-red-500" />
                      ) : step.done ? (
                        <CheckCircle2 className="size-3.5 text-emerald-500" />
                      ) : (
                        <Clock className="size-3.5 text-slate-300" />
                      )}
                    </div>
                    {i < timeline.length - 1 && (
                      <div
                        className={`w-0.5 flex-1 my-1 ${
                          step.done ? "bg-emerald-200" : "bg-slate-100"
                        }`}
                        style={{ minHeight: 20 }}
                      />
                    )}
                  </div>
                  {/* Content */}
                  <div className="pb-4">
                    <p
                      className={`text-sm font-medium ${
                        step.failed
                          ? "text-red-700"
                          : step.done
                            ? "text-slate-900"
                            : "text-slate-400"
                      }`}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-slate-400">{step.time}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Payment receipt */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="size-4 text-slate-500" />
              <h2 className="text-sm font-bold text-slate-900">Payment receipt</h2>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Amount</dt>
                <dd className="font-semibold text-slate-900">₹{Number(order.total_amount).toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Status</dt>
                <dd className={isVerified ? "font-semibold text-emerald-700" : isFailed ? "font-semibold text-red-600" : "text-slate-500"}>
                  {isVerified ? "Verified" : isFailed ? "Failed" : "Pending"}
                </dd>
              </div>
              {isVerified && (payment as { provider_payment_id?: string } | null)?.provider_payment_id && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Transaction ID</dt>
                  <dd className="font-mono text-xs text-slate-700 break-all text-right max-w-[160px]">
                    {(payment as { provider_payment_id: string }).provider_payment_id}
                  </dd>
                </div>
              )}
              {(payment as { payment_method?: string } | null)?.payment_method && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Method</dt>
                  <dd className="text-slate-700 capitalize">
                    {(payment as { payment_method: string }).payment_method}
                  </dd>
                </div>
              )}
              {isVerified && (payment as { verified_at?: string } | null)?.verified_at && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Verified at</dt>
                  <dd className="text-slate-700 text-xs">
                    {new Date((payment as { verified_at: string }).verified_at).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Shop contact — only public-safe info */}
          {shop && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Package className="size-4 text-slate-500" />
                <h2 className="text-sm font-bold text-slate-900">Shop</h2>
              </div>
              <p className="font-semibold text-slate-900">{shop.name}</p>
              {shop.address && (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
                  <MapPin className="size-3.5 mt-0.5 shrink-0" />
                  {shop.address}
                </p>
              )}
              {shop.phone && (
                <p className="mt-1 text-xs text-slate-500">📞 {shop.phone}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
