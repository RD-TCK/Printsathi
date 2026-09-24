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

  // Calculate midnight (00:00:00) of today in Indian Standard Time (Asia/Kolkata)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istStartOfDay = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 0, 0, 0) - istOffset);

  // Fetch shop settings for payment mode
  const { data: settings } = await adminClient
    .from("shop_settings")
    .select("payment_mode")
    .eq("shop_id", shopId)
    .maybeSingle();

  // Fetch counter orders created today (IST)
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
        total_amount,
        duplex_step,
        print_job_pages (
          side_mode,
          start_page,
          end_page,
          copies
        )
      )
    `
    )
    .eq("shop_id", shopId)
    .eq("payment_mode", "counter")
    .gte("created_at", istStartOfDay.toISOString())
    .order("token_number", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const queueItems = (orders || []).map((o) => {
    const expiresAt = o.expires_at ? new Date(o.expires_at) : null;
    const isExpired = o.status === "awaiting_payment" && expiresAt ? expiresAt.getTime() < now.getTime() : false;
    const remainingSeconds = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)) : 0;

    const rawJobs = Array.isArray(o.print_jobs) ? o.print_jobs : [];
    
    // Check if any job/page range has double-sided mode and collect copies info
    let isDoubleSided = false;
    let duplexStep: "none" | "odd_pending" | "odd_printed" | "even_pending" | "completed" = "none";
    const copiesDescriptions: string[] = [];

    for (const j of rawJobs) {
      if (j.duplex_step && j.duplex_step !== "none") {
        duplexStep = j.duplex_step;
      }
      const rawPages = Array.isArray(j.print_job_pages) ? j.print_job_pages : [];
      for (const p of rawPages as Array<{ side_mode?: string; start_page: number; end_page: number; copies?: number }>) {
        if (p.side_mode === "double_sided") {
          isDoubleSided = true;
        }
        const copies = p.copies ?? 1;
        const pageLabel = p.start_page === p.end_page ? `Page ${p.start_page}` : `Pages ${p.start_page}–${p.end_page}`;
        if (copies > 1) {
          copiesDescriptions.push(`${copies} Copies of ${pageLabel}`);
        } else {
          copiesDescriptions.push(`1 Copy of ${pageLabel}`);
        }
      }
    }

    const totalPages = o.total_pages || 0;
    const oddPagesCount = Math.ceil(totalPages / 2);
    const evenPagesCount = Math.floor(totalPages / 2);

    return {
      id: o.id,
      publicId: o.public_id,
      tokenNumber: o.token_number,
      status: isExpired ? "expired" : o.status,
      totalAmount: Number(o.total_amount),
      totalPages,
      colorPages: o.color_pages,
      blackAndWhitePages: o.black_and_white_pages,
      sideMode: isDoubleSided ? "double_sided" : "single_sided",
      copiesSummary: copiesDescriptions.length > 0 ? copiesDescriptions.join(", ") : undefined,
      duplexStep,
      oddPagesCount,
      evenPagesCount,
      expiresAt: o.expires_at,
      remainingSeconds,
      isExpired,
      createdAt: o.created_at,
      documents: (Array.isArray(o.documents) ? o.documents : []).map((d) => ({
        id: d.id,
        filename: d.original_filename,
        pageCount: d.page_count,
      })),
      jobs: rawJobs.map((j) => ({
        id: j.id,
        status: j.status,
        totalPages: j.total_pages,
        duplexStep: j.duplex_step || "none",
        pages: (Array.isArray(j.print_job_pages) ? j.print_job_pages : []).map(
          (p: { start_page: number; end_page: number; copies?: number; side_mode?: string }) => ({
            startPage: p.start_page,
            endPage: p.end_page,
            copies: p.copies ?? 1,
            sideMode: p.side_mode || "single_sided",
          })
        ),
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
