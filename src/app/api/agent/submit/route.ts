import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";

const submitSchema = z.object({
  jobId: z.string().uuid(),
});

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized agent." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid job submission request." }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service not configured." }, { status: 503 });
  }

  // Check current job details
  const { data: existingJob } = await adminClient
    .from("print_jobs")
    .select("id, duplex_step, order_id")
    .eq("id", parsed.data.jobId)
    .maybeSingle();

  const isOddStep = existingJob?.duplex_step === "odd";
  const isEvenStep = existingJob?.duplex_step === "even";

  const targetJobStatus = isOddStep ? "partially_printed" : "print_submitted";
  const targetDuplexStep = isOddStep ? "odd_printed" : isEvenStep ? "completed" : "none";
  const targetOrderStatus = isOddStep ? "partially_printed" : "paid";

  // Reserve dispatch before Windows receives any bytes. Never allow an expired
  // lease to start printing, even if another agent has not reclaimed it yet.
  const { data: success, error } = await adminClient.from("print_jobs")
    .update({
      status: targetJobStatus,
      duplex_step: targetDuplexStep,
      claim_expires_at: null,
      failure_reason: null,
    })
    .eq("id", parsed.data.jobId).eq("shop_id", auth.shop.id)
    .eq("claimed_by_agent_id", auth.agent.id).eq("status", "claimed")
    .gt("claim_expires_at", new Date().toISOString())
    .select("id").maybeSingle();

  if (error || !success) {
    return NextResponse.json(
      { error: error?.message || "Failed to record submission or job is not claimed by this agent." },
      { status: 400 },
    );
  }

  // Update associated order status
  if (existingJob?.order_id) {
    await adminClient
      .from("orders")
      .update({
        status: targetOrderStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingJob.order_id);
  }

  // Audit log
  await adminClient.from("audit_logs").insert({
    shop_id: auth.shop.id,
    action: isOddStep ? "print_job_odd_pages_submitted" : "print_job_submitted",
    entity_type: "print_job",
    entity_id: parsed.data.jobId,
    metadata: {
      agent_id: auth.agent.id,
      duplex_step: targetDuplexStep,
      submitted_at: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    success: true,
    jobId: parsed.data.jobId,
    status: targetJobStatus,
    duplexStep: targetDuplexStep,
  });
}
