import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";
import { paymentCanPrint } from "@/lib/mock-payments";

const claimSchema = z.object({
  leaseSeconds: z.number().int().min(10).max(3600).default(45),
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

  const { data: verifiedPayment } = await adminClient
    .from("payments")
    .select("id, provider, status, provider_payment_id, metadata")
    .eq("order_id", claimed.order_id)
    .eq("status", "verified")
    .not("provider_payment_id", "is", null)
    .limit(1);
  if (!verifiedPayment?.some(paymentCanPrint)) {
    await adminClient.rpc("fail_print_job", {
      p_job_id: claimed.job_id,
      p_agent_id: auth.agent.id,
      p_reason: "Payment is not eligible for printing. Mock payments require the server testing setting.",
      p_is_retryable: false,
    });
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
      p_job_id: claimed.job_id,
      p_agent_id: auth.agent.id,
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
  if (
    isDoubleSided &&
    (effectiveDuplexStep === "none" || !effectiveDuplexStep || effectiveDuplexStep === "odd_pending")
  ) {
    effectiveDuplexStep = "odd";
  }

  // For even-step jobs, the printer that processed the odd (front) side is persisted
  // in duplex_printer_name. Return it as requiredPrinterName so the daemon is forced
  // to route the back-side to the same physical printer, even after an agent restart.
  const requiredPrinterName = effectiveDuplexStep === "even" ? (jobDetails?.duplex_printer_name ?? null) : null;

  // Resolve pagesConfig dynamically:
  // Preserve intact ranges so the desktop agent can perform proper multi-copy collation
  // and blank-page sheet alignment for both hardware and manual duplex.
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

    resolvedPagesConfig.push({
      startPage: start,
      endPage: end,
      colorMode,
      paperSize,
      sideMode: isDouble ? "double_sided" : "single_sided",
      copies,
    });
  }

  // Check for any sibling queued/paid jobs for the same order that can be batched together
  const siblingJobs: Array<{
    id: string;
    orderId: string;
    documentId: string;
    shopId: string;
    totalPages: number;
    totalAmount: number;
    currency: string;
    printAttempts: number;
    maxAttempts: number;
    defaultPrinter: string | null;
    requiredPrinterName: string | null;
    duplexStep: string;
    document: {
      id: string;
      storagePath: string;
      originalFilename: string;
      mimeType: string;
      sizeBytes: number;
      pageCount: number;
    };
    pagesConfig: typeof resolvedPagesConfig;
    isLastJobForOrder: boolean;
  }> = [];

  if (claimed.order_id && effectiveDuplexStep !== "odd") {
    const { data: rawSiblings, error: sibErr } = await adminClient
      .from("print_jobs")
      .select(
        "id, order_id, document_id, shop_id, status, total_pages, total_amount, currency, print_attempts, max_attempts, duplex_step, duplex_printer_name",
      )
      .eq("order_id", claimed.order_id)
      .neq("id", claimed.job_id)
      .in("status", ["queued", "paid", "awaiting_payment"])
      .order("created_at", { ascending: true });

    if (sibErr) {
      console.error(`Failed to query sibling jobs for order ${claimed.order_id}:`, sibErr);
    }

    if (rawSiblings && rawSiblings.length > 0) {
      const siblingDocIds = Array.from(new Set(rawSiblings.map((s) => s.document_id).filter(Boolean)));
      const { data: docs } = await adminClient
        .from("documents")
        .select("id, storage_path, original_filename, mime_type, size_bytes, page_count")
        .in("id", siblingDocIds);
      const docsMap = new Map((docs || []).map((d) => [d.id, d]));

      const siblingJobIds = rawSiblings.map((s) => s.id);
      const { data: allPages } = await adminClient
        .from("print_job_pages")
        .select("print_job_id, start_page, end_page, color_mode, paper_size, side_mode, copies")
        .in("print_job_id", siblingJobIds)
        .order("start_page", { ascending: true });

      const pagesMap = new Map<
        string,
        Array<{
          start_page: number;
          end_page: number;
          color_mode?: string;
          paper_size?: string;
          side_mode?: string;
          copies?: number;
        }>
      >();
      for (const p of allPages || []) {
        const list = pagesMap.get(p.print_job_id) || [];
        list.push(p);
        pagesMap.set(p.print_job_id, list);
      }

      // Filter to siblings that have an existing document record
      const validSiblings = rawSiblings.filter((s) => docsMap.has(s.document_id));
      const validSiblingIds = validSiblings.map((s) => s.id);

      if (validSiblingIds.length > 0) {
        await adminClient
          .from("print_jobs")
          .update({
            status: "claimed",
            claimed_by_agent_id: auth.agent.id,
            claimed_at: new Date().toISOString(),
            claim_expires_at: new Date(Date.now() + leaseSeconds * 1000).toISOString(),
            print_attempts: 1,
          })
          .in("id", validSiblingIds);

        for (let sIdx = 0; sIdx < validSiblings.length; sIdx++) {
          const s = validSiblings[sIdx];
          const sDoc = docsMap.get(s.document_id)!;
          let sPages = pagesMap.get(s.id) || [];
          if (!sPages.length) {
            sPages = [
              {
                start_page: 1,
                end_page: Math.max(1, sDoc.page_count || s.total_pages || 1),
                color_mode: "black_and_white",
                paper_size: "a4",
                side_mode: "single_sided",
                copies: 1,
              },
            ];
          }

          const sResolvedPages = sPages.map((p) => ({
            startPage: Math.max(1, p.start_page),
            endPage: Math.max(Math.max(1, p.start_page), p.end_page),
            colorMode: (p.color_mode || "black_and_white") as "color" | "black_and_white",
            paperSize: (p.paper_size || "a4") as "a4" | "a3",
            sideMode: (p.side_mode || "single_sided") as "single_sided" | "double_sided",
            copies: Math.max(1, p.copies ?? 1),
          }));

          siblingJobs.push({
            id: s.id,
            orderId: s.order_id,
            documentId: s.document_id,
            shopId: s.shop_id,
            totalPages: s.total_pages,
            totalAmount: Number(s.total_amount),
            currency: s.currency,
            printAttempts: s.print_attempts,
            maxAttempts: s.max_attempts,
            defaultPrinter: defaultPrinter?.name || null,
            requiredPrinterName,
            duplexStep: s.duplex_step || "none",
            document: {
              id: sDoc.id,
              storagePath: sDoc.storage_path,
              originalFilename: sDoc.original_filename,
              mimeType: sDoc.mime_type,
              sizeBytes: Number(sDoc.size_bytes),
              pageCount: sDoc.page_count,
            },
            pagesConfig: sResolvedPages,
            isLastJobForOrder: sIdx === validSiblings.length - 1,
          });
        }
      }
    }
  }

  // Check if this job is the final job for this user's order batch.
  // In multi-file orders (e.g. user uploads 6 files), the empty separator sheet
  // must only be appended after ALL documents have finished printing, not after each individual file.
  let isLastJobForOrder = true;
  if (effectiveDuplexStep === "odd" || siblingJobs.length > 0) {
    // Phase 1 (odd pages) or orders with sibling jobs pending in batch must not append separator yet
    isLastJobForOrder = false;
  } else if (claimed.order_id) {
    const { data: remainingJobs } = await adminClient
      .from("print_jobs")
      .select("id, status, duplex_step")
      .eq("order_id", claimed.order_id)
      .neq("id", claimed.job_id)
      .in("status", ["queued", "paid", "awaiting_payment", "draft", "claimed"]);

    const { data: incompleteDuplexJobs } = await adminClient
      .from("print_jobs")
      .select("id")
      .eq("order_id", claimed.order_id)
      .neq("id", claimed.job_id)
      .in("duplex_step", ["odd_pending", "odd", "odd_printed", "even_pending"]);

    const hasOtherPendingJobs = Boolean(
      (remainingJobs && remainingJobs.length > 0) ||
      (incompleteDuplexJobs && incompleteDuplexJobs.length > 0)
    );

    if (hasOtherPendingJobs) {
      isLastJobForOrder = false;
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
      isLastJobForOrder,
      siblingJobs: siblingJobs.length > 0 ? siblingJobs : undefined,
    },
  });
}
