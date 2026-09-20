import { getShopContext, formatStatus } from "@/lib/shop-portal";
import { ShopPageHeader, ComingSoon } from "@/components/shop-page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import { WebAutoPrintStation, WebPrintButton } from "@/components/web-auto-print";
import { FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ShopJobsPage() {
  const context = await getShopContext();
  if (!context) return <Alert tone="error">Shop workspace unavailable.</Alert>;
  const { data: jobs, error } = await context.client
    .from("print_jobs")
    .select(
      `
      id,
      order_id,
      document_id,
      status,
      total_pages,
      total_amount,
      currency,
      failure_reason,
      created_at,
      documents (
        id,
        original_filename,
        page_count
      ),
      orders (
        id,
        public_id,
        status,
        token_number,
        payment_mode,
        payments (
          id,
          status,
          provider_payment_id,
          payment_method,
          verified_at
        )
      )
    `,
    )
    .eq("shop_id", context.shop.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-8">
      <ShopPageHeader
        eyebrow="Operations"
        title="Print jobs"
        description="Monitor paid jobs picked up by the Windows agent. Confirm completion only after checking the printed pages."
      />

      {/* Zero-Touch Web Auto-Print Station */}
      <WebAutoPrintStation shopName={context.shop.name} />

      {error ? (
        <Alert tone="error" title="Could not load jobs">
          Supabase did not return the shop job queue.
        </Alert>
      ) : jobs?.length ? (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <Table
            headers={[
              "Job ID / Token",
              "Document & Pages",
              "Amount",
              "Payment",
              "Print Status",
              "Web Print Action",
              "Created",
            ]}
            rows={jobs.map((job) => {
              const order = Array.isArray(job.orders) ? job.orders[0] : job.orders;
              const payment = Array.isArray(order?.payments) ? order?.payments[0] : order?.payments;
              const doc = Array.isArray(job.documents) ? job.documents[0] : job.documents;
              const isVerified = payment?.status === "verified";

              let paymentBadgeTone: "success" | "warning" | "danger" = "warning";
              let paymentLabel = "Awaiting Payment";

              if (isVerified) {
                paymentBadgeTone = "success";
                paymentLabel = order?.payment_mode === "counter" ? "PAID (COUNTER)" : "PAID (VERIFIED)";
              } else if (payment?.status === "failed") {
                paymentBadgeTone = "danger";
                paymentLabel = "FAILED";
              }

              const docName = doc?.original_filename || `Document #${job.document_id?.slice(0, 6) || "1"}`;
              const pageCount = (doc as { page_count?: number } | null)?.page_count ?? job.total_pages;

              return [
                <div key="job" className="flex flex-col gap-1">
                  <span className="font-mono text-xs">#{job.id.slice(0, 8)}</span>
                  {order?.token_number ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded w-fit">
                      Token #{order.token_number}
                    </span>
                  ) : null}
                </div>,
                <div key="doc" className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <FileText className="size-3.5 shrink-0 text-brand-500" />
                    <span
                      className="block max-w-40 truncate text-xs font-semibold text-brand-900"
                      title={docName}
                    >
                      {docName}
                    </span>
                  </div>
                  <span className="mt-0.5 inline-flex items-center rounded bg-brand-50 border border-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                    {pageCount} pages
                  </span>
                </div>,
                `₹${Number(job.total_amount).toFixed(2)}`,
                <Badge key="payment" tone={paymentBadgeTone}>
                  {paymentLabel}
                </Badge>,
                <Badge
                  key="status"
                  tone={
                    job.status === "completed"
                      ? "success"
                      : job.status === "failed"
                        ? "danger"
                        : isVerified
                          ? "success"
                          : "warning"
                  }
                >
                  {job.status === "completed" ? "PRINTED" : job.status === "failed" ? "Failed (Retryable)" : formatStatus(job.status)}
                </Badge>,
                <WebPrintButton
                  key="action"
                  jobId={job.id}
                  documentName={doc?.original_filename || "Document.pdf"}
                  status={job.status}
                />,
                new Date(job.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              ];
            })}
          />
        </div>
      ) : (
        <ComingSoon
          title="No printing activity yet"
          description="Jobs will appear here as customers configure and complete verified payments."
        />
      )}
    </div>
  );
}
