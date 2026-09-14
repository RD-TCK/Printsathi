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

  const { data: success, error } = await adminClient.rpc("fail_print_job", {
    p_job_id: parsed.data.jobId,
    p_agent_id: auth.agent.id,
    p_reason: parsed.data.reason,
    p_is_retryable: parsed.data.isRetryable,
  });

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
      retryable: parsed.data.isRetryable,
      failed_at: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    success: true,
    jobId: parsed.data.jobId,
    reason: parsed.data.reason,
    retryable: parsed.data.isRetryable,
  });
}
