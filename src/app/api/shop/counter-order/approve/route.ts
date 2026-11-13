import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";
import { releasePaidOrder } from "@/lib/release-paid-order";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
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
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { orderId, duplexStep } = body;

  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: "Missing or invalid orderId." }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service unavailable." }, { status: 503 });
  }

  // Fetch the order
  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id, status, total_amount, token_number, total_pages, expires_at, color_pages, created_at")
    .eq("id", orderId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Reject print approval if the counter order validity has expired
  const orderExpiresAt = order.expires_at
    ? new Date(order.expires_at)
    : order.created_at
      ? new Date(new Date(order.created_at).getTime() + 60 * 60 * 1000)
      : null;
  const isExpired =
    !["paid", "completed", "partially_printed"].includes(order.status) &&
    (order.status === "expired" || (orderExpiresAt ? orderExpiresAt.getTime() <= Date.now() : false));

  const displayToken = order.token_number ? String(order.token_number) : order.id.slice(0, 8);

  if (isExpired) {
    return NextResponse.json(
      {
        error: `Token #${displayToken} has expired (tokens have 1-hour validity). Please ask the customer to generate a new token.`,
      },
      { status: 410 },
    );
  }

  // 1. Handle Duplex Step 2 ("Print Next Side") vs Step 1 / Single-Sided
  const isEvenStep = duplexStep === "even";
  const isOddStep = duplexStep === "odd";

  if (isEvenStep) {
    // Idempotency guard for "Print Next Side" (even step):
    // If the even-step jobs are already queued, printing, or completed, don't re-queue them.
    const { data: existingJobs } = await adminClient
      .from("print_jobs")
      .select("id, status, duplex_step")
      .eq("order_id", order.id)
      .eq("shop_id", shopId);

    const alreadyQueuedOrDone = existingJobs?.some(
      (j) => j.duplex_step === "even" && ["queued", "printing", "print_submitted", "completed"].includes(j.status),
    );
    if (alreadyQueuedOrDone) {
      return NextResponse.json({
        success: true,
        message: `Token #${displayToken}: Back side is already queued or printed.`,
        order: { id: order.id, publicId: displayToken, tokenNumber: order.token_number, status: order.status },
      });
    }

    // Transition odd-printed or failed even jobs to even step
    await adminClient
      .from("print_jobs")
      .update({
        status: "queued",
        duplex_step: "even",
        claimed_by_agent_id: null,
        claim_expires_at: null,
        print_attempts: 0,
        failure_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", order.id)
      .eq("shop_id", shopId)
      .in("duplex_step", ["odd", "odd_printed", "even"]);

    await adminClient
      .from("orders")
      .update({
        status: "partially_printed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("shop_id", shopId);
  } else {
    // 1. Idempotently record verified counter payment and release order to print queue
    // Check if verified payment already exists for this order to prevent double-click unique constraint violations
    const { data: existingPayment } = await adminClient
      .from("payments")
      .select("id, status")
      .eq("order_id", order.id)
      .maybeSingle();

    if (!existingPayment) {
      const providerPaymentId = `counter_${order.id.slice(0, 8)}_${Date.now()}`;
      const { error: payErr } = await adminClient.from("payments").insert({
        order_id: order.id,
        provider: "counter",
        payment_method: "counter_cash",
        status: "verified",
        provider_payment_id: providerPaymentId,
        amount: order.total_amount,
        currency: "INR",
        verified_at: new Date().toISOString(),
      });
      if (payErr) {
        console.error("Failed to insert counter payment:", payErr);
        return NextResponse.json({ error: "Failed to record payment verification." }, { status: 500 });
      }
    } else if (existingPayment.status !== "verified") {
      const { error: payErr } = await adminClient
        .from("payments")
        .update({
          status: "verified",
          verified_at: new Date().toISOString(),
          amount: order.total_amount,
        })
        .eq("id", existingPayment.id);
      if (payErr) {
        console.error("Failed to update counter payment:", payErr);
        return NextResponse.json({ error: "Failed to update payment verification." }, { status: 500 });
      }
    }
    await releasePaidOrder(adminClient, order.id);
  }

  const targetOrderStatus = isOddStep ? "partially_printed" : "paid";
  const targetDuplexStep = isOddStep ? "odd" : isEvenStep ? "even" : "none";

  // Fast-Path Optimization: If the approval request was made by an authenticated desktop agent,
  // atomically claim the order's jobs and return them immediately in the JSON response!
  // This completely eliminates the subsequent /api/agent/claim round trip and reduces latency to 0ms.
  let claimedJobPayload = null;
  if (agentAuth) {
    try {
      const leaseSeconds = 45;
      const expiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();

      let jobsQuery = adminClient
        .from("print_jobs")
        .select("id, document_id, shop_id, total_pages, total_amount, currency, print_attempts, max_attempts, duplex_step")
        .eq("order_id", order.id)
        .eq("shop_id", shopId)
        .neq("status", "completed");

      if (isEvenStep) {
        jobsQuery = jobsQuery.eq("duplex_step", "even");
      }

      const { data: orderJobs } = await jobsQuery;

      if (orderJobs && orderJobs.length > 0) {
        const jobIds = orderJobs.map((j) => j.id);
        const docIds = Array.from(new Set(orderJobs.map((j) => j.document_id)));

        await adminClient
          .from("print_jobs")
          .update({
            status: "claimed",
            claimed_by_agent_id: agentAuth.agent.id,
            claimed_at: new Date().toISOString(),
            claim_expires_at: expiresAt,
            print_attempts: 1,
            failure_reason: null,
            updated_at: new Date().toISOString(),
          })
          .in("id", jobIds);

        const [{ data: docs }, { data: allPages }, { data: defaultPrinter }] = await Promise.all([
          adminClient
            .from("documents")
            .select("id, storage_path, original_filename, mime_type, size_bytes, page_count")
            .in("id", docIds),
          adminClient
            .from("print_job_pages")
            .select("print_job_id, start_page, end_page, color_mode, paper_size, side_mode, copies")
            .in("print_job_id", jobIds)
            .order("start_page", { ascending: true }),
          adminClient
            .from("printers")
            .select("name")
            .eq("shop_id", shopId)
            .eq("is_default", true)
            .maybeSingle(),
        ]);

        const docsMap = new Map((docs || []).map((d) => [d.id, d]));
        const pagesMap = new Map<string, any[]>();
        for (const p of allPages || []) {
          const list = pagesMap.get(p.print_job_id) || [];
          list.push(p);
          pagesMap.set(p.print_job_id, list);
        }

        const formattedJobs = orderJobs.map((job, idx) => {
          const doc = docsMap.get(job.document_id) || {
            id: job.document_id,
            storage_path: "",
            original_filename: "document.pdf",
            mime_type: "application/pdf",
            size_bytes: 0,
            page_count: job.total_pages || 1,
          };
          const rawPages = pagesMap.get(job.id) || [];
          const pagesConfig =
            rawPages.length > 0
              ? rawPages.map((p) => ({
                  startPage: Math.max(1, p.start_page),
                  endPage: Math.max(Math.max(1, p.start_page), p.end_page),
                  colorMode: (p.color_mode || "black_and_white") as "color" | "black_and_white",
                  paperSize: (p.paper_size || "a4") as "a4" | "a3",
                  sideMode: (p.side_mode || "single_sided") as "single_sided" | "double_sided",
                  copies: Math.max(1, p.copies ?? 1),
                }))
              : [
                  {
                    startPage: 1,
                    endPage: Math.max(1, doc.page_count || job.total_pages || 1),
                    colorMode: "black_and_white" as const,
                    paperSize: "a4" as const,
                    sideMode: "single_sided" as const,
                    copies: 1,
                  },
                ];

          return {
            id: job.id,
            orderId: order.id,
            documentId: job.document_id,
            shopId: job.shop_id,
            totalPages: job.total_pages,
            totalAmount: Number(job.total_amount),
            currency: job.currency,
            printAttempts: (job.print_attempts || 0) + 1,
            maxAttempts: job.max_attempts || 3,
            claimedAt: new Date().toISOString(),
            claimExpiresAt: expiresAt,
            defaultPrinter: defaultPrinter?.name || null,
            duplexStep: job.duplex_step || targetDuplexStep,
            document: {
              id: doc.id,
              storagePath: doc.storage_path,
              originalFilename: doc.original_filename,
              mimeType: doc.mime_type,
              sizeBytes: Number(doc.size_bytes),
              pageCount: doc.page_count,
            },
            pagesConfig,
            isLastJobForOrder: idx === orderJobs.length - 1,
          };
        });

        if (formattedJobs.length > 0) {
          const primaryJob = formattedJobs[0];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (primaryJob as any).siblingJobs = formattedJobs.slice(1);
          claimedJobPayload = primaryJob;
        }
      }
    } catch (claimErr) {
      console.warn("Fast-path inline job claiming encountered error; agent will fall back to polling:", claimErr);
    }
  }

  const stepMessage = isOddStep
    ? `Token #${displayToken}: Odd pages (Front Side) queued! Flip sheets and reload in tray for back side once printed.`
    : isEvenStep
      ? `Token #${displayToken}: Even pages (Back Side) queued! Job complete.`
      : `Token #${displayToken} approved for printing.`;

  return NextResponse.json({
    success: true,
    message: stepMessage,
    order: {
      id: order.id,
      publicId: displayToken,
      tokenNumber: order.token_number,
      status: targetOrderStatus,
      duplexStep: targetDuplexStep,
    },
    claimedJob: claimedJobPayload,
  });
}
