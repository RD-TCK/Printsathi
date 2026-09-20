import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
    return NextResponse.json({ error: "Unauthorized access." }, { status: 401 });
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service unavailable." }, { status: 503 });
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Fetch shop settings for payment mode
  const { data: settings } = await adminClient
    .from("shop_settings")
    .select("payment_mode")
    .eq("shop_id", shopId)
    .maybeSingle();

  // Fetch counter orders created today
  const { data: orders, error } = await adminClient
    .from("orders")
    .select(
      `
      id,
      public_id,
      status,
      token_number,
      payment_mode,
      total_amount,
      total_pages,
      color_pages,
      black_and_white_pages,
      expires_at,
      created_at,
      documents (
        id,
        original_filename,
        page_count
      ),
      print_jobs (
        id,
        status,
        total_pages,
        total_amount
      )
    `
    )
    .eq("shop_id", shopId)
    .eq("payment_mode", "counter")
    .gte("created_at", startOfToday.toISOString())
    .order("token_number", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  const queueItems = (orders || []).map((o) => {
    const expiresAt = o.expires_at ? new Date(o.expires_at) : null;
    const isExpired = o.status === "awaiting_payment" && expiresAt ? expiresAt.getTime() < now.getTime() : false;
    const remainingSeconds = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)) : 0;

    return {
      id: o.id,
      publicId: o.public_id,
      tokenNumber: o.token_number,
      status: isExpired ? "expired" : o.status,
      totalAmount: Number(o.total_amount),
      totalPages: o.total_pages,
      colorPages: o.color_pages,
      blackAndWhitePages: o.black_and_white_pages,
      expiresAt: o.expires_at,
      remainingSeconds,
      isExpired,
      createdAt: o.created_at,
      documents: (Array.isArray(o.documents) ? o.documents : []).map((d) => ({
        id: d.id,
        filename: d.original_filename,
        pageCount: d.page_count,
      })),
      jobs: (Array.isArray(o.print_jobs) ? o.print_jobs : []).map((j) => ({
        id: j.id,
        status: j.status,
        totalPages: j.total_pages,
      })),
    };
  });

  const pendingActive = queueItems.filter((item) => item.status === "awaiting_payment" && !item.isExpired);

  return NextResponse.json({
    queue: queueItems,
    pendingCount: pendingActive.length,
    paymentMode: settings?.payment_mode || "both",
  });
}
