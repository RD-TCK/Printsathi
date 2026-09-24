import { activateSubscriptionPayment } from "@/lib/subscription-payment";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getShopContext, canManageShop } from "@/lib/shop-portal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPlatformRazorpayClient, verifyPaymentSignature } from "@/lib/razorpay/server";

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

  const razorpayConfig = getPlatformRazorpayClient();
  if (!razorpayConfig) {
    return NextResponse.json(
      { error: "Razorpay payment gateway is not configured on the server." },
      { status: 503 },
    );
  }

  // 1. Verify Razorpay cryptographic HMAC SHA-256 signature
  const signatureValid = verifyPaymentSignature({
    orderId: razorpayOrderId, paymentId: razorpayPaymentId,
    signature: razorpaySignature, keySecret: razorpayConfig.keySecret,
  });

  if (!signatureValid) {
    return NextResponse.json({ error: "Payment signature verification failed." }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) return NextResponse.json({ error: "Database client is unavailable." }, { status: 503 });
  try {
    const periodEnd = await activateSubscriptionPayment(adminClient, razorpayPaymentId, {
      shopId: context.shop.id, plan, orderId: razorpayOrderId,
    });
    return NextResponse.json({ success: true, periodEnd, message: "Subscription activated successfully.", plan });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not activate subscription." }, { status: 409 });
  }
}
