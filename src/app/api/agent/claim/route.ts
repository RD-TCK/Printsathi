import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";

const claimSchema = z.object({
  leaseSeconds: z.number().int().min(30).max(3600).default(300),
});

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized agent." }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is allowed
  }

  const parsed = claimSchema.safeParse(body);
  const leaseSeconds = parsed.success ? parsed.data.leaseSeconds : 300;

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service not configured." }, { status: 503 });
  }

  // 1. Call atomic claim RPC
  const { data: claimedRows, error: claimError } = await adminClient.rpc("claim_next_print_job", {
    p_agent_id: auth.agent.id,
    p_shop_id: auth.shop.id,
    p_lease_seconds: leaseSeconds,
  });

  if (claimError) {
    return NextResponse.json({ error: claimError.message || "Failed to claim print job." }, { status: 500 });
  }

  const claimed = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
  if (!claimed || !claimed.job_id) {
    return NextResponse.json({ success: true, job: null });
  }

  // 2. Fetch page ranges / configurations for this job
  const { data: pages } = await adminClient
    .from("print_job_pages")
    .select("start_page, end_page, color_mode, paper_size")
    .eq("print_job_id", claimed.job_id)
    .order("start_page", { ascending: true });

  // 3. Fetch default printer for this shop
  const { data: defaultPrinter } = await adminClient
    .from("printers")
    .select("name, system_identifier")
    .eq("shop_id", auth.shop.id)
    .eq("is_default", true)
    .maybeSingle();

  return NextResponse.json({
    success: true,
    job: {
      id: claimed.job_id,
      orderId: claimed.order_id,
      documentId: claimed.document_id,
      shopId: claimed.shop_id,
      totalPages: claimed.total_pages,
      totalAmount: Number(claimed.total_amount),
      currency: claimed.currency,
      printAttempts: claimed.print_attempts,
      maxAttempts: claimed.max_attempts,
      claimedAt: claimed.claimed_at,
      claimExpiresAt: claimed.claim_expires_at,
      defaultPrinter: defaultPrinter?.name || null,
      document: {
        id: claimed.document_id,
        storagePath: claimed.document_storage_path,
        originalFilename: claimed.document_original_filename,
        mimeType: claimed.document_mime_type,
        sizeBytes: Number(claimed.document_size_bytes),
        pageCount: claimed.document_page_count,
      },
      pagesConfig: (pages ?? []).map((p) => ({
        startPage: p.start_page,
        endPage: p.end_page,
        colorMode: p.color_mode,
        paperSize: p.paper_size,
      })),
    },
  });
}
