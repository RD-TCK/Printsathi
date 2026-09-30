import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
/** Safe to repeat after a interrupted callback or webhook. Never reset claimed/submitted jobs. */
export async function releasePaidOrder(client: SupabaseClient, orderId: string) {
  const { data: jobs } = await client
    .from("print_jobs")
    .select("id, print_job_pages(side_mode)")
    .eq("order_id", orderId);

  const isDouble = (jobs || []).some((j) =>
    (Array.isArray(j.print_job_pages) ? j.print_job_pages : []).some(
      (p: { side_mode?: string }) => p.side_mode === "double_sided"
    )
  );

  const results = await Promise.all([
    client.from("orders").update({ status: isDouble ? "partially_printed" : "paid" }).eq("id", orderId).in("status", ["draft", "awaiting_payment"]),
    // Set to "queued" so the agent's claim_next_print_job RPC can pick them up.
    // "paid" is not a valid print_job status (it belongs to orders only).
    client.from("print_jobs").update({ status: "queued", duplex_step: isDouble ? "odd" : "none" }).eq("order_id", orderId).in("status", ["draft", "awaiting_payment"]),
  ]);
  if (results.some(result => result.error)) throw new Error("Payment verified, but print queue update failed. Retry verification; do not pay again.");
}
