import "server-only";
import { getCurrentProfile } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Read every page, rather than silently reporting Supabase's first 1,000 rows as totals.
export async function readAdminRows<T>(
  read: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const result = await read(start, start + 499);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if (!result.data || result.data.length < 500) return rows;
  }
}

export async function loadAdminData() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") return null;
  // Never instantiate a privileged client until the authenticated database role is checked.
  const client = createSupabaseAdminClient();
  if (!client) throw new Error("Admin database connection is not configured.");
  const [shops, settings, subscriptions, jobs, payments, agents, printers, orders, subscriptionPayments, transactions] =
    await Promise.all([
      readAdminRows((a, b) =>
        client
          .from("shops")
          .select("id, public_id, name, email, phone, address, is_active, created_at")
          .order("id")
          .range(a, b),
      ),
      readAdminRows((a, b) =>
        client.from("shop_settings").select("shop_id, accepting_orders, billing_mode").order("shop_id").range(a, b),
      ),
      readAdminRows((a, b) =>
        client
          .from("subscriptions")
          .select("id, shop_id, status, trial_end, current_period_end")
          .order("id")
          .range(a, b),
      ),
      readAdminRows((a, b) =>
        client
          .from("print_jobs")
          .select(
            "id, shop_id, order_id, status, total_amount, failure_reason, created_at, completed_at, print_job_pages(start_page, end_page)",
          )
          .order("id")
          .range(a, b),
      ),
      readAdminRows((a, b) =>
        client
          .from("payments")
          .select(
            "id, order_id, print_job_id, status, amount, currency, provider_payment_id, error_description, created_at",
          )
          .order("id")
          .range(a, b),
      ),
      readAdminRows((a, b) =>
        client
          .from("desktop_agents")
          .select("id, shop_id, name, status, version, is_revoked, last_heartbeat_at, last_error, current_job_id")
          .order("id")
          .range(a, b),
      ),
      readAdminRows((a, b) =>
        client
          .from("printers")
          .select("id, shop_id, desktop_agent_id, name, status, last_seen_at, driver_name")
          .order("id")
          .range(a, b),
      ),
      readAdminRows((a, b) =>
        client
          .from("orders")
          .select("id, public_id, shop_id, status, total_amount, created_at")
          .order("id")
          .range(a, b),
      ),
      readAdminRows((a, b) =>
        client
          .from("shop_subscription_payments")
          .select("payment_id, shop_id, plan, period_end, created_at")
          .order("payment_id")
          .range(a, b),
      ),
      readAdminRows((a, b) =>
        client
          .from("payment_transactions")
          .select("id, payment_id, order_id, event_type, status, amount, currency, provider_payment_id, created_at")
          .order("id")
          .range(a, b),
      ),
    ]);
  return {
    shops,
    settings,
    subscriptions,
    jobs,
    payments,
    agents,
    printers,
    orders,
    subscriptionPayments,
    transactions,
    refreshedAt: new Date().toISOString(),
  };
}

export type AdminData = NonNullable<Awaited<ReturnType<typeof loadAdminData>>>;
