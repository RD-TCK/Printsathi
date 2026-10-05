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
    .select("id, public_id, status, shop_id, shops(id, public_id, name)")
    .eq("id", orderId)
    .eq("guest_access_token_hash", tokenHash)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order draft not found or expired." }, { status: 404 });
  }

  if (order.status !== "draft") {
    return NextResponse.json(
      { error: "Order has already been submitted or completed.", status: order.status },
      { status: 409 }
    );
  }

  const { data: docs, error: docError } = await client
    .from("documents")
    .select("id, original_filename, page_count, size_bytes")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (docError || !docs || docs.length === 0) {
    return NextResponse.json({ error: "No documents attached to this order draft." }, { status: 404 });
  }

  return NextResponse.json({
    orderId: order.id,
    orderPublicId: order.public_id,
    accessToken,
    shop: order.shops,
    documents: docs.map((doc) => ({
      id: doc.id,
      filename: doc.original_filename,
      pageCount: doc.page_count,
      sizeBytes: doc.size_bytes,
    })),
  });
}
