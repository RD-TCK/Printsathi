import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";

const submitSchema = z.object({
  jobId: z.string().uuid(),
  // Optional: the Windows printer name used to print this pass.
  // Required for duplex odd-step jobs so the even step can be routed to the same printer.
  printerName: z.string().max(256).optional(),
  duplexStep: z.enum(["none", "odd", "even", "all", "completed"]).optional(),
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

  const stepReported = parsed.data.duplexStep;
  const isHardwareAll = stepReported === "all";
  const isOddStep = stepReported ? stepReported === "odd" : existingJob?.duplex_step === "odd";
  const isEvenStep = stepReported ? (stepReported === "even" || stepReported === "completed") : existingJob?.duplex_step === "even";

  // "print_submitted" is the only valid print_job_status for a job that has been
  // sent to the Windows spooler. "partially_printed" is an ORDER status only —
  // setting it on a print_job would violate the DB enum and cause a 400 error.
  const targetJobStatus = "print_submitted";
  const targetDuplexStep = isHardwareAll ? "completed" : isOddStep ? "odd_printed" : isEvenStep ? "completed" : "none";
  // Order stays "partially_printed" after odd step; moves to "paid" after even step, hardware duplex, or single-sided
  const targetOrderStatus = isOddStep ? "partially_printed" : "paid";

  // For the odd step, persist the printer name so the even step routes to the same printer,
  // even if the agent restarts between the two passes.
  const updateFields: Record<string, unknown> = {
    status: targetJobStatus,
    duplex_step: targetDuplexStep,
    claim_expires_at: null,
    failure_reason: null,
  };
  if (isOddStep && parsed.data.printerName) {
    updateFields.duplex_printer_name = parsed.data.printerName;
  }

  // Reserve dispatch before Windows receives any bytes. Never allow an expired
  // lease to start printing, even if another agent has not reclaimed it yet.
  const { data: success, error } = await adminClient.from("print_jobs")
    .update(updateFields)
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
