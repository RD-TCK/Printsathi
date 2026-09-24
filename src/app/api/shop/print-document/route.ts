import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { PDFDocument } from "pdf-lib";

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
  const duplexStep = searchParams.get("duplexStep"); // 'odd' | 'even' | null

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

  const originalBuffer = await fileData.arrayBuffer();

  // If PDF, check if we need to slice page ranges, duplicate copies, or handle duplexStep
  if (mimeType === "application/pdf") {
    try {
      let pageConfigs: Array<{ start_page: number; end_page: number; copies?: number; side_mode?: string }> | null = null;
      if (jobId) {
        const { data: configs } = await adminClient
          .from("print_job_pages")
          .select("start_page, end_page, copies, side_mode")
          .eq("print_job_id", jobId)
          .order("start_page", { ascending: true });
        if (configs && configs.length > 0) {
          pageConfigs = configs;
        }
      }

      const sourceDoc = await PDFDocument.load(originalBuffer);
      const totalDocPages = sourceDoc.getPageCount();

      const needsCustomPdf =
        Boolean(duplexStep) ||
        (pageConfigs &&
          (pageConfigs.some((c) => (c.copies ?? 1) > 1 || c.start_page > 1 || c.end_page < totalDocPages) ||
            pageConfigs.length > 1));

      if (needsCustomPdf) {
        const outputDoc = await PDFDocument.create();

        if (pageConfigs && pageConfigs.length > 0) {
          for (const config of pageConfigs) {
            const start = Math.max(1, config.start_page);
            const end = Math.min(totalDocPages, config.end_page);
            const copies = Math.max(1, config.copies ?? 1);
            const pageIndices: number[] = [];

            for (let i = start; i <= end; i++) {
              if (duplexStep === "odd" && i % 2 === 0) continue;
              if (duplexStep === "even" && i % 2 !== 0) continue;
              pageIndices.push(i - 1);
            }

            if (pageIndices.length > 0) {
              for (let c = 0; c < copies; c++) {
                const copiedPages = await outputDoc.copyPages(sourceDoc, pageIndices);
                copiedPages.forEach((p) => outputDoc.addPage(p));
              }
            }
          }
        } else {
          const pageIndices: number[] = [];
          for (let i = 1; i <= totalDocPages; i++) {
            if (duplexStep === "odd" && i % 2 === 0) continue;
            if (duplexStep === "even" && i % 2 !== 0) continue;
            pageIndices.push(i - 1);
          }
          if (pageIndices.length > 0) {
            const copiedPages = await outputDoc.copyPages(sourceDoc, pageIndices);
            copiedPages.forEach((p) => outputDoc.addPage(p));
          }
        }

        if (outputDoc.getPageCount() > 0) {
          const slicedBytes = await outputDoc.save();
          const suffix = duplexStep === "odd" ? "_Front_Odd_Pages.pdf" : duplexStep === "even" ? "_Back_Even_Pages.pdf" : "_Print.pdf";
          const slicedFilename = filename.replace(/\.pdf$/i, "") + suffix;

          return new NextResponse(Buffer.from(slicedBytes), {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `inline; filename="${encodeURIComponent(slicedFilename)}"`,
              "Content-Length": String(slicedBytes.byteLength),
            },
          });
        }
      }
    } catch {
      // Fallback to original buffer if custom generation fails
    }
  }

  return new NextResponse(Buffer.from(originalBuffer), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      "Content-Length": String(originalBuffer.byteLength),
    },
  });
}
