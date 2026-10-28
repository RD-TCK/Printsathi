import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";
import { releasePaidOrder } from "@/lib/release-paid-order";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let shopId: string | null = null;

  // Check agent auth first
  const agentAuth = await authenticateAgent(request);
  if (agentAuth) {
    shopId = agentAuth.shop.id;
  } else {
    // Check shop owner session auth
    const client = await createSupabaseServerClient();
    if (client) {
      const {
        data: { user },
      } = await client.auth.getUser();

      if (user) {
        const { data: member } = await client
          .from("shop_members")
          .select("shop_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (member) {
          shopId = member.shop_id;
        }
      }
    }
  }

  if (!shopId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { orderId, duplexStep } = body;

  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: "Missing or invalid orderId." }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service unavailable." }, { status: 503 });
  }

  // Fetch the order
  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id, status, total_amount, token_number, total_pages, expires_at, color_pages, created_at")
    .eq("id", orderId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Reject print approval if the counter order validity has expired
  const orderExpiresAt = order.expires_at
    ? new Date(order.expires_at)
    : order.created_at
      ? new Date(new Date(order.created_at).getTime() + 60 * 60 * 1000)
      : null;
  const isExpired =
    !["paid", "completed", "partially_printed"].includes(order.status) &&
    (order.status === "expired" || (orderExpiresAt ? orderExpiresAt.getTime() <= Date.now() : false));

  const displayToken = order.token_number ? String(order.token_number) : order.id.slice(0, 8);

  if (isExpired) {
    return NextResponse.json(
      {
        error: `Token #${displayToken} has expired (tokens have 1-hour validity). Please ask the customer to generate a new token.`,
      },
      { status: 410 },
    );
  }

  // 1. Handle Duplex Step 2 ("Print Next Side") vs Step 1 / Single-Sided
  const isEvenStep = duplexStep === "even";
  const isOddStep = duplexStep === "odd";

  if (isEvenStep) {
    // Idempotency guard for "Print Next Side" (even step):
    // If the even-step jobs are already queued, printing, or completed, don't re-queue them.
    const { data: existingJobs } = await adminClient
      .from("print_jobs")
      .select("id, status, duplex_step")
      .eq("order_id", order.id)
      .eq("shop_id", shopId);

    const alreadyQueuedOrDone = existingJobs?.some(
      (j) => j.duplex_step === "even" && ["queued", "printing", "print_submitted", "completed"].includes(j.status),
    );
    if (alreadyQueuedOrDone) {
      return NextResponse.json({
        success: true,
        message: `Token #${displayToken}: Back side is already queued or printed.`,
        order: { id: order.id, publicId: displayToken, tokenNumber: order.token_number, status: order.status },
      });
    }

    // Transition odd-printed or failed even jobs to even step
    await adminClient
      .from("print_jobs")
      .update({
        status: "queued",
        duplex_step: "even",
        claimed_by_agent_id: null,
        claim_expires_at: null,
        print_attempts: 0,
        failure_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", order.id)
      .eq("shop_id", shopId)
      .in("duplex_step", ["odd", "odd_printed", "even"]);

    await adminClient
      .from("orders")
      .update({
        status: "partially_printed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("shop_id", shopId);
  } else {
    // 1. Create or update verified counter payment record
    const providerPaymentId = `counter_${order.id.slice(0, 8)}_${Date.now()}`;
    const { error: paymentError } = await adminClient.from("payments").insert({
      order_id: order.id,
      provider: "counter",
      payment_method: "counter_cash",
      status: "verified",
      provider_payment_id: providerPaymentId,
      amount: order.total_amount,
      currency: "INR",
      verified_at: new Date().toISOString(),
    });

    if (paymentError) {
      // If unique constraint triggers on order_id, update the existing payment
      await adminClient
        .from("payments")
        .update({
          provider: "counter",
          payment_method: "counter_cash",
          status: "verified",
          provider_payment_id: providerPaymentId,
          amount: order.total_amount,
          verified_at: new Date().toISOString(),
        })
        .eq("order_id", order.id);
    }

    // 2. Safely release paid order to print queue using the exact same atomic pipeline as Pay Online!
    // This updates orders and print_jobs to queued/partially_printed safely without wiping active claims.
    await releasePaidOrder(adminClient, order.id);
  }

  // Fetch current jobs and order status for response
  const [{ data: refreshedOrder }, { data: jobs }] = await Promise.all([
    adminClient.from("orders").select("id, token_number, status").eq("id", order.id).maybeSingle(),
    adminClient.from("print_jobs").select("id, status, document_id, total_pages, duplex_step").eq("order_id", order.id),
  ]);

  const targetOrderStatus = refreshedOrder?.status || (isOddStep ? "partially_printed" : "paid");
  const targetDuplexStep = isOddStep ? "odd" : isEvenStep ? "even" : "none";

  const stepMessage = isOddStep
    ? `Token #${displayToken}: Odd pages (Front Side) queued! Flip sheets and reload in tray for back side once printed.`
    : isEvenStep
      ? `Token #${displayToken}: Even pages (Back Side) queued! Job complete.`
      : `Token #${displayToken} approved for printing.`;

  return NextResponse.json({
    success: true,
    message: stepMessage,
    order: {
      id: order.id,
      publicId: displayToken,
      tokenNumber: order.token_number,
      status: targetOrderStatus,
      duplexStep: targetDuplexStep,
    },
    jobs: jobs || [],
  });
}
