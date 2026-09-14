import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hashGuestOrderToken } from "@/lib/guest-order";
import {
  fetchRazorpayPayment,
  fromPaise,
  getRazorpayClient,
  toPaise,
  verifyPaymentSignature,
} from "@/lib/razorpay/server";

const failureSchema = z.object({
  code: z.string().optional(),
  description: z.string().optional(),
  source: z.string().optional(),
  step: z.string().optional(),
  reason: z.string().optional(),
});

const verifyPaymentSchema = z.object({
  orderId: z.string().uuid(),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().optional(),
  razorpaySignature: z.string().optional(),
  accessToken: z.string().min(10).optional(),
  failure: failureSchema.optional(),
  cancelled: z.boolean().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = verifyPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payment verification payload.", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, accessToken, failure, cancelled } =
    parsed.data;

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service is not configured." }, { status: 503 });
  }

  const razorpayConfig = getRazorpayClient();
  if (!razorpayConfig) {
    return NextResponse.json({ error: "Razorpay payment gateway is not configured on the server." }, { status: 503 });
  }

  // 1. Fetch order and verify authorization
  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id, public_id, shop_id, customer_id, status, total_amount, currency, guest_access_token_hash")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  let isAuthorized = false;
  if (accessToken && order.guest_access_token_hash) {
    if (order.guest_access_token_hash === hashGuestOrderToken(accessToken)) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    const serverClient = await createSupabaseServerClient();
    if (serverClient) {
      const {
        data: { user },
      } = await serverClient.auth.getUser();
      if (user && (order.customer_id === user.id || user.id === order.customer_id)) {
        isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: "Order access could not be verified." }, { status: 403 });
  }

  // 2. Fetch payment record
  const { data: payment, error: paymentError } = await adminClient
    .from("payments")
    .select("id, status, amount, currency, provider_order_id, provider_payment_id, metadata")
    .eq("order_id", order.id)
    .maybeSingle();

  if (paymentError || !payment) {
    return NextResponse.json({ error: "Payment record not found for this order." }, { status: 404 });
  }

  // Verify order matches payment provider_order_id
  if (payment.provider_order_id && payment.provider_order_id !== razorpayOrderId) {
    return NextResponse.json(
      { error: "Razorpay order ID does not match the active payment record for this order." },
      { status: 400 },
    );
  }

  // 3. Handle Cancelled or Failed Payment reports from frontend / checkout modal
  if (cancelled || failure) {
    const errorCode = failure?.code || (cancelled ? "PAYMENT_CANCELLED" : "PAYMENT_FAILED");
    const errorDescription =
      failure?.description ||
      failure?.reason ||
      (cancelled ? "Customer closed the checkout modal." : "Payment failed.");

    await adminClient
      .from("payments")
      .update({
        status: "failed",
        error_code: errorCode,
        error_description: errorDescription,
        metadata: {
          ...(payment.metadata as Record<string, unknown>),
          last_failure: {
            code: errorCode,
            description: errorDescription,
            source: failure?.source,
            step: failure?.step,
            failed_at: new Date().toISOString(),
          },
        },
      })
      .eq("id", payment.id);

    await adminClient.from("payment_transactions").insert({
      payment_id: payment.id,
      order_id: order.id,
      provider: "razorpay",
      provider_order_id: razorpayOrderId,
      provider_payment_id: razorpayPaymentId || null,
      event_type: cancelled ? "payment_cancelled" : "payment_failed",
      status: "failed",
      amount: Number(payment.amount),
      currency: payment.currency,
      error_code: errorCode,
      error_description: errorDescription,
      raw_payload: { failure, cancelled },
    });

    return NextResponse.json({
      success: false,
      verified: false,
      status: "failed",
      error: errorDescription,
      canRetry: true,
    });
  }

  // 4. Validate required fields for successful verification
  if (!razorpayPaymentId || !razorpaySignature) {
    return NextResponse.json(
      { error: "Missing razorpayPaymentId or razorpaySignature for verification." },
      { status: 400 },
    );
  }

  // 5. Idempotency Check: Already verified with this payment ID
  if (payment.status === "verified") {
    if (payment.provider_payment_id === razorpayPaymentId) {
      return NextResponse.json({
        success: true,
        verified: true,
        orderId: order.id,
        publicOrderId: order.public_id,
        paymentId: razorpayPaymentId,
        status: "paid",
        amount: Number(payment.amount),
        currency: payment.currency,
        message: "Payment already verified.",
      });
    }

    return NextResponse.json(
      {
        error: "This order has already been verified under another payment transaction.",
        alreadyPaid: true,
      },
      { status: 409 },
    );
  }

  // 6. Cryptographic Signature Verification (HMAC SHA256)
  const isValidSignature = verifyPaymentSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
    keySecret: razorpayConfig.keySecret,
  });

  if (!isValidSignature) {
    // Record verification failure
    await adminClient.from("payment_transactions").insert({
      payment_id: payment.id,
      order_id: order.id,
      provider: "razorpay",
      provider_order_id: razorpayOrderId,
      provider_payment_id: razorpayPaymentId,
      provider_signature: razorpaySignature,
      event_type: "verification_signature_mismatch",
      status: "failed",
      amount: Number(payment.amount),
      currency: payment.currency,
      error_code: "SIGNATURE_VERIFICATION_FAILED",
      error_description: "Cryptographic signature does not match expected HMAC SHA256.",
      raw_payload: { razorpayOrderId, razorpayPaymentId, razorpaySignature },
    });

    return NextResponse.json({ error: "Payment verification failed: Invalid signature." }, { status: 400 });
  }

  // 7. Optional fetch from Razorpay API for amount and method verification
  let paymentMethod = "razorpay";
  let razorpayPaymentData: Record<string, unknown> = {};

  try {
    const fetchedPayment = await fetchRazorpayPayment(razorpayPaymentId);
    if (fetchedPayment) {
      razorpayPaymentData = fetchedPayment as unknown as Record<string, unknown>;
      paymentMethod = (fetchedPayment.method as string) || paymentMethod;

      // Verify amount from gateway matches authoritative order amount in paise
      const expectedPaise = toPaise(Number(payment.amount));
      const actualPaise = Number(fetchedPayment.amount);

      if (actualPaise < expectedPaise) {
        // Tampered amount!
        await adminClient.from("payment_transactions").insert({
          payment_id: payment.id,
          order_id: order.id,
          provider: "razorpay",
          provider_order_id: razorpayOrderId,
          provider_payment_id: razorpayPaymentId,
          event_type: "amount_mismatch",
          status: "failed",
          amount: fromPaise(actualPaise),
          currency: payment.currency,
          error_code: "AMOUNT_MISMATCH",
          error_description: `Paid amount ${actualPaise} paise is less than expected ${expectedPaise} paise.`,
          raw_payload: razorpayPaymentData,
        });

        return NextResponse.json({ error: "Paid amount does not match authoritative order amount." }, { status: 400 });
      }
    }
  } catch (fetchErr) {
    // If Razorpay API fetch fails due to network or rate limit, cryptographic HMAC signature is still authoritative
    console.warn("Could not fetch payment from Razorpay API, proceeding with signature verification:", fetchErr);
  }

  // 8. Update Payment record to VERIFIED
  const verifiedAt = new Date().toISOString();
  const { error: updatePaymentError } = await adminClient
    .from("payments")
    .update({
      status: "verified",
      provider_payment_id: razorpayPaymentId,
      provider_signature: razorpaySignature,
      payment_method: paymentMethod,
      verified_at: verifiedAt,
      error_code: null,
      error_description: null,
      metadata: {
        ...(payment.metadata as Record<string, unknown>),
        razorpay_payment: razorpayPaymentData,
        verified_at: verifiedAt,
      },
    })
    .eq("id", payment.id);

  if (updatePaymentError) {
    return NextResponse.json({ error: "Could not update payment status." }, { status: 500 });
  }

  // 9. Update order and print jobs to 'paid' (eligible for printing)
  await Promise.all([
    adminClient
      .from("orders")
      .update({ status: "paid" })
      .eq("id", order.id)
      .in("status", ["draft", "awaiting_payment"]),
    adminClient
      .from("print_jobs")
      .update({ status: "paid" })
      .eq("order_id", order.id)
      .in("status", ["draft", "awaiting_payment"]),
  ]);

  // 10. Record transaction log & audit log
  await Promise.all([
    adminClient.from("payment_transactions").insert({
      payment_id: payment.id,
      order_id: order.id,
      provider: "razorpay",
      provider_order_id: razorpayOrderId,
      provider_payment_id: razorpayPaymentId,
      provider_signature: razorpaySignature,
      event_type: "verification_success",
      status: "verified",
      amount: Number(payment.amount),
      currency: payment.currency,
      raw_payload: {
        verified_at: verifiedAt,
        method: paymentMethod,
        razorpayPaymentData,
      },
    }),
    adminClient.from("audit_logs").insert({
      shop_id: order.shop_id,
      actor_id: order.customer_id,
      action: "payment_verified",
      entity_type: "order",
      entity_id: order.id,
      metadata: {
        order_id: order.id,
        public_id: order.public_id,
        payment_id: payment.id,
        provider_payment_id: razorpayPaymentId,
        amount: Number(payment.amount),
        currency: payment.currency,
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    verified: true,
    orderId: order.id,
    publicOrderId: order.public_id,
    paymentId: razorpayPaymentId,
    status: "paid",
    amount: Number(payment.amount),
    currency: payment.currency,
  });
}
