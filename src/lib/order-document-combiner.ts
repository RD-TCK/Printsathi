import { PDFDocument } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

async function wrapImageToPdf(rawBuffer: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const isPng = rawBuffer.subarray(0, 4).toString("hex") === "89504e47";
  let embeddedImg;

  try {
    embeddedImg = isPng ? await pdfDoc.embedPng(rawBuffer) : await pdfDoc.embedJpg(rawBuffer);
  } catch {
    try {
      embeddedImg = isPng ? await pdfDoc.embedJpg(rawBuffer) : await pdfDoc.embedPng(rawBuffer);
    } catch {
      // If direct embedding fails (e.g. WebP, HEIC, TIFF, BMP, or EXIF rotated), normalize via sharp
      try {
        const normalizedJpeg = await sharp(rawBuffer)
          .rotate() // Automatically orient by EXIF tag
          .toColorspace("srgb")
          .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
          .toBuffer();
        embeddedImg = await pdfDoc.embedJpg(normalizedJpeg);
      } catch (sharpErr) {
        throw new Error(`Unsupported image format for PDF embedding: ${sharpErr}`);
      }
    }
  }

  const isLandscape = embeddedImg.width > embeddedImg.height * 1.15;
  const pageWidth = isLandscape ? 841.89 : 595.28;
  const pageHeight = isLandscape ? 595.28 : 841.89;
  const margin = 28.35; // ~10mm safe printable margin
  const contentW = pageWidth - margin * 2;
  const contentH = pageHeight - margin * 2;
  const scale = Math.min(contentW / embeddedImg.width, contentH / embeddedImg.height);
  const width = embeddedImg.width * scale;
  const height = embeddedImg.height * scale;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  page.drawImage(embeddedImg, {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  });
  return Buffer.from(await pdfDoc.save());
}

export interface DocumentConfigurationItem {
  orderId?: string;
  documentId: string;
  ranges: Array<{
    startPage: number;
    endPage: number;
    colorMode?: "color" | "black_and_white";
    paperSize?: "a4" | "a3" | "letter" | "legal" | string;
    sideMode?: "single_sided" | "double_sided";
    copies?: number;
  }>;
}

export interface CombineOrderDocumentsParams {
  shopId: string;
  orderId: string;
  tokenNumber?: number | null;
  customerId?: string | null;
  totalAmount?: number;
  configurations?: DocumentConfigurationItem[];
  targetJobStatus?: "awaiting_payment" | "queued" | "paid";
  duplexStep?: "none" | "odd" | "even";
}

export interface CombineOrderDocumentsResult {
  success: boolean;
  combined: boolean;
  combinedDocId?: string;
  combinedJobId?: string;
  totalPages?: number;
  error?: string;
}

/**
 * Combines all documents and pictures belonging to one order / token number into
 * a single multi-page PDF document and creates EXACTLY ONE print_job in the database.
 *
 * This guarantees that when the Windows Desktop Agent sends the token to the printer,
 * SumatraPDF spools a single continuous print job to Windows Print Spooler.
 * The physical printer prints all pages consecutively without motor spin-down,
 * pauses, or delays between pictures.
 */
