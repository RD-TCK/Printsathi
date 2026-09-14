import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRazorpayServerEnv } from "@/lib/env";
import { fromPaise, verifyWebhookSignature } from "@/lib/razorpay/server";

export async function POST(request: Request) {
  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service not available" }, { status: 503 });
  }

  const env = getRazorpayServerEnv();
  if (!env || !env.webhookSecret) {
    return NextResponse.json({ error: "Razorpay webhook secret is not configured" }, { status: 503 });
  }

  // 1. Read raw body text for HMAC signature verification
  let rawBodyText: string;
  try {
    rawBodyText = await request.text();
  } catch {
    return NextResponse.json({ error: "Could not read request body" }, { status: 400 });
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing x-razorpay-signature header" }, { status: 400 });
  }

  // 2. Verify webhook signature
  const isValid = verifyWebhookSignature({
    rawBody: rawBodyText,
    signature,
    webhookSecret: env.webhookSecret,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  // 3. Parse JSON payload
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBodyText);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const eventType = String(payload.event || "");
  const eventId =
    request.headers.get("x-razorpay-event-id") ||
    String(payload.event_id || payload.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

  // 4. Webhook Idempotency: Check if this event was already processed
  const { data: existingEvent } = await adminClient
    .from("payment_webhook_events")
    .select("id, processed")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existingEvent?.processed) {
    return NextResponse.json({ received: true, duplicate: true, eventId });
  }

  if (!existingEvent) {
    await adminClient.from("payment_webhook_events").insert({
      event_id: eventId,
      event_type: eventType,
      provider: "razorpay",
      payload,
      processed: false,
    });
  }

  try {
    const eventPayload = payload.payload as Record<string, Record<string, unknown>> | undefined;
    const paymentEntity = eventPayload?.payment?.entity as Record<string, unknown> | undefined;
    const orderEntity = eventPayload?.order?.entity as Record<string, unknown> | undefined;

    const rzpOrderId = String(paymentEntity?.order_id || orderEntity?.id || "");
    const rzpPaymentId = String(paymentEntity?.id || "");
    const notes = (paymentEntity?.notes || orderEntity?.notes || {}) as Record<string, string>;
    const orderIdFromNotes = notes?.order_id;

    if (rzpOrderId || orderIdFromNotes) {
      // Find matching payment in our database
      let paymentQuery = adminClient.from("payments").select("id, order_id, status, amount, currency, metadata");
      if (rzpOrderId) {
        paymentQuery = paymentQuery.eq("provider_order_id", rzpOrderId);
      } else {
        paymentQuery = paymentQuery.eq("order_id", orderIdFromNotes);
      }

      const { data: payment } = await paymentQuery.maybeSingle();

      if (payment) {
        if (eventType === "payment.captured" || eventType === "order.paid") {
          const verifiedAt = new Date().toISOString();
          const paymentMethod = String(paymentEntity?.method || "razorpay");

          if (payment.status !== "verified") {
            await adminClient
              .from("payments")
              .update({
                status: "verified",
                provider_payment_id: rzpPaymentId || undefined,
                payment_method: paymentMethod,
                verified_at: verifiedAt,
                error_code: null,
                error_description: null,
                metadata: {
                  ...(payment.metadata as Record<string, unknown>),
                  webhook_event: payload,
                  verified_at: verifiedAt,
                },
              })
              .eq("id", payment.id);

            // Unlock order and print jobs
            await Promise.all([
              adminClient
                .from("orders")
                .update({ status: "paid" })
                .eq("id", payment.order_id)
                .in("status", ["draft", "awaiting_payment"]),
              adminClient
                .from("print_jobs")
                .update({ status: "paid" })
                .eq("order_id", payment.order_id)
                .in("status", ["draft", "awaiting_payment"]),
            ]);

            await adminClient.from("payment_transactions").insert({
              payment_id: payment.id,
              order_id: payment.order_id,
              provider: "razorpay",
              provider_order_id: rzpOrderId || null,
              provider_payment_id: rzpPaymentId || null,
              event_type: `webhook_${eventType}`,
              status: "verified",
              amount: Number(payment.amount),
              currency: payment.currency,
              raw_payload: payload,
            });
          }
        } else if (eventType === "payment.failed") {
          const errorCode = String(paymentEntity?.error_code || "PAYMENT_FAILED");
          const errorDesc = String(paymentEntity?.error_description || "Payment failed");

          if (payment.status !== "verified") {
            await adminClient
              .from("payments")
              .update({
                status: "failed",
                error_code: errorCode,
                error_description: errorDesc,
                metadata: {
                  ...(payment.metadata as Record<string, unknown>),
                  last_webhook_failure: paymentEntity,
                },
              })
              .eq("id", payment.id);

            await adminClient.from("payment_transactions").insert({
              payment_id: payment.id,
              order_id: payment.order_id,
              provider: "razorpay",
              provider_order_id: rzpOrderId || null,
              provider_payment_id: rzpPaymentId || null,
              event_type: "webhook_payment_failed",
              status: "failed",
              amount: paymentEntity?.amount ? fromPaise(Number(paymentEntity.amount)) : Number(payment.amount),
              currency: payment.currency,
              error_code: errorCode,
              error_description: errorDesc,
              raw_payload: payload,
            });
          }
        }
      }
    }

    // Mark webhook event as processed
    await adminClient
      .from("payment_webhook_events")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq("event_id", eventId);

    return NextResponse.json({ received: true, success: true, eventId, event: eventType });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Webhook processing error";
    await adminClient
      .from("payment_webhook_events")
      .update({
        processed: false,
        processing_error: errorMsg,
      })
      .eq("event_id", eventId);

    return NextResponse.json({ received: true, error: errorMsg }, { status: 500 });
  }
}
