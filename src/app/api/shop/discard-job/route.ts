import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let shopId: string | null = null;

  // Check agent auth first
  const agentAuth = await authenticateAgent(request);
  if (agentAuth) {
    shopId = agentAuth.shop.id;
  } else {
    // Check shop owner session auth
    const client = await createSupabaseServerClient();
    if (client) {
      const {
        data: { user },
      } = await client.auth.getUser();

      if (user) {
        const { data: member } = await client
          .from("shop_members")
          .select("shop_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (member) {
          shopId = member.shop_id;
        }
      }
    }
  }

  if (!shopId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { jobId, orderId, reason = "Customer rejected misprint (Discarded by shop)" } = body;

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service unavailable." }, { status: 503 });
  }

  if (jobId) {
    if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId)) {
      return NextResponse.json({ error: "Invalid jobId." }, { status: 400 });
    }

    const { data: job, error: fetchErr } = await adminClient
      .from("print_jobs")
      .select("id, order_id, shop_id")
      .eq("id", jobId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (fetchErr || !job) {
      return NextResponse.json({ error: "Print job not found." }, { status: 404 });
    }

    // Mark print job as failed / discarded
    const { error: updateErr } = await adminClient
      .from("print_jobs")
      .update({
        status: "failed",
        failure_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("shop_id", shopId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // If order has no remaining active/completed jobs, update order status
    if (job.order_id) {
      const { data: siblingJobs } = await adminClient
        .from("print_jobs")
        .select("status")
        .eq("order_id", job.order_id)
        .eq("shop_id", shopId);

      const allDiscarded = (siblingJobs || []).every((j) => ["failed", "cancelled"].includes(j.status));
      if (allDiscarded) {
        await adminClient
          .from("orders")
          .update({
            status: "cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.order_id)
          .eq("shop_id", shopId);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Print job discarded. Excluded from shop revenue.",
    });
  } else if (orderId) {
    if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return NextResponse.json({ error: "Invalid orderId." }, { status: 400 });
    }

    // Discard entire order and all associated jobs
    await adminClient
      .from("orders")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("shop_id", shopId);

    await adminClient
      .from("print_jobs")
      .update({
        status: "failed",
        failure_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId)
      .eq("shop_id", shopId);

    return NextResponse.json({
      success: true,
      message: "Order and jobs discarded. Excluded from shop revenue.",
    });
  }

  return NextResponse.json({ error: "Missing jobId or orderId." }, { status: 400 });
}
