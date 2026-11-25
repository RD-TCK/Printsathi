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

  const { data: existingOrder, error: fetchError } = await adminClient
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: "Could not inspect order." }, { status: 500 });
  }
  if (!existingOrder) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (existingOrder.status === "completed") {
    return NextResponse.json({ error: "Completed orders cannot be cancelled." }, { status: 409 });
  }
  if (existingOrder.status === "cancelled") {
    return NextResponse.json({ success: true, message: "Order already cancelled." });
  }

  // Update order status to cancelled
  const { error: orderError } = await adminClient
    .from("orders")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("shop_id", shopId)
    .neq("status", "completed");

  if (orderError) {
    return NextResponse.json({ error: "Could not cancel order." }, { status: 500 });
  }

  // Update uncompleted print jobs to cancelled
  const { error: jobsError } = await adminClient
    .from("print_jobs")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .eq("shop_id", shopId)
    .neq("status", "completed");

  if (jobsError) {
    return NextResponse.json({ error: "Order cancelled, but print job cancellation failed." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: "Order cancelled.",
  });
}
