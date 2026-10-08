import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hashGuestOrderToken } from "@/lib/guest-order";

export const runtime = "nodejs";

const QuerySchema = z.object({
  orderId: z.string().uuid(),
  accessToken: z.string().min(10),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    orderId: url.searchParams.get("orderId"),
    accessToken: url.searchParams.get("accessToken") || url.searchParams.get("token"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Missing or invalid order parameters." }, { status: 400 });
  }

  const { orderId, accessToken } = parsed.data;
  const client = createSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const tokenHash = hashGuestOrderToken(accessToken);

  const { data: order, error: orderError } = await client
    .from("orders")
    .select(
      "id, public_id, status, shop_id, token_number, total_amount, total_pages, color_pages, black_and_white_pages, expires_at, payment_mode, shops(id, public_id, name)",
    )
    .eq("id", orderId)
    .eq("guest_access_token_hash", tokenHash)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order draft not found or expired." }, { status: 404 });
  }

  const { data: docs } = await client
    .from("documents")
    .select("id, original_filename, page_count, size_bytes")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (order.status !== "draft") {
    return NextResponse.json({
      orderId: order.id,
      orderPublicId: order.public_id,
      accessToken,
      status: order.status,
      isAlreadySubmitted: true,
      tokenNumber: order.token_number,
      totalAmount: order.total_amount,
      totalPages: order.total_pages,
      colorPages: order.color_pages,
      blackAndWhitePages: order.black_and_white_pages,
      expiresAt: order.expires_at,
      paymentMode: order.payment_mode,
      shop: order.shops,
      documents: (docs || []).map((doc) => ({
        id: doc.id,
        filename: doc.original_filename,
        pageCount: doc.page_count,
        sizeBytes: doc.size_bytes,
      })),
    });
  }

  if (!docs || docs.length === 0) {
    return NextResponse.json({ error: "No documents attached to this order draft." }, { status: 404 });
  }

  return NextResponse.json({
    orderId: order.id,
    orderPublicId: order.public_id,
    accessToken,
    status: order.status,
    isAlreadySubmitted: false,
    shop: order.shops,
    documents: docs.map((doc) => ({
      id: doc.id,
      filename: doc.original_filename,
      pageCount: doc.page_count,
      sizeBytes: doc.size_bytes,
    })),
  });
}
