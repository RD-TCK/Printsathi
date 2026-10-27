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
  const { jobId, orderId, status = "completed", reason = null } = body;

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service unavailable." }, { status: 503 });
  }

  // If orderId is provided, mark all jobs of this order as completed and complete the order
  if (orderId && typeof orderId === "string" && /^[0-9a-f-]{36}$/i.test(orderId)) {
    const { data: orderJobs } = await adminClient
      .from("print_jobs")
      .select("id, status, claimed_by_agent_id")
      .eq("order_id", orderId)
      .eq("shop_id", shopId);

    if (orderJobs && orderJobs.length > 0) {
      for (const j of orderJobs) {
        if (j.status !== "completed") {
          if (j.claimed_by_agent_id) {
            await adminClient.rpc("complete_print_job", {
              p_job_id: j.id,
              p_agent_id: j.claimed_by_agent_id,
            });
          }
          await adminClient
            .from("print_jobs")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              printed_at: new Date().toISOString(),
              failure_reason: null,
            })
            .eq("id", j.id)
            .eq("shop_id", shopId);
        }
      }
    }

    await adminClient
      .from("orders")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("shop_id", shopId);

    return NextResponse.json({ success: true, orderId });
  }

  if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId) || !["completed", "failed"].includes(status)) {
    return NextResponse.json({ error: "Missing jobId or orderId." }, { status: 400 });
  }

  const { data: job, error: lookupError } = await adminClient
    .from("print_jobs")
    .select("id, status, claimed_by_agent_id")
    .eq("id", jobId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Could not load the print job." }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Print job not found." }, { status: 404 });
  if (job.status === "completed" && status === "completed")
    return NextResponse.json({ success: true, job: { id: job.id, status: "completed" } });

  // If claimed by Windows agent, call the agent completion RPC
  if (job.claimed_by_agent_id && status === "completed") {
    const { data: completed, error: completionError } = await adminClient.rpc("complete_print_job", {
      p_job_id: job.id,
      p_agent_id: job.claimed_by_agent_id,
    });
    if (!completionError && completed) {
      return NextResponse.json({ success: true, job: { id: job.id, status: "completed" } });
    }
  }

  // Update job status directly (for web prints or fallback)
  const updatePayload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "completed") {
    updatePayload.completed_at = new Date().toISOString();
  } else if (status === "failed") {
    updatePayload.failure_reason = reason || "Web print dispatch failed";
  }

  const { data, error } = await adminClient
    .from("print_jobs")
    .update(updatePayload)
    .eq("id", jobId)
    .eq("shop_id", shopId)
    .select("id, status, order_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) return NextResponse.json({ error: "Could not update print job." }, { status: 409 });

  // If all jobs for the order are completed, mark the order completed as well
  if (data.order_id && status === "completed") {
    const { data: orderJobs } = await adminClient
      .from("print_jobs")
      .select("status")
      .eq("order_id", data.order_id)
      .eq("shop_id", shopId);

    if (orderJobs && orderJobs.length > 0 && orderJobs.every((j) => j.status === "completed")) {
      await adminClient
        .from("orders")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", data.order_id)
        .eq("shop_id", shopId);
    }
  }

  return NextResponse.json({ success: true, job: data });
}
