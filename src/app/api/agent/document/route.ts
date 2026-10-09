import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";

export async function GET(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized agent." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId");
  const jobId = searchParams.get("jobId");

  if (!documentId || !jobId) {
    return NextResponse.json({ error: "Missing documentId or jobId parameter." }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service not configured." }, { status: 503 });
  }

  // 1. Verify that this job belongs to this agent's shop and is claimed by this agent
  const { data: job, error: jobError } = await adminClient
    .from("print_jobs")
    .select("id, shop_id, document_id, order_id, claimed_by_agent_id, status")
    .eq("id", jobId)
    .eq("shop_id", auth.shop.id)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json({ error: "Print job not found." }, { status: 404 });
  }

  if (job.document_id !== documentId) {
    return NextResponse.json({ error: "Document does not match print job." }, { status: 400 });
  }

  if (job.claimed_by_agent_id !== auth.agent.id) {
    return NextResponse.json({ error: "Print job is not claimed by this agent." }, { status: 403 });
  }

  // 2. Fetch document storage path
  const { data: document, error: docError } = await adminClient
    .from("documents")
    .select("id, storage_path, original_filename, mime_type, order_id")
    .eq("id", documentId)
    .eq("shop_id", auth.shop.id)
    .maybeSingle();

  if (docError || !document) {
    return NextResponse.json({ error: "Document record not found." }, { status: 404 });
  }

  const effectiveOrderId = job.order_id || document.order_id;
  let fileBuffer: Buffer | null = null;
  let effectiveMime = document.mime_type || "application/pdf";

  // 3. Download document
  if (document.storage_path.startsWith("local://")) {
    // For local-first documents, check if thumbnail preview exists in cloud
    if (effectiveOrderId) {
      const previewStoragePath = `shops/${auth.shop.id}/orders/${effectiveOrderId}/documents/${document.id}/preview.jpg`;
      const { data: previewData } = await adminClient.storage
        .from("print-documents")
        .download(previewStoragePath);

      if (previewData) {
        const ab = await previewData.arrayBuffer();
        fileBuffer = Buffer.from(ab);
        effectiveMime = "image/jpeg";
      }
    }
  } else {
    const { data: fileData } = await adminClient.storage
      .from("print-documents")
      .download(document.storage_path);

    if (fileData) {
      const ab = await fileData.arrayBuffer();
      fileBuffer = Buffer.from(ab);
    }
  }

  // If normal download failed, try preview thumbnail as emergency fallback
  if (!fileBuffer && effectiveOrderId) {
    const fallbackPreview = `shops/${auth.shop.id}/orders/${effectiveOrderId}/documents/${document.id}/preview.jpg`;
    const { data: fallbackData } = await adminClient.storage
      .from("print-documents")
      .download(fallbackPreview);

    if (fallbackData) {
      const ab = await fallbackData.arrayBuffer();
      fileBuffer = Buffer.from(ab);
      effectiveMime = "image/jpeg";
    }
  }

  if (!fileBuffer) {
    return NextResponse.json({ error: "Could not retrieve document from storage." }, { status: 502 });
  }

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": effectiveMime,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(document.original_filename)}"`,
      "Content-Length": String(fileBuffer.byteLength),
    },
  });
}
