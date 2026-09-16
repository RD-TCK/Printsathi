import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  const { data: member } = await client
    .from("shop_members")
    .select("shop_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Not a shop member." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { jobId, status = "completed", reason = null } = body;

  if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId) || !["completed", "failed"].includes(status)) {
    return NextResponse.json({ error: "Missing jobId." }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient() || client;

  const { data: job, error: lookupError } = await adminClient.from("print_jobs")
    .select("id, status, claimed_by_agent_id")
    .eq("id", jobId).eq("shop_id", member.shop_id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Could not load the print job." }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Print job not found." }, { status: 404 });
  if (job.status === "completed" && status === "completed")
    return NextResponse.json({ success: true, job: { id: job.id, status: "completed" } });
  if (job.status !== "print_submitted" || !job.claimed_by_agent_id)
    return NextResponse.json({ error: "Job is not awaiting output confirmation." }, { status: 409 });

  // The queue RPC also updates the parent order and clears the agent's current job.
  if (status === "completed") {
    const { data: completed, error: completionError } = await adminClient.rpc("complete_print_job", {
      p_job_id: job.id, p_agent_id: job.claimed_by_agent_id,
    });
    if (completionError || !completed)
      return NextResponse.json({ error: "Could not confirm the print job and order. Please retry." }, { status: 409 });
    return NextResponse.json({ success: true, job: { id: job.id, status: "completed" } });
  }

  // Update job status
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
    .eq("shop_id", member.shop_id)
    .in("status", ["print_submitted", "printing"])
    .select("id, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) return NextResponse.json({ error: "Job is not awaiting output confirmation." }, { status: 409 });
  return NextResponse.json({ success: true, job: data });
}
