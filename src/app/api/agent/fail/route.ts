import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";

const failSchema = z.object({
  jobId: z.string().uuid(),
  reason: z.string().min(1).max(500),
  isRetryable: z.boolean().default(true),
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

  const parsed = failSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid job failure request." }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service not configured." }, { status: 503 });
  }

  const { data: job } = await adminClient.from("print_jobs")
    .select("status, print_attempts, max_attempts")
    .eq("id", parsed.data.jobId).eq("shop_id", auth.shop.id)
    .eq("claimed_by_agent_id", auth.agent.id)
    .in("status", ["claimed", "print_submitted"]).maybeSingle();
  if (!job) return NextResponse.json({ error: "Job is no longer owned by this agent." }, { status: 409 });
  const retryable = parsed.data.isRetryable && job.status === "claimed" && job.print_attempts < job.max_attempts;
  const { data: success, error } = await adminClient.from("print_jobs")
    .update({ status: retryable ? "queued" : "failed", failure_reason: parsed.data.reason,
      claim_expires_at: null, claimed_by_agent_id: retryable ? null : auth.agent.id })
    .eq("id", parsed.data.jobId).eq("shop_id", auth.shop.id)
    .eq("claimed_by_agent_id", auth.agent.id).eq("status", job.status)
    .select("id").maybeSingle();

  if (error || !success) {
    return NextResponse.json(
      { error: error?.message || "Failed to report job failure or job is not claimed by this agent." },
      { status: 400 },
    );
  }

  // Audit log
  await adminClient.from("audit_logs").insert({
    shop_id: auth.shop.id,
    action: "print_job_failed",
    entity_type: "print_job",
    entity_id: parsed.data.jobId,
    metadata: {
      agent_id: auth.agent.id,
      reason: parsed.data.reason,
      retryable,
      failed_at: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    success: true,
    jobId: parsed.data.jobId,
    reason: parsed.data.reason,
    retryable,
  });
}
