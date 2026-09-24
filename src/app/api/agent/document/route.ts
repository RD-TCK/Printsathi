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
    .select("id, shop_id, document_id, claimed_by_agent_id, status")
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
    .select("id, storage_path, original_filename, mime_type")
    .eq("id", documentId)
    .eq("shop_id", auth.shop.id)
    .maybeSingle();

  if (docError || !document) {
    return NextResponse.json({ error: "Document record not found." }, { status: 404 });
  }

  // 3. Download document from private storage bucket
  const { data: fileData, error: downloadError } = await adminClient.storage
    .from("print-documents")
    .download(document.storage_path);

  if (downloadError || !fileData) {
    return NextResponse.json({ error: "Could not retrieve document from storage." }, { status: 502 });
  }

  const buffer = await fileData.arrayBuffer();

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": document.mime_type || "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(document.original_filename)}"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