export async function combineOrderDocumentsForPrint(
  client: SupabaseClient,
  params: CombineOrderDocumentsParams,
): Promise<CombineOrderDocumentsResult> {
  const {
    shopId,
    orderId,
    tokenNumber,
    customerId,
    totalAmount = 0,
    configurations,
    targetJobStatus = "awaiting_payment",
    duplexStep,
  } = params;

  try {
    // 1. Fetch all documents for this order
    const { data: orderDocs, error: docErr } = await client
      .from("documents")
      .select("id, storage_path, original_filename, mime_type, page_count, size_bytes")
      .eq("order_id", orderId)
      .eq("shop_id", shopId)
      .order("created_at", { ascending: true });

    if (docErr || !orderDocs || orderDocs.length === 0) {
      return { success: false, combined: false, error: "No documents found for this order." };
    }

    // Filter out previously generated combined token document to get the raw user documents
    const rawDocs = orderDocs.filter(
      (d) => !d.original_filename?.toLowerCase().includes("combined"),
    );

    // If order has only 1 raw document and no complex multi-doc configs, no combination is required
    if (rawDocs.length <= 1 && (!configurations || configurations.length <= 1)) {
      return { success: true, combined: false, totalPages: rawDocs[0]?.page_count || 1 };
    }

    const docMap = new Map(orderDocs.map((d) => [d.id, d]));

    // Determine the items to combine (use configurations if provided, otherwise all raw docs)
    const itemsToProcess: Array<{
      document: (typeof orderDocs)[0];
      ranges: DocumentConfigurationItem["ranges"];
    }> = [];

    if (configurations && configurations.length > 0) {
      for (const config of configurations) {
        const doc = docMap.get(config.documentId);
        if (doc) {
          itemsToProcess.push({
            document: doc,
            ranges: config.ranges?.length
              ? config.ranges
              : [
                  {
                    startPage: 1,
                    endPage: Math.max(1, doc.page_count || 1),
                    colorMode: "black_and_white",
                    paperSize: "a4",
                    sideMode: "single_sided",
                    copies: 1,
                  },
                ],
          });
        }
      }
    } else {
      for (const doc of rawDocs) {
        itemsToProcess.push({
          document: doc,
          ranges: [
            {
              startPage: 1,
              endPage: Math.max(1, doc.page_count || 1),
              colorMode: "black_and_white",
              paperSize: "a4",
              sideMode: "single_sided",
              copies: 1,
            },
          ],
        });
      }
    }

    if (itemsToProcess.length === 0) {
      return { success: false, combined: false, error: "No valid documents to combine." };
    }

    // If only 1 document remains after filtering out previous combined files
    if (itemsToProcess.length === 1) {
      return { success: true, combined: false, totalPages: itemsToProcess[0].document.page_count || 1 };
    }

    // 2. Download all document buffers in parallel for maximum performance
    const loadedDocs = await Promise.all(
      itemsToProcess.map(async (item) => {
        const doc = item.document;
        let docBuffer: Buffer | null = null;

        // 2a. Download document bytes from Supabase storage if not local-only
        if (!doc.storage_path.startsWith("local://")) {
          const { data: fileData } = await client.storage.from("print-documents").download(doc.storage_path);
          if (fileData) {
            docBuffer = Buffer.from(await fileData.arrayBuffer());
          }
        }

        // 2b. If document is local, check if the original file exists in local agent cache on disk
        if (!docBuffer && doc.storage_path.startsWith("local://")) {
          try {
            const localAppData =
              process.env.LOCALAPPDATA || (process.platform === "win32" ? "C:\\Users\\MSI-1\\AppData\\Local" : "");
            if (localAppData) {
              const localCachePath = path.join(localAppData, "PrintivaAgent", "document_cache", `doc_${doc.id}.pdf`);
              if (fs.existsSync(localCachePath)) {
                docBuffer = fs.readFileSync(localCachePath);
              }
            }
          } catch {
            // ignore local fs read errors
          }
        }


        return { item, docBuffer };
      }),
    );

    // 3. Merge all loaded documents into a single continuous PDF
    const combinedPdf = await PDFDocument.create();
    let totalCombinedPages = 0;
    let anyColor = false;
    let anyDoubleSided = false;

    for (const { item, docBuffer } of loadedDocs) {
      const doc = item.document;
      if (!docBuffer || docBuffer.length === 0) {
        console.warn(`Could not load document bytes for ${doc.id} (${doc.original_filename}).`);
        continue;
      }

      // Convert image or PDF into PDFDocument
      let sourcePdf: PDFDocument;
      try {
        const isImage =
          (docBuffer[0] === 0xff && docBuffer[1] === 0xd8 && docBuffer[2] === 0xff) ||
          (docBuffer[0] === 0x89 && docBuffer[1] === 0x50 && docBuffer[2] === 0x4e && docBuffer[3] === 0x47) ||
          doc.mime_type?.startsWith("image/") ||
          /\.(jpe?g|png|webp|bmp)$/i.test(doc.original_filename || "");

        if (isImage) {
          try {
            const pdfBytes = await wrapImageToPdf(docBuffer);
            sourcePdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
          } catch {
            sourcePdf = await PDFDocument.load(docBuffer, { ignoreEncryption: true });
          }
        } else {
          try {
            sourcePdf = await PDFDocument.load(docBuffer, { ignoreEncryption: true });
          } catch {
            const pdfBytes = await wrapImageToPdf(docBuffer);
            sourcePdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
          }
        }
      } catch (loadErr) {
        console.error(`Failed to load PDF for document ${doc.id}:`, loadErr);
        continue;
      }

      const sourcePageCount = sourcePdf.getPageCount();
      if (sourcePageCount === 0) continue;

      for (const range of item.ranges) {
        if (range.colorMode === "color") anyColor = true;
        if (range.sideMode === "double_sided") anyDoubleSided = true;

        const start = Math.max(1, range.startPage || 1);
        const end = Math.min(sourcePageCount, Math.max(start, range.endPage || sourcePageCount));
        const copies = Math.max(1, range.copies ?? 1);

        const pageIndices: number[] = [];
        for (let p = start; p <= end; p++) {
          pageIndices.push(p - 1);
        }

        if (pageIndices.length > 0) {
          for (let c = 0; c < copies; c++) {
            const copied = await combinedPdf.copyPages(sourcePdf, pageIndices);
            copied.forEach((cp) => combinedPdf.addPage(cp));
            totalCombinedPages += pageIndices.length;
          }
        }
      }
    }

    if (totalCombinedPages === 0 || combinedPdf.getPageCount() === 0) {
      return { success: false, combined: false, error: "No printable pages could be extracted to combine." };
    }

    // 3. Save combined PDF and upload to storage
    const combinedBytes = Buffer.from(await combinedPdf.save());
    const tokenLabel = tokenNumber ? `Token #${tokenNumber}` : `Order #${orderId.slice(0, 8)}`;
    const storagePath = `shops/${shopId}/orders/${orderId}/token_combined_${Date.now()}.pdf`;

    const { error: uploadError } = await client.storage
      .from("print-documents")
      .upload(storagePath, combinedBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error(`Failed to upload combined PDF for order ${orderId}:`, uploadError);
      return { success: false, combined: false, error: "Failed to store combined PDF document." };
    }

    // 4. Clean up any previous combined documents for this order
    const { data: prevCombinedDocs } = await client
      .from("documents")
      .select("id, storage_path")
      .eq("order_id", orderId)
      .eq("shop_id", shopId)
      .ilike("original_filename", "%combined%");

    if (prevCombinedDocs && prevCombinedDocs.length > 0) {
      const docIdsToDelete = prevCombinedDocs.map((d) => d.id);
      await client.from("documents").delete().in("id", docIdsToDelete);
      const pathsToDelete = prevCombinedDocs
        .map((d) => d.storage_path)
        .filter((p) => !p.startsWith("local://"));
      if (pathsToDelete.length > 0) {
        await client.storage.from("print-documents").remove(pathsToDelete);
      }
    }

    // 5. Insert the combined document in documents table
    const combinedDocId = crypto.randomUUID();
    const { error: docInsertErr } = await client.from("documents").insert({
      id: combinedDocId,
      shop_id: shopId,
      customer_id: customerId || null,
      order_id: orderId,
      storage_path: storagePath,
      original_filename: `${tokenLabel} (All ${itemsToProcess.length} pictures combined).pdf`,
      mime_type: "application/pdf",
      size_bytes: combinedBytes.byteLength,
      page_count: totalCombinedPages,
    });

    if (docInsertErr) {
      console.error("Failed to insert combined document record:", docInsertErr);
      return { success: false, combined: false, error: "Failed to register combined document." };
    }

    // 6. Delete old print_jobs and pages first to prevent FK violation
    const { data: existingJobs } = await client
      .from("print_jobs")
      .select("id")
      .eq("order_id", orderId);

    if (existingJobs && existingJobs.length > 0) {
      const jobIds = existingJobs.map((j) => j.id);
      await client.from("print_job_pages").delete().in("print_job_id", jobIds);
    }
    await client.from("print_jobs").delete().eq("order_id", orderId);

    // 7. Insert EXACTLY ONE combined print job
    const combinedJobId = crypto.randomUUID();
    const effectiveDuplexStep = duplexStep || (anyDoubleSided ? "odd" : "none");
    const { error: jobInsertErr } = await client.from("print_jobs").insert({
      id: combinedJobId,
      order_id: orderId,
      shop_id: shopId,
      customer_id: customerId || null,
      document_id: combinedDocId,
      status: targetJobStatus,
      duplex_step: effectiveDuplexStep,
      total_pages: totalCombinedPages,
      total_amount: totalAmount,
      idempotency_key: crypto.randomUUID(),
    });

    if (jobInsertErr) {
      console.error("Failed to insert combined print job:", jobInsertErr);
      return { success: false, combined: false, error: "Failed to create combined print job." };
    }

    // 8. Insert print_job_pages for the single combined job
    await client.from("print_job_pages").insert([
      {
        print_job_id: combinedJobId,
        start_page: 1,
        end_page: totalCombinedPages,
        color_mode: anyColor ? "color" : "black_and_white",
        paper_size: "a4",
        side_mode: anyDoubleSided ? "double_sided" : "single_sided",
        copies: 1, // Copies are already collated into the combined PDF pages
      },
    ]);

    // 9. Update orders table total_pages
    await client
      .from("orders")
      .update({
        total_pages: totalCombinedPages,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("shop_id", shopId);

    return {
      success: true,
      combined: true,
      combinedDocId,
      combinedJobId,
      totalPages: totalCombinedPages,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error combining order documents for order ${orderId}:`, msg);
    return { success: false, combined: false, error: msg };
  }
}

