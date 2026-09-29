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
    .select("start_page, end_page, color_mode, paper_size, side_mode, copies")
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

  // 3. Fetch default printer and duplex_step for this job
  const { data: defaultPrinter } = await adminClient
    .from("printers")
    .select("name, system_identifier")
    .eq("shop_id", auth.shop.id)
    .eq("desktop_agent_id", auth.agent.id)
    .eq("is_default", true)
    .maybeSingle();

  const { data: jobDetails } = await adminClient
    .from("print_jobs")
    .select("duplex_step, duplex_printer_name")
    .eq("id", claimed.job_id)
    .maybeSingle();

  const isDoubleSided = (pages ?? []).some((p) => p.side_mode === "double_sided");
  let effectiveDuplexStep = jobDetails?.duplex_step || "none";
  if (isDoubleSided && (effectiveDuplexStep === "none" || !effectiveDuplexStep || effectiveDuplexStep === "odd_pending")) {
    effectiveDuplexStep = "odd";
  }

  // For even-step jobs, the printer that processed the odd (front) side is persisted
  // in duplex_printer_name. Return it as requiredPrinterName so the daemon is forced
  // to route the back-side to the same physical printer, even after an agent restart.
  const requiredPrinterName = effectiveDuplexStep === "even" ? (jobDetails?.duplex_printer_name ?? null) : null;

  // Resolve pagesConfig dynamically on the server:
  // For double-sided steps (odd or even), break the ranges down into exact individual odd or even pages.
  // This allows ALL existing desktop agents in the field to slice and print odd/even passes perfectly
  // without needing any agent updates or re-downloads.
  const resolvedPagesConfig: Array<{
    startPage: number;
    endPage: number;
    colorMode: "color" | "black_and_white";
    paperSize: "a4" | "a3";
    sideMode: "single_sided" | "double_sided";
    copies: number;
  }> = [];

  for (const p of pages ?? []) {
    const start = Math.max(1, p.start_page);
    const end = Math.max(start, p.end_page);
    const copies = Math.max(1, p.copies ?? 1);
    const colorMode = (p.color_mode || "black_and_white") as "color" | "black_and_white";
    const paperSize = (p.paper_size || "a4") as "a4" | "a3";
    const isDouble = p.side_mode === "double_sided" || isDoubleSided;

    if (isDouble && (effectiveDuplexStep === "odd" || effectiveDuplexStep === "even")) {
      for (let i = start; i <= end; i++) {
        if (effectiveDuplexStep === "odd" && i % 2 === 1) {
          resolvedPagesConfig.push({
            startPage: i,
            endPage: i,
            colorMode,
            paperSize,
            sideMode: "single_sided",
            copies,
          });
        } else if (effectiveDuplexStep === "even" && i % 2 === 0) {
          resolvedPagesConfig.push({
            startPage: i,
            endPage: i,
            colorMode,
            paperSize,
            sideMode: "single_sided",
            copies,
          });
        }
      }
    } else {
      resolvedPagesConfig.push({
        startPage: start,
        endPage: end,
        colorMode,
        paperSize,
        sideMode: (p.side_mode as "single_sided" | "double_sided") || "single_sided",
        copies,
      });
    }
  }

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
      // For even-step duplex jobs: the exact printer that printed the front (odd) side.
      // The agent MUST route the back (even) side to this printer.
      requiredPrinterName,
      duplexStep: effectiveDuplexStep,
      document: {
        id: claimed.document_id,
        storagePath: claimed.document_storage_path,
        originalFilename: claimed.document_original_filename,
        mimeType: claimed.document_mime_type,
        sizeBytes: Number(claimed.document_size_bytes),
        pageCount: claimed.document_page_count,
      },
      pagesConfig: resolvedPagesConfig,
    },
  });
}
