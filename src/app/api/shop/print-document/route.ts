import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const client = await createSupabaseServerClient();
  if (!client) {
    return NextResponse.json({ error: "Authentication not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const documentId = searchParams.get("documentId");

  if (!jobId && !documentId) {
    return NextResponse.json({ error: "Missing jobId or documentId parameter." }, { status: 400 });
  }

  // Verify shop membership
  const { data: member } = await client
    .from("shop_members")
    .select("shop_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: "Forbidden: Not a shop member." }, { status: 403 });
  }

  const adminClient = createSupabaseAdminClient() || client;

  let storagePath: string | null = null;
  let filename = "document.pdf";
  let mimeType = "application/pdf";

  if (documentId) {
    const { data: doc } = await adminClient
      .from("documents")
      .select("storage_path, original_filename, mime_type, shop_id")
      .eq("id", documentId)
      .eq("shop_id", member.shop_id)
      .maybeSingle();

    if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    storagePath = doc.storage_path;
    filename = doc.original_filename;
    mimeType = doc.mime_type || "application/pdf";
  } else if (jobId) {
    const { data: job } = await adminClient
      .from("print_jobs")
      .select("document_id, shop_id, documents(storage_path, original_filename, mime_type)")
      .eq("id", jobId)
      .eq("shop_id", member.shop_id)
      .maybeSingle();

    if (!job) return NextResponse.json({ error: "Print job not found." }, { status: 404 });
    const doc = Array.isArray(job.documents) ? job.documents[0] : job.documents;
    if (!doc) return NextResponse.json({ error: "Associated document not found." }, { status: 404 });
    storagePath = doc.storage_path;
    filename = doc.original_filename;
    mimeType = doc.mime_type || "application/pdf";
  }

  if (!storagePath) {
    return NextResponse.json({ error: "Document storage path missing." }, { status: 404 });
  }

  const { data: fileData, error: downloadError } = await adminClient.storage
    .from("print-documents")
    .download(storagePath);

  if (downloadError || !fileData) {
    return NextResponse.json({ error: "Could not download document file." }, { status: 502 });
  }

  const buffer = await fileData.arrayBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      "Content-Length": String(buffer.byteLength),
    },
  });
}
