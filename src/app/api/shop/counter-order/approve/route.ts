import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";

export const dynamic = "force-dynamic";

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
    .select("id, public_id, status, total_amount, token_number, expires_at, payment_mode, color_pages")
    .eq("id", orderId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (["paid", "completed"].includes(order.status) && duplexStep !== "even") {
    // If order is already paid or completed, re-queue the jobs and set order to 'paid' so the agent claims and re-prints cleanly
    await adminClient
      .from("orders")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("shop_id", shopId);

    let { data: existingJobs } = await adminClient
      .from("print_jobs")
      .select("id, status, document_id, total_pages, duplex_step, failure_reason")
      .eq("order_id", orderId)
      .eq("shop_id", shopId);

    // If no jobs exist, self-heal and create them from documents
    if (!existingJobs || existingJobs.length === 0) {
      const { data: orderDocs } = await adminClient
        .from("documents")
        .select("id, page_count")
        .eq("order_id", order.id)
        .eq("shop_id", shopId);

      if (orderDocs && orderDocs.length > 0) {
        for (const doc of orderDocs) {
          const jobId = crypto.randomUUID();
          const pageCount = doc.page_count || 1;
          await adminClient.from("print_jobs").insert({
            id: jobId,
            order_id: order.id,
            shop_id: shopId,
            document_id: doc.id,
            status: "queued",
            duplex_step: "none",
            total_pages: pageCount,
            total_amount: order.total_amount || 0,
            idempotency_key: crypto.randomUUID(),
          });
          await adminClient.from("print_job_pages").insert([
            {
              print_job_id: jobId,
              start_page: 1,
              end_page: pageCount,
              color_mode: (order.color_pages || 0) > 0 ? "color" : "black_and_white",
              paper_size: "a4",
              side_mode: "single_sided",
              copies: 1,
            },
          ]);
        }
        const refreshed = await adminClient
          .from("print_jobs")
          .select("id, status, document_id, total_pages, duplex_step, failure_reason")
          .eq("order_id", order.id);
        existingJobs = refreshed.data;
      }
    } else {
      // Re-queue existing jobs so the agent daemon claims and prints them cleanly
      await adminClient
        .from("print_jobs")
        .update({
          status: "queued",
          duplex_step: "none",
          claimed_by_agent_id: null,
          claim_expires_at: null,
          failure_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", orderId)
        .eq("shop_id", shopId);
    }

    return NextResponse.json({
      success: true,
      message: `Token #${order.token_number || order.public_id} queued for printing.`,
      order: { id: order.id, status: "paid", tokenNumber: order.token_number },
      jobs: existingJobs || [],
    });
  }

  // Idempotency guard for "Print Next Side" (even step):
  // If the even-step jobs are already queued or printing, don't re-queue them.
  if (duplexStep === "even") {
    const { data: existingJobs } = await adminClient
      .from("print_jobs")
      .select("id, status, duplex_step")
      .eq("order_id", orderId)
      .eq("shop_id", shopId);
    const alreadyQueued = existingJobs?.some(
      (j) => j.duplex_step === "even" && ["queued", "printing", "print_submitted"].includes(j.status),
    );
    if (alreadyQueued) {
      return NextResponse.json({
        success: true,
        message: `Token #${order.token_number || order.public_id}: Back side is already queued for printing.`,
        order: { id: order.id, publicId: order.public_id, tokenNumber: order.token_number, status: order.status },
      });
    }
  }

  // 1. Create verified counter payment record
  // Only insert/update payment on the first approval (odd step or single-sided).
  // For "Print Next Side" (even step), the payment record already exists from Step 1.
  const isEvenStep = duplexStep === "even";
  if (!isEvenStep) {
    const providerPaymentId = `counter_${order.public_id}_${Date.now()}`;
    const { error: paymentError } = await adminClient.from("payments").insert({
      order_id: order.id,
      provider: "counter",
      payment_method: "counter_cash",
      status: "verified",
      provider_payment_id: providerPaymentId,
      amount: order.total_amount,
      currency: "INR",
      verified_at: new Date().toISOString(),
    });

    if (paymentError) {
      // If unique constraint triggers on order_id, update the existing payment
      await adminClient
        .from("payments")
        .update({
          provider: "counter",
          payment_method: "counter_cash",
          status: "verified",
          provider_payment_id: providerPaymentId,
          amount: order.total_amount,
          verified_at: new Date().toISOString(),
        })
        .eq("order_id", order.id);
    }
  }

  // Determine status and duplex step
  const isOddStep = duplexStep === "odd";

  const targetOrderStatus = isOddStep ? "partially_printed" : "paid";
  const targetJobStatus = "queued";
  const targetDuplexStep = isOddStep ? "odd" : isEvenStep ? "even" : "none";

  // 2. Update order status
  const { error: updateOrderError } = await adminClient
    .from("orders")
    .update({
      status: targetOrderStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("shop_id", shopId);

  if (updateOrderError) {
    return NextResponse.json({ error: "Could not update order status." }, { status: 500 });
  }

  // Cancel any stale expired/orphaned jobs for this shop not updated for 30 minutes
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await adminClient
    .from("print_jobs")
    .update({
      status: "failed",
      failure_reason: "Orphaned job timed out. Prioritizing newly approved counter order.",
      claim_expires_at: null,
      claimed_by_agent_id: null,
    })
    .eq("shop_id", shopId)
    .in("status", ["queued", "claimed"])
    .neq("order_id", order.id)
    .lt("updated_at", thirtyMinAgo);

  // 3. Update print jobs status to queued and update duplex_step
  // For the even step: jobs coming from "print_submitted" (odd step done) need claim metadata cleared
  // so the claim_next_print_job SQL can pick them up fresh.
  await adminClient
    .from("print_jobs")
    .update({
      status: targetJobStatus,
      duplex_step: targetDuplexStep,
      // Clear stale claim metadata so the job is cleanly reclaimable
      claimed_by_agent_id: null,
      claim_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", order.id)
    .eq("shop_id", shopId);

  // 4. Fetch the jobs for response and self-heal if missing
  let { data: jobs } = await adminClient
    .from("print_jobs")
    .select("id, status, document_id, total_pages, duplex_step")
    .eq("order_id", order.id);

  if (!jobs || jobs.length === 0) {
    const { data: orderDocs } = await adminClient
      .from("documents")
      .select("id, page_count")
      .eq("order_id", order.id)
      .eq("shop_id", shopId);

    if (orderDocs && orderDocs.length > 0) {
      for (const doc of orderDocs) {
        const jobId = crypto.randomUUID();
        const pageCount = doc.page_count || 1;
        await adminClient.from("print_jobs").insert({
          id: jobId,
          order_id: order.id,
          shop_id: shopId,
          document_id: doc.id,
          status: targetJobStatus,
          duplex_step: targetDuplexStep,
          total_pages: pageCount,
          total_amount: order.total_amount || 0,
          idempotency_key: crypto.randomUUID(),
        });
        await adminClient.from("print_job_pages").insert([
          {
            print_job_id: jobId,
            start_page: 1,
            end_page: pageCount,
            color_mode: (order.color_pages || 0) > 0 ? "color" : "black_and_white",
            paper_size: "a4",
            side_mode: isOddStep || isEvenStep ? "double_sided" : "single_sided",
            copies: 1,
          },
        ]);
      }
      const refreshed = await adminClient
        .from("print_jobs")
        .select("id, status, document_id, total_pages, duplex_step")
        .eq("order_id", order.id);
      jobs = refreshed.data;
    }
  }

  const stepMessage = isOddStep
    ? `Token #${order.token_number || order.public_id}: Odd pages (Front Side) printed! Flip sheets and reload in tray for back side.`
    : isEvenStep
      ? `Token #${order.token_number || order.public_id}: Even pages (Back Side) printed! Job complete.`
      : `Token #${order.token_number || order.public_id} approved for printing.`;

  return NextResponse.json({
    success: true,
    message: stepMessage,
    order: {
      id: order.id,
      publicId: order.public_id,
      tokenNumber: order.token_number,
      status: targetOrderStatus,
      duplexStep: targetDuplexStep,
    },
    jobs: jobs || [],
  });
}
