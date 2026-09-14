import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hashGuestOrderToken } from "@/lib/guest-order";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");
  const accessToken = searchParams.get("accessToken");

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId parameter" }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service not configured" }, { status: 503 });
  }

  // Fetch order
  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select(
      "id, public_id, shop_id, customer_id, status, total_amount, currency, total_pages, color_pages, black_and_white_pages, guest_access_token_hash, created_at",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Authorization check
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
      if (user && order.customer_id === user.id) {
        isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized access to order" }, { status: 403 });
  }

  // Fetch payment and print jobs
  const [{ data: payment }, { data: printJobs }, { data: shop }] = await Promise.all([
    adminClient
      .from("payments")
      .select(
        "id, status, provider_order_id, provider_payment_id, payment_method, amount, currency, verified_at, error_code, error_description, created_at",
      )
      .eq("order_id", order.id)
      .maybeSingle(),
    adminClient
      .from("print_jobs")
      .select("id, status, total_pages, total_amount, failure_reason, created_at")
      .eq("order_id", order.id),
    adminClient.from("shops").select("id, name, public_id").eq("id", order.shop_id).maybeSingle(),
  ]);

  const isPaymentVerified = payment?.status === "verified";
  const isPrintingEligible =
    isPaymentVerified && (order.status === "paid" || order.status === "completed" || order.status === "printing");

  return NextResponse.json({
    order: {
      id: order.id,
      publicId: order.public_id,
      status: order.status,
      totalAmount: Number(order.total_amount),
      currency: order.currency,
      totalPages: order.total_pages,
      colorPages: order.color_pages,
      blackAndWhitePages: order.black_and_white_pages,
      createdAt: order.created_at,
    },
    shop: shop ? { name: shop.name, publicId: shop.public_id } : null,
    payment: payment
      ? {
          id: payment.id,
          status: payment.status,
          isVerified: isPaymentVerified,
          providerOrderId: payment.provider_order_id,
          providerPaymentId: payment.provider_payment_id,
          paymentMethod: payment.payment_method,
          amount: Number(payment.amount),
          currency: payment.currency,
          verifiedAt: payment.verified_at,
          errorCode: payment.error_code,
          errorDescription: payment.error_description,
        }
      : null,
    printJobs: (printJobs || []).map((j) => ({
      id: j.id,
      status: j.status,
      totalPages: j.total_pages,
      amount: Number(j.total_amount),
      failureReason: j.failure_reason,
    })),
    isPrintingEligible,
  });
}
