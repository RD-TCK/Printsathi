import { NextResponse } from "next/server";
import { z } from "zod";
import { getShopContext, canManageShop } from "@/lib/shop-portal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchRazorpayPayment, getRazorpayClient, verifyPaymentSignature } from "@/lib/razorpay/server";

const verifySubscriptionSchema = z.object({
  plan: z.enum(["monthly", "yearly"]),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export async function POST(request: Request) {
  const context = await getShopContext();
  if (!context || !canManageShop(context)) {
    return NextResponse.json({ error: "Unauthorized or permission denied." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = verifySubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid verification payload." }, { status: 400 });
  }

  const { plan, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

  const razorpayConfig = getRazorpayClient();
  if (!razorpayConfig) {
    return NextResponse.json(
      { error: "Razorpay payment gateway is not configured on the server." },
      { status: 503 },
    );
  }

  // 1. Verify Razorpay cryptographic HMAC SHA-256 signature
  const signatureValid = verifyPaymentSignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    razorpayConfig.keySecret,
  );

  if (!signatureValid) {
    return NextResponse.json({ error: "Payment signature verification failed." }, { status: 400 });
  }

  // 2. Fetch payment from Razorpay and verify captured amount & currency
  const paymentDetails = await fetchRazorpayPayment(razorpayPaymentId);
  const expectedAmountRupees = plan === "monthly" ? 699 : 7499;
  const expectedAmountPaise = expectedAmountRupees * 100;

  if (paymentDetails.amount < expectedAmountPaise || paymentDetails.currency !== "INR") {
    return NextResponse.json({ error: "Payment amount or currency does not match the plan." }, { status: 400 });
  }

  if (paymentDetails.status !== "captured" && paymentDetails.status !== "authorized") {
    return NextResponse.json({ error: `Payment is not in captured status (${paymentDetails.status}).` }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database client is unavailable." }, { status: 503 });
  }

  // 3. Compute subscription duration (1 month vs 1 year)
  const startDate = new Date();
  const endDate = new Date(startDate);
  if (plan === "monthly") {
    endDate.setMonth(endDate.getMonth() + 1);
  } else {
    endDate.setFullYear(endDate.getFullYear() + 1);
  }

  // 4. Update or upsert subscriptions table
  const { data: currentSub } = await adminClient
    .from("subscriptions")
    .select("id, current_period_end")
    .eq("shop_id", context.shop.id)
    .maybeSingle();

  // If existing active subscription has days remaining in future, extend from current_period_end
  let finalEndDate = endDate;
  if (currentSub?.current_period_end) {
    const existingEnd = new Date(currentSub.current_period_end);
    if (existingEnd > startDate) {
      finalEndDate = new Date(existingEnd);
      if (plan === "monthly") {
        finalEndDate.setMonth(finalEndDate.getMonth() + 1);
      } else {
        finalEndDate.setFullYear(finalEndDate.getFullYear() + 1);
      }
    }
  }

  if (currentSub) {
    const { error: updateSubErr } = await adminClient
      .from("subscriptions")
      .update({
        status: "active",
        current_period_start: startDate.toISOString(),
        current_period_end: finalEndDate.toISOString(),
        provider_subscription_id: razorpayPaymentId,
        updated_at: new Date().toISOString(),
      })
      .eq("shop_id", context.shop.id);

    if (updateSubErr) {
      return NextResponse.json({ error: `Could not update subscription: ${updateSubErr.message}` }, { status: 500 });
    }
  } else {
    const { error: insertSubErr } = await adminClient
      .from("subscriptions")
      .insert({
        shop_id: context.shop.id,
        status: "active",
        current_period_start: startDate.toISOString(),
        current_period_end: finalEndDate.toISOString(),
        provider_subscription_id: razorpayPaymentId,
      });

    if (insertSubErr) {
      return NextResponse.json({ error: `Could not activate subscription: ${insertSubErr.message}` }, { status: 500 });
    }
  }

  // 5. Update shop_settings billing_mode to 'shop_subscription'
  await adminClient
    .from("shop_settings")
    .update({ billing_mode: "shop_subscription" })
    .eq("shop_id", context.shop.id);

  return NextResponse.json({
    success: true,
    message: `Subscription successfully activated! Valid until ${finalEndDate.toLocaleDateString()}.`,
    periodEnd: finalEndDate.toISOString(),
    plan,
    paymentId: razorpayPaymentId,
  });
}
