import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
/** Safe to repeat after a interrupted callback or webhook. Never reset claimed/submitted jobs. */
export async function releasePaidOrder(client: SupabaseClient, orderId: string) {
  const results = await Promise.all([
    client.from("orders").update({ status: "paid" }).eq("id", orderId).in("status", ["draft", "awaiting_payment"]),
    client.from("print_jobs").update({ status: "paid" }).eq("order_id", orderId).in("status", ["draft", "awaiting_payment"]),
  ]);
  if (results.some(result => result.error)) throw new Error("Payment verified, but print queue update failed. Retry verification; do not pay again.");
}
