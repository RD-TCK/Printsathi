import { getShopContext, getISTDateString, formatISTDateTime } from "@/lib/shop-portal";
import { ShopPageHeader, MetricCard, ComingSoon } from "@/components/shop-page";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Calendar,
  Layers,
  FileCheck2,
  Trash2,
  Coins,
  IndianRupee,
  Clock,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

type JobPage = {
  color_mode?: "color" | "black_and_white";
  start_page: number;
  end_page: number;
  copies?: number;
};

type JobItem = {
  id: string;
  order_id: string | null;
  status: string;
  total_pages: number;
  total_amount: number;
  currency: string;
  failure_reason: string | null;
  created_at: string;
  print_job_pages: JobPage[];
};

type OrderItem = {
  id: string;
  public_id: string;
  status: string;
  total_amount: number;
  total_pages: number;
  color_pages: number;
  black_and_white_pages: number;
  payment_mode: string | null;
  created_at: string;
  payments?: Array<{ status: string; verified_at: string | null }>;
};

export default async function ShopAnalyticsPage() {
  const context = await getShopContext();
  if (!context) return <Alert tone="error">Shop workspace unavailable.</Alert>;

  // Fetch print jobs and orders in parallel
  const [jobsRes, ordersRes] = await Promise.all([
    context.client
      .from("print_jobs")
      .select(
        `
        id,
        order_id,
        status,
        total_pages,
        total_amount,
        currency,
        failure_reason,
        created_at,
        print_job_pages (
          color_mode,
          start_page,
          end_page,
          copies
        )
      `,
      )
      .eq("shop_id", context.shop.id)
      .order("created_at", { ascending: false }),
    context.client
      .from("orders")
      .select(
        `
        id,
        public_id,
        status,
        total_amount,
        total_pages,
        color_pages,
        black_and_white_pages,
        payment_mode,
        created_at,
        payments (
          status,
          verified_at
        )
      `,
      )
      .eq("shop_id", context.shop.id)
      .order("created_at", { ascending: false }),
  ]);

  const rawJobs: JobItem[] = (jobsRes.data as unknown as JobItem[]) ?? [];
  const rawOrders: OrderItem[] = (ordersRes.data as unknown as OrderItem[]) ?? [];

  const todayIST = getISTDateString(new Date());

  // Generate last 7 days list in IST (from 6 days ago up to today)
  const last7Days: Array<{
    dateStr: string;
    dayLabel: string;
    shortDay: string;
    isToday: boolean;
  }> = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = getISTDateString(d);
    const isToday = i === 0 || dateStr === todayIST;
    const dayLabel = d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
    });
    const shortDay = isToday
      ? "Today"
      : d.toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          weekday: "short",
        });
    last7Days.push({ dateStr, dayLabel, shortDay, isToday });
  }

  // Filter and process jobs
  // A job is EARNED only when completed
  // A job is DISCARDED / MISPRINT when failed/cancelled with reject/discard/misprint or explicitly failed
  const completedJobs = rawJobs.filter((j) => j.status === "completed");
  const discardedJobs = rawJobs.filter(
    (j) =>
      j.status === "failed" ||
      j.status === "cancelled" ||
      Boolean(j.failure_reason && /discard|reject|misprint|defective/i.test(j.failure_reason)),
  );

  // Group stats by IST date
  type DayBucket = {
    revenue: number;
    completedJobs: number;
    completedOrders: Set<string>;
    totalPages: number;
    colorPages: number;
    bwPages: number;
    discardedCount: number;
    discardedAmount: number;
  };

  const dailyBuckets = new Map<string, DayBucket>();

  const getBucket = (dateStr: string): DayBucket => {
    if (!dailyBuckets.has(dateStr)) {
      dailyBuckets.set(dateStr, {
        revenue: 0,
        completedJobs: 0,
        completedOrders: new Set(),
        totalPages: 0,
        colorPages: 0,
        bwPages: 0,
        discardedCount: 0,
        discardedAmount: 0,
      });
    }
    return dailyBuckets.get(dateStr)!;
  };

  // Populate completed jobs into buckets
  for (const job of completedJobs) {
    const dateStr = getISTDateString(job.created_at);
    const bucket = getBucket(dateStr);
    bucket.revenue += Number(job.total_amount || 0);
    bucket.completedJobs += 1;
    if (job.order_id) bucket.completedOrders.add(job.order_id);

    // Calculate pages breakdown
    const pages = Array.isArray(job.print_job_pages) ? job.print_job_pages : [];
    let jobColor = 0;
    let jobBw = 0;
    for (const p of pages) {
      const count = (p.end_page - p.start_page + 1) * (p.copies ?? 1);
      if (p.color_mode === "color") {
        jobColor += count;
      } else {
        jobBw += count;
      }
    }
    const totalJobPages = jobColor + jobBw || Number(job.total_pages || 0);
    bucket.totalPages += totalJobPages;
    bucket.colorPages += jobColor;
    bucket.bwPages += jobBw;
  }

  // Populate discarded/rejected jobs
  for (const job of discardedJobs) {
    const dateStr = getISTDateString(job.created_at);
    const bucket = getBucket(dateStr);
    bucket.discardedCount += 1;
    bucket.discardedAmount += Number(job.total_amount || 0);
  }

  // Today's Stats
  const todayBucket = dailyBuckets.get(todayIST) || {
    revenue: 0,
    completedJobs: 0,
    completedOrders: new Set(),
    totalPages: 0,
    colorPages: 0,
    bwPages: 0,
    discardedCount: 0,
    discardedAmount: 0,
  };

  const todayRevenue = todayBucket.revenue;
  const todayOrdersCount = todayBucket.completedOrders.size || todayBucket.completedJobs;
  const todayPages = todayBucket.totalPages;
  const todayColor = todayBucket.colorPages;
  const todayBw = todayBucket.bwPages;
  const todayDiscardedCount = todayBucket.discardedCount;
  const todayDiscardedAmount = todayBucket.discardedAmount;
  const todayAOV = todayOrdersCount > 0 ? todayRevenue / todayOrdersCount : 0;

  // Weekly Stats (Sum across last 7 days)
  let weeklyRevenue = 0;
  let weeklyJobs = 0;
  let weeklyOrdersSet = new Set<string>();
  let weeklyPages = 0;
  let weeklyColor = 0;
  let weeklyBw = 0;
  let weeklyDiscardedCount = 0;
  let weeklyDiscardedAmount = 0;

  const weeklyBreakdown = last7Days.map((day) => {
    const b = dailyBuckets.get(day.dateStr) || {
      revenue: 0,
      completedJobs: 0,
      completedOrders: new Set(),
      totalPages: 0,
      colorPages: 0,
      bwPages: 0,
      discardedCount: 0,
      discardedAmount: 0,
    };

    weeklyRevenue += b.revenue;
    weeklyJobs += b.completedJobs;
    b.completedOrders.forEach((o) => weeklyOrdersSet.add(o));
    weeklyPages += b.totalPages;
    weeklyColor += b.colorPages;
    weeklyBw += b.bwPages;
    weeklyDiscardedCount += b.discardedCount;
    weeklyDiscardedAmount += b.discardedAmount;

    return {
      ...day,
      revenue: b.revenue,
      ordersCount: b.completedOrders.size || b.completedJobs,
      totalPages: b.totalPages,
      colorPages: b.colorPages,
      bwPages: b.bwPages,
      discardedCount: b.discardedCount,
      discardedAmount: b.discardedAmount,
    };
  });

  const peakWeeklyDayRevenue = Math.max(...weeklyBreakdown.map((d) => d.revenue), 1);
  const weeklyOrdersCount = weeklyOrdersSet.size || weeklyJobs;

  // Lifetime / All-Time Stats
  let allTimeRevenue = 0;
  let allTimePages = 0;
  let allTimeColor = 0;
  let allTimeBw = 0;
  let allTimeOrdersSet = new Set<string>();
  let allTimeDiscardedCount = 0;
  let allTimeDiscardedAmount = 0;

  for (const job of completedJobs) {
    allTimeRevenue += Number(job.total_amount || 0);
    if (job.order_id) allTimeOrdersSet.add(job.order_id);
    const pages = Array.isArray(job.print_job_pages) ? job.print_job_pages : [];
    let jobColor = 0;
    let jobBw = 0;
    for (const p of pages) {
      const count = (p.end_page - p.start_page + 1) * (p.copies ?? 1);
      if (p.color_mode === "color") jobColor += count;
      else jobBw += count;
    }
    allTimePages += jobColor + jobBw || Number(job.total_pages || 0);
    allTimeColor += jobColor;
    allTimeBw += jobBw;
  }

  for (const job of discardedJobs) {
    allTimeDiscardedCount += 1;
    allTimeDiscardedAmount += Number(job.total_amount || 0);
  }

  const allTimeOrdersCount = allTimeOrdersSet.size || completedJobs.length;
  const hasActivity = rawJobs.length > 0 || rawOrders.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">
            Performance &amp; Insights
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-950">
            Shop Analytics &amp; Revenue
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Live calculated revenue, daily &amp; weekly trends, and volume for your print station in Indian Standard Time (IST).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral" className="px-3 py-1 text-xs font-mono">
            <Clock className="mr-1 size-3.5 text-brand-600" />
            IST (UTC+05:30) · Resets Midnight
          </Badge>
        </div>
      </div>

      {!hasActivity ? (
        <ComingSoon
          title="No printing activity yet"
          description="Daily and weekly revenue analytics will automatically populate once orders and completed print jobs exist."
        />
      ) : (
        <>
          {/* 1. TODAY'S REVENUE & EARNINGS SECTION */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                  <Coins className="size-4" />
                </span>
                <h2 className="text-lg font-bold text-brand-950">Today&apos;s Performance &amp; Revenue</h2>
              </div>
              <span className="text-xs font-semibold text-muted">
                {new Date().toLocaleDateString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {/* Today's Revenue */}
              <Card className="p-5 border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                    Today&apos;s Revenue
                  </p>
                  <span className="flex size-7 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
                    <IndianRupee className="size-4" />
                  </span>
                </div>
                <p className="mt-3 text-3xl font-black text-emerald-950 font-mono tracking-tight">
                  ₹{todayRevenue.toFixed(2)}
                </p>
                <p className="mt-1.5 text-xs text-emerald-800 font-medium">
                  {todayOrdersCount} completed {todayOrdersCount === 1 ? "order" : "orders"} today
                  {todayAOV > 0 ? ` · Avg ₹${todayAOV.toFixed(1)}/order` : ""}
                </p>
              </Card>

              {/* Today's Completed Orders */}
              <MetricCard
                label="Today's Orders"
                value={String(todayOrdersCount)}
                detail={`${todayBucket.completedJobs} completed print jobs`}
                tone={todayOrdersCount > 0 ? "success" : "neutral"}
              />

              {/* Today's Pages Printed */}
              <MetricCard
                label="Today's Pages Printed"
                value={String(todayPages)}
                detail={`${todayBw} B&W · ${todayColor} Color`}
                tone={todayPages > 0 ? "success" : "neutral"}
              />

              {/* Today's Discarded Misprints */}
              <Card className="p-5 border-rose-200 bg-gradient-to-br from-rose-50/50 to-white shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-900">
                    Discarded Misprints
                  </p>
                  <span className="flex size-7 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                    <Trash2 className="size-3.5" />
                  </span>
                </div>
                <p className="mt-3 text-2xl font-bold text-rose-950">
                  {todayDiscardedCount} {todayDiscardedCount === 1 ? "job" : "jobs"}
                </p>
                <p className="mt-1.5 text-xs font-semibold text-rose-700">
                  ₹{todayDiscardedAmount.toFixed(2)} excluded from revenue
                </p>
              </Card>
            </div>
          </div>

          {/* 2. WEEKLY REVENUE & 7-DAY BREAKDOWN */}
          <Card className="border-brand-200 shadow-md rounded-3xl overflow-hidden">
            <CardHeader className="border-b border-line bg-gradient-to-r from-slate-50 via-white to-slate-50 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-md shadow-brand-900/20">
                    <TrendingUp className="size-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-brand-950">Weekly Revenue &amp; 7-Day Trend</h2>
                    <p className="text-xs text-muted">
                      Revenue and print volume performance over the last 7 calendar days.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-right">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                      7-Day Total Revenue
                    </p>
                    <p className="text-2xl font-black text-brand-950 font-mono">
                      ₹{weeklyRevenue.toFixed(2)}
                    </p>
                  </div>
                  <div className="border-l border-line pl-4 text-right">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                      7-Day Orders &amp; Pages
                    </p>
                    <p className="text-sm font-extrabold text-slate-800 font-mono">
                      {weeklyOrdersCount} orders · {weeklyPages} pages
                    </p>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted mb-4">
                Daily Revenue &amp; Print Breakdown (Last 7 Days)
              </h3>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
                {weeklyBreakdown.map((day) => {
                  const fillPct = Math.max(Math.round((day.revenue / peakWeeklyDayRevenue) * 100), 4);
                  return (
                    <div
                      key={day.dateStr}
                      className={`flex flex-col justify-between rounded-2xl border p-4 transition ${
                        day.isToday
                          ? "border-brand-500 bg-brand-50/50 shadow-xs ring-1 ring-brand-400"
                          : "border-line bg-white hover:border-brand-200 hover:bg-slate-50/60"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-extrabold uppercase tracking-wider ${
                              day.isToday ? "text-brand-700" : "text-slate-600"
                            }`}
                          >
                            {day.shortDay}
                          </span>
                          <span className="text-[11px] font-medium text-muted font-mono">
                            {day.dayLabel}
                          </span>
                        </div>

                        {/* Revenue Amount */}
                        <div className="mt-3">
                          <p className="text-xl font-black text-brand-950 font-mono">
                            ₹{day.revenue.toFixed(0)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted font-medium">
                            {day.ordersCount} {day.ordersCount === 1 ? "order" : "orders"}
                          </p>
                        </div>

                        {/* Pages detail */}
                        <div className="mt-2 text-[10px] text-slate-600">
                          <span>{day.totalPages} pages</span>
                          {day.totalPages > 0 && (
                            <span className="text-muted block">
                              ({day.bwPages} B&amp;W, {day.colorPages} Color)
                            </span>
                          )}
                        </div>

                        {day.discardedCount > 0 && (
                          <div className="mt-2 text-[10px] font-semibold text-rose-600">
                            🗑️ {day.discardedCount} misprints (₹{day.discardedAmount.toFixed(0)} excluded)
                          </div>
                        )}
                      </div>

                      {/* Visual Revenue Volume Bar */}
                      <div className="mt-4 pt-2 border-t border-line/60">
                        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              day.isToday ? "bg-brand-600" : "bg-brand-400"
                            }`}
                            style={{ width: `${day.revenue > 0 ? fillPct : 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 3. ALL-TIME & LIFETIME PERFORMANCE OVERVIEW */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-800">
                <Layers className="size-4" />
              </span>
              <h2 className="text-lg font-bold text-brand-950">All-Time Performance &amp; Print Volume</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="All-Time Earned Revenue"
                value={`₹${allTimeRevenue.toFixed(2)}`}
                detail="Net confirmed completed prints"
                tone="success"
              />
              <MetricCard
                label="All-Time Completed Orders"
                value={String(allTimeOrdersCount)}
                detail={`${completedJobs.length} total print jobs executed`}
              />
              <MetricCard
                label="Total Pages Printed"
                value={String(allTimePages)}
                detail={`${allTimeBw} Black & White · ${allTimeColor} Color`}
              />
              <Card className="p-5 border-slate-200 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-muted">Discarded Misprints (All-Time)</p>
                  <span className="size-2 rounded-full bg-slate-300" />
                </div>
                <p className="mt-4 text-2xl font-semibold text-brand-950">
                  {allTimeDiscardedCount} {allTimeDiscardedCount === 1 ? "print" : "prints"}
                </p>
                <p className="mt-1 text-xs text-rose-600 font-medium">
                  ₹{allTimeDiscardedAmount.toFixed(2)} total excluded from revenue
                </p>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
