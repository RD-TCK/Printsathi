import { activateSubscriptionPayment } from "@/lib/subscription-payment";
import { releasePaidOrder } from "@/lib/release-paid-order";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { capturedPaymentMatches } from "@/lib/payment-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRazorpayServerEnv } from "@/lib/env";
import { fetchRazorpayOrder, fromPaise, getShopRazorpayCredentials, toPaise, verifyWebhookSignature, type RazorpayCredentials } from "@/lib/razorpay/server";

export async function POST(request: Request) {
  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service not available" }, { status: 503 });
  }

  const env = getRazorpayServerEnv();

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

  // 2. Parse JSON payload so we can resolve shop-specific webhook credentials if needed
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBodyText);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const eventPayload = payload.payload as Record<string, Record<string, unknown>> | undefined;
  const paymentEntity = eventPayload?.payment?.entity as Record<string, unknown> | undefined;
  const orderEntity = eventPayload?.order?.entity as Record<string, unknown> | undefined;
  const rzpOrderId = String(paymentEntity?.order_id || orderEntity?.id || "");
  const rzpPaymentId = String(paymentEntity?.id || "");
  const notes = (paymentEntity?.notes || orderEntity?.notes || {}) as Record<string, string>;
  const orderIdFromNotes = notes?.order_id;
  const shopIdFromNotes = notes?.shop_id;

  // Look up custom Razorpay credentials for the target shop when available
  let shopCredentials: RazorpayCredentials | null = null;
  let resolvedShopId: string | null = typeof shopIdFromNotes === "string" && shopIdFromNotes ? shopIdFromNotes : null;
  if (!resolvedShopId && (rzpOrderId || orderIdFromNotes)) {
    const paymentLookup = rzpOrderId
      ? await adminClient.from("payments").select("order_id").eq("provider_order_id", rzpOrderId).maybeSingle()
      : await adminClient.from("payments").select("order_id").eq("order_id", orderIdFromNotes).maybeSingle();
    const targetOrderId = paymentLookup.data?.order_id || orderIdFromNotes;
    if (targetOrderId) {
      const { data: orderRow } = await adminClient.from("orders").select("shop_id").eq("id", targetOrderId).maybeSingle();
      resolvedShopId = orderRow?.shop_id ?? null;
    }
  }
  if (resolvedShopId) {
    shopCredentials = await getShopRazorpayCredentials(adminClient, resolvedShopId);
  }

  const candidateSecrets = Array.from(
    new Set([shopCredentials?.webhookSecret, env?.webhookSecret].filter((s): s is string => Boolean(s))),
  );
  if (candidateSecrets.length === 0) {
    return NextResponse.json({ error: "Razorpay webhook secret is not configured" }, { status: 503 });
  }

  // 3. Verify webhook signature against shop custom secret or platform secret
  const isValid = candidateSecrets.some((secret) =>
    verifyWebhookSignature({
      rawBody: rawBodyText,
      signature,
      webhookSecret: secret,
    }),
  );

  if (!isValid) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const eventType = String(payload.event || "");
  const eventId = request.headers.get("x-razorpay-event-id") || createHash("sha256").update(rawBodyText).digest("hex");

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
    const { error: insertEventError } = await adminClient.from("payment_webhook_events").insert({
      event_id: eventId,
      event_type: eventType,
      provider: "razorpay",
      payload,
      processed: false,
    });
    if (insertEventError) {
      if (insertEventError.code === "23505") {
        const { data: racedEvent } = await adminClient
          .from("payment_webhook_events")
          .select("processed")
          .eq("event_id", eventId)
          .maybeSingle();
        if (racedEvent?.processed) {
          return NextResponse.json({ received: true, duplicate: true, eventId });
        }
      } else {
        throw new Error(`Could not persist webhook event: ${insertEventError.message}`);
      }
    }
  }

  try {
    // Subscription orders use platform Razorpay credentials and never release print jobs.
    const providerOrder = rzpOrderId ? await fetchRazorpayOrder(rzpOrderId, shopCredentials) : null;
    if (rzpOrderId && !providerOrder) throw new Error("Could not fetch Razorpay order; retry event.");
    if ((providerOrder?.notes as Record<string, string> | undefined)?.purpose === "shop_subscription") {
      if (["payment.captured", "order.paid"].includes(eventType)) {
        if (!rzpPaymentId) throw new Error("Missing subscription payment ID.");
        await activateSubscriptionPayment(adminClient, rzpPaymentId);
      }
      const { error } = await adminClient
        .from("payment_webhook_events")
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq("event_id", eventId);
      if (error) throw error;
      return NextResponse.json({ received: true, eventId });
    }

    if (rzpOrderId || orderIdFromNotes) {
      // Find matching payment in our database
      let paymentQuery = adminClient
        .from("payments")
        .select("id, order_id, status, amount, currency, metadata, provider_order_id");
      if (rzpOrderId) {
        paymentQuery = paymentQuery.eq("provider_order_id", rzpOrderId);
      } else {
        paymentQuery = paymentQuery.eq("order_id", orderIdFromNotes);
      }

      const { data: payment } = await paymentQuery.maybeSingle();

      if (!payment && ["payment.captured", "order.paid"].includes(eventType))
        throw new Error("Payment record is not available yet; retry this event.");
      if (payment) {
        if (eventType === "payment.captured" || eventType === "order.paid") {
          if (
            !paymentEntity ||
            !capturedPaymentMatches(paymentEntity, {
              providerOrderId: payment.provider_order_id,
              amountPaise: toPaise(Number(payment.amount)),
              currency: payment.currency,
            })
          )
            throw new Error("Captured payment does not match the stored order, amount, and currency.");
          const verifiedAt = new Date().toISOString();
          const paymentMethod = String(paymentEntity?.method || "razorpay");

          if (payment.status !== "verified") {
            const { data: verifiedPayment, error: verificationError } = await adminClient
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
              .eq("id", payment.id)
              .neq("status", "verified")
              .select("id")
              .maybeSingle();

            if (verificationError) throw new Error(verificationError.message);
            if (verifiedPayment) {
              const { error: txError } = await adminClient.from("payment_transactions").insert({
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
              if (txError) console.error("Webhook payment_transactions insert error:", txError);
            }
          }
          await releasePaidOrder(adminClient, payment.order_id);
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
              .eq("id", payment.id)
              .neq("status", "verified");

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
