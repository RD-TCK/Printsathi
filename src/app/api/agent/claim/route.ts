import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";
import { paymentCanPrint } from "@/lib/mock-payments";

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

  const { data: verifiedPayment } = await adminClient.from("payments").select("id, provider, status, provider_payment_id, metadata")
    .eq("order_id", claimed.order_id).eq("status", "verified")
    .not("provider_payment_id", "is", null).limit(1);
  if (!verifiedPayment?.some(paymentCanPrint)) {
    await adminClient.rpc("fail_print_job", { p_job_id: claimed.job_id, p_agent_id: auth.agent.id,
      p_reason: "Payment is not eligible for printing. Mock payments require the server testing setting.", p_is_retryable: false });
    return NextResponse.json({ success: true, job: null });
  }

  // 2. Fetch page ranges / configurations for this job
  const { data: pages, error: pagesError } = await adminClient
    .from("print_job_pages")
    .select("start_page, end_page, color_mode, paper_size")
    .eq("print_job_id", claimed.job_id)
    .order("start_page", { ascending: true });

  if (pagesError || !pages?.length) {
    await adminClient.rpc("fail_print_job", {
      p_job_id: claimed.job_id, p_agent_id: auth.agent.id,
      p_reason: "Print settings could not be loaded. No document was sent to the printer.",
      p_is_retryable: Boolean(pagesError),
    });
    return NextResponse.json({ error: "Could not load the customer's print settings." }, { status: 503 });
  }

  // 3. Fetch default printer for this shop
  const { data: defaultPrinter } = await adminClient
    .from("printers")
    .select("name, system_identifier")
    .eq("shop_id", auth.shop.id)
    .eq("desktop_agent_id", auth.agent.id)
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
