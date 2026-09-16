import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const client = await createSupabaseServerClient();
  if (!client) {
    return NextResponse.json({ error: "Authentication not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: member } = await client.from("shop_members").select("shop_id").eq("user_id", user.id).maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Not a shop member." }, { status: 403 });
  }

  // Never send agent-owned or already submitted jobs to browser auto-print.
  const { data: jobs, error } = await client
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
      created_at,
      orders (
        id,
        public_id,
        status,
        payments (
          id,
          status,
          provider_payment_id
        )
      ),
      documents (
        id,
        original_filename
      )
    `,
    )
    .eq("shop_id", member.shop_id)
    .in("status", ["queued", "paid"])
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter to jobs that have verified payments or are unlocked
  const printableJobs = (jobs || []).filter((job) => {
    const order = Array.isArray(job.orders) ? job.orders[0] : job.orders;
    const payment = Array.isArray(order?.payments) ? order?.payments[0] : order?.payments;
    return (
      payment?.status === "verified" ||
      order?.status === "paid" ||
      job.status === "queued" ||
      job.status === "paid" ||
      job.status === "printing" ||
      job.status === "claimed"
    );
  });

  return NextResponse.json({ jobs: printableJobs });
}
