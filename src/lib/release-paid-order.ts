import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
/** Safe to repeat after a interrupted callback or webhook. Never reset claimed/submitted jobs. */
export interface ReleasePaidOrderOptions {
  /** Only true for explicit shopkeeper retries on failed jobs; never reset active/submitted/completed jobs. */
  forceRequeueFailed?: boolean;
}

export async function releasePaidOrder(
  client: SupabaseClient,
  orderId: string,
  options: ReleasePaidOrderOptions = {},
) {
  const { data: jobs, error: jobsFetchError } = await client
    .from("print_jobs")
    .select("id, status, duplex_step, print_job_pages(side_mode)")
    .eq("order_id", orderId);

  if (jobsFetchError) {
    throw new Error("Payment verified, but print queue lookup failed. Retry verification; do not pay again.");
  }

  const allJobs = jobs || [];
  const nonCancelledJobs = allJobs.filter((j) => j.status !== "cancelled");
  const isDouble = nonCancelledJobs.some((j) =>
    (Array.isArray(j.print_job_pages) ? j.print_job_pages : []).some(
      (p: { side_mode?: string }) => p.side_mode === "double_sided",
    ),
  );

  // Never reset jobs that are already queued, claimed, printing, print_submitted, completed, or cancelled.
  const releasableStatuses = options.forceRequeueFailed
    ? ["draft", "awaiting_payment", "failed"]
    : ["draft", "awaiting_payment"];

  const orderUpdatePromise = client
    .from("orders")
    .update({ status: isDouble ? "partially_printed" : "paid" })
    .eq("id", orderId)
    .in("status", ["draft", "awaiting_payment"]);

  const jobUpdatePromises = nonCancelledJobs
    .filter((job) => releasableStatuses.includes(job.status))
    .map((job) => {
      const jobIsDouble = (Array.isArray(job.print_job_pages) ? job.print_job_pages : []).some(
        (p: { side_mode?: string }) => p.side_mode === "double_sided",
      );
      const nextDuplexStep = jobIsDouble
        ? job.duplex_step === "odd_printed" || job.duplex_step === "even"
          ? job.duplex_step
          : "odd"
        : "none";

      return client
        .from("print_jobs")
        .update({
          status: "queued",
          duplex_step: nextDuplexStep,
          claimed_by_agent_id: null,
          claim_expires_at: null,
          failure_reason: null,
          print_attempts: 0,
        })
        .eq("id", job.id)
        .in("status", releasableStatuses);
    });

  const results = await Promise.all([orderUpdatePromise, ...jobUpdatePromises]);
  if (results.some((result) => result.error)) {
    throw new Error("Payment verified, but print queue update failed. Retry verification; do not pay again.");
  }
}
