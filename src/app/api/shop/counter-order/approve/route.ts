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
  const { orderId } = body;

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

  if (order.status === "paid" || order.status === "completed") {
    return NextResponse.json({
      success: true,
      message: "Order is already approved.",
      order: { id: order.id, status: order.status, tokenNumber: order.token_number },
    });
  }

  // 1. Create verified counter payment record
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

  // 2. Update order status to paid
  const { error: updateOrderError } = await adminClient
    .from("orders")
    .update({
      status: "paid",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("shop_id", shopId);

  if (updateOrderError) {
    return NextResponse.json({ error: "Could not update order status." }, { status: 500 });
  }

  // 3. Update print jobs status to paid / queued
  await adminClient
    .from("print_jobs")
    .update({
      status: "paid",
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", order.id)
    .eq("shop_id", shopId)
    .in("status", ["draft", "awaiting_payment"]);

  // 4. Fetch the jobs for response
  const { data: jobs } = await adminClient
    .from("print_jobs")
    .select("id, status, document_id, total_pages")
    .eq("order_id", order.id);

  return NextResponse.json({
    success: true,
    message: `Token #${order.token_number || order.public_id} approved for printing.`,
    order: {
      id: order.id,
      publicId: order.public_id,
      tokenNumber: order.token_number,
      status: "paid",
    },
    jobs: jobs || [],
  });
}
