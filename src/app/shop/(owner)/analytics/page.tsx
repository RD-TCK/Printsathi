import { getShopContext } from "@/lib/shop-portal";
import { ShopPageHeader, MetricCard, ComingSoon } from "@/components/shop-page";
import { Alert } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

export default async function ShopAnalyticsPage() {
  const context = await getShopContext();
  if (!context) return <Alert tone="error">Shop workspace unavailable.</Alert>;
  const { data: summaries, error } = await context.client
    .from("order_summary")
    .select(
      "status, total_amount, document_count, print_job_count, total_pages, color_pages, black_and_white_pages, created_at",
    )
    .eq("shop_id", context.shop.id);
  const rows = summaries ?? [];
  const totals = rows.reduce(
    (total, row) => ({
      orders: total.orders + 1,
      documents: total.documents + Number(row.document_count || 0),
      jobs: total.jobs + Number(row.print_job_count || 0),
      pages: total.pages + Number(row.total_pages || 0),
      color: total.color + Number(row.color_pages || 0),
      bw: total.bw + Number(row.black_and_white_pages || 0),
      revenue: total.revenue + Number(row.total_amount || 0),
    }),
    { orders: 0, documents: 0, jobs: 0, pages: 0, color: 0, bw: 0, revenue: 0 },
  );
  return (
    <div className="space-y-8">
      <ShopPageHeader
        eyebrow="Performance"
        title="Analytics"
        description="These metrics aggregate the order summary view. No charts or values are invented when the shop has no records."
      />
      {error ? (
        <Alert tone="warning" title="Analytics view unavailable">
          The order summary view is not available in this environment yet.
        </Alert>
      ) : rows.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Orders" value={String(totals.orders)} detail="Recorded orders" />
            <MetricCard label="Documents" value={String(totals.documents)} detail="Across all orders" />
            <MetricCard label="Print jobs" value={String(totals.jobs)} detail={`${totals.pages} total pages`} />
            <MetricCard label="Revenue" value={`₹${totals.revenue.toFixed(2)}`} detail="Recorded order totals" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard label="Color pages" value={String(totals.color)} detail="From configured ranges" />
            <MetricCard label="B&W pages" value={String(totals.bw)} detail="From configured ranges" />
          </div>
        </>
      ) : (
        <ComingSoon
          title="No printing activity yet"
          description="Daily and monthly printing analytics will appear once verified orders and print jobs exist."
        />
      )}
    </div>
  );
}
