import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Public order tracking endpoint — returns only safe, non-sensitive fields.
 * No auth required; customers can check status by order public_id.
 * Never exposes: shop owner details, pricing rules, agent info, customer PII.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: "Missing order id." }, { status: 400 });
  }

  // Use admin client to look up by public_id (no customer auth required for tracking)
  const adminClient = createSupabaseAdminClient();
  const client = adminClient ?? (await createSupabaseServerClient());
  if (!client) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const { data: order } = await client
    .from("orders")
    .select(`
      id,
      public_id,
      status,
      total_amount,
      total_pages,
      created_at,
      shops ( name ),
      payments ( status, provider_payment_id ),
      print_jobs (
        id,
        status,
        total_pages,
        documents ( original_filename )
      )
    `)
    .or(`public_id.eq.${id},id.eq.${id}`)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ found: false });
  }

  const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
  const shop = Array.isArray(order.shops) ? order.shops[0] : order.shops;
  const jobs = Array.isArray(order.print_jobs) ? order.print_jobs : [];

  // Return only safe public fields — no customer PII, no shop owner details
  return NextResponse.json({
    publicId: order.public_id || order.id.slice(0, 8).toUpperCase(),
    status: order.status,
    shopName: (shop as { name?: string } | null)?.name || "PrintSathi Shop",
    totalAmount: Number(order.total_amount),
    totalPages: order.total_pages,
    createdAt: order.created_at,
    paymentStatus: (payment as { status?: string } | null)?.status || "pending",
    paymentTxnId: (payment as { provider_payment_id?: string } | null)?.provider_payment_id || null,
    jobs: jobs.map((job) => {
      const docs = Array.isArray(job.documents) ? job.documents : job.documents ? [job.documents] : [];
      return {
        id: job.id,
        status: job.status,
        pages: job.total_pages,
        filename: (docs[0] as { original_filename?: string } | null)?.original_filename || null,
      };
    }),
  });
}
