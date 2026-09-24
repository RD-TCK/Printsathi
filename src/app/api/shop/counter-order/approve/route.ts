import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";

export const dynamic = "force-dynamic";

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
    .select("id, public_id, status, total_amount, token_number, expires_at, payment_mode")
    .eq("id", orderId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.status === "paid" && duplexStep !== "even") {
    return NextResponse.json({
      success: true,
      message: "Order is already fully approved and printed.",
      order: { id: order.id, status: order.status, tokenNumber: order.token_number },
    });
  }

  // Idempotency guard for "Print Next Side" (even step):
  // If the even-step jobs are already queued or printing, don't re-queue them.
  if (duplexStep === "even") {
    const { data: existingJobs } = await adminClient
      .from("print_jobs")
      .select("id, status, duplex_step")
      .eq("order_id", orderId)
      .eq("shop_id", shopId);
    const alreadyQueued = existingJobs?.some(
      (j) => j.duplex_step === "even" && ["queued", "printing", "submitted"].includes(j.status)
    );
    if (alreadyQueued) {
      return NextResponse.json({
        success: true,
        message: `Token #${order.token_number || order.public_id}: Back side is already queued for printing.`,
        order: { id: order.id, publicId: order.public_id, tokenNumber: order.token_number, status: order.status },
      });
    }
  }

  // 1. Create verified counter payment record
  // Only insert/update payment on the first approval (odd step or single-sided).
  // For "Print Next Side" (even step), the payment record already exists from Step 1.
  const isEvenStep = duplexStep === "even";
  if (!isEvenStep) {
    const providerPaymentId = `counter_${order.public_id}_${Date.now()}`;
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
  }

  // Determine status and duplex step
  const isOddStep = duplexStep === "odd";

  const targetOrderStatus = isOddStep ? "partially_printed" : "paid";
  const targetJobStatus = "queued";
  const targetDuplexStep = isOddStep ? "odd" : isEvenStep ? "even" : "none";

  // 2. Update order status
  const { error: updateOrderError } = await adminClient
    .from("orders")
    .update({
      status: targetOrderStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("shop_id", shopId);

  if (updateOrderError) {
    return NextResponse.json({ error: "Could not update order status." }, { status: 500 });
  }

  // 3. Update print jobs status to queued and update duplex_step
  await adminClient
    .from("print_jobs")
    .update({
      status: targetJobStatus,
      duplex_step: targetDuplexStep,
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", order.id)
    .eq("shop_id", shopId);

  // 4. Fetch the jobs for response
  const { data: jobs } = await adminClient
    .from("print_jobs")
    .select("id, status, document_id, total_pages, duplex_step")
    .eq("order_id", order.id);

  const stepMessage = isOddStep
    ? `Token #${order.token_number || order.public_id}: Odd pages (Front Side) printed! Flip sheets and reload in tray for back side.`
    : isEvenStep
    ? `Token #${order.token_number || order.public_id}: Even pages (Back Side) printed! Job complete.`
    : `Token #${order.token_number || order.public_id} approved for printing.`;

  return NextResponse.json({
    success: true,
    message: stepMessage,
    order: {
      id: order.id,
      publicId: order.public_id,
      tokenNumber: order.token_number,
      status: targetOrderStatus,
      duplexStep: targetDuplexStep,
    },
    jobs: jobs || [],
  });
}
