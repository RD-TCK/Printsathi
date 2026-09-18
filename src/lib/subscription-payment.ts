import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRazorpayOrder, fetchRazorpayPayment } from "@/lib/razorpay/server";

export async function activateSubscriptionPayment(
  client: SupabaseClient,
  paymentId: string,
  expected?: { shopId: string; plan?: string; orderId?: string },
) {
  const payment = await fetchRazorpayPayment(paymentId);
  if (!payment?.order_id) throw new Error("Payment could not be verified. Please retry.");
  const order = await fetchRazorpayOrder(payment.order_id);
  const notes = order?.notes as Record<string, string> | undefined;
  if (notes?.purpose !== "shop_subscription" || !notes.shop_id || !["monthly", "yearly"].includes(notes.plan_type)) {
    throw new Error("Payment does not belong to a shop subscription.");
  }
  if (expected && (expected.shopId !== notes.shop_id || (expected.plan && expected.plan !== notes.plan_type) || (expected.orderId && expected.orderId !== payment.order_id))) {
    throw new Error("Payment does not match this shop and plan.");
  }
  const amount = notes.plan_type === "monthly" ? 69900 : 749900;
  if (payment.status !== "captured" || Number(payment.amount) !== amount || payment.currency !== "INR" ||
      Number(order?.amount) !== amount || order?.currency !== "INR" || Number(payment.amount_refunded) > 0) {
    throw new Error("Payment must be captured for the exact plan amount in INR. Please retry once confirmed.");
  }
  const { data, error } = await client.rpc("activate_shop_subscription", {
    p_shop_id: notes.shop_id, p_plan: notes.plan_type,
    p_payment_id: paymentId, p_order_id: payment.order_id,
  });
  if (error) {
    console.error("Subscription activation failed", { code: error.code, message: error.message, paymentId });
    if (error.code === "PGRST202" || error.code === "PGRST205") {
      throw new Error("Payment verified. Subscription database setup is incomplete. Apply the subscription payments migration, then retry activation below. Do not pay again.");
    }
    throw new Error("Payment verified, but the expiry date could not be saved. Retry activation below using this payment. Do not pay again.");
  }
  return data as string;
}
