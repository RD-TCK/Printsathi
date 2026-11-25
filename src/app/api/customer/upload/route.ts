import { NextResponse } from "next/server";
import { normalizeDocument, type NormalizedDocumentResult } from "@/lib/normalize-document";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createGuestOrderToken, hashGuestOrderToken } from "@/lib/guest-order";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid upload request format. Please choose your files and try again." },
      { status: 400 },
    );
  }
  const shopIdentifier = z.string().min(1).safeParse(form.get("shopIdentifier"));
  const existingOrderId = z
    .string()
    .uuid()
    .optional()
    .safeParse(form.get("orderId") || undefined);
  const existingAccessToken = z
    .string()
    .min(10)
    .optional()
    .safeParse(form.get("accessToken") || undefined);
  const replaceDocumentId = z
    .string()
    .uuid()
    .optional()
    .safeParse(form.get("replaceDocumentId") || undefined);
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (!shopIdentifier.success || !files.length)
    return NextResponse.json({ error: "Select at least one document." }, { status: 400 });
  if (files.length > 10)
    return NextResponse.json({ error: "You can add up to 10 documents per order." }, { status: 400 });
  const client = createSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Secure document storage is not configured." }, { status: 503 });
  const { data: shop } = await client
    .from("shops")
    .select("id, name, is_active")
    .eq("public_id", shopIdentifier.data)
    .maybeSingle();
  const { data: settings } = await client
    .from("shop_settings")
    .select("accepting_orders, max_upload_size_bytes")
    .eq("shop_id", shop?.id ?? "")
    .maybeSingle();
  const acceptingOrders = settings?.accepting_orders !== false;
  const isActive = shop?.is_active !== false;
  if (!shop || !isActive || !acceptingOrders)
    return NextResponse.json({ error: "This shop is not accepting orders." }, { status: 409 });
  const maxSize = Number(settings?.max_upload_size_bytes || 26214400);
  for (const file of files) {
    if (file.size < 1) {
      return NextResponse.json(
        { error: `"${file.name}" is empty (0 bytes).`, failedFilename: file.name },
        { status: 400 },
      );
    }
    if (file.size > maxSize) {
      const maxMb = (maxSize / (1024 * 1024)).toFixed(0);
      return NextResponse.json(
        { error: `"${file.name}" exceeds the ${maxMb} MB upload limit.`, failedFilename: file.name },
        { status: 400 },
      );
    }
  }

  if (files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024)
    return NextResponse.json({ error: "Combined upload size must be under 100 MB." }, { status: 400 });

  // Bound normalizeDocument concurrency (max 3 workers) so large multi-file uploads don't spike RAM/CPU on serverless
  const MAX_NORMALIZE_CONCURRENCY = 3;
  const settled: Array<PromiseSettledResult<NormalizedDocumentResult>> = new Array(files.length);
  let nextIdx = 0;
  await Promise.all(
    Array.from({ length: Math.min(MAX_NORMALIZE_CONCURRENCY, files.length) }, async () => {
      while (nextIdx < files.length) {
        const currentIdx = nextIdx++;
        const file = files[currentIdx];
        try {
          const value = await normalizeDocument(file);
          settled[currentIdx] = { status: "fulfilled", value };
        } catch (error) {
          const rawMessage = error instanceof Error ? error.message : "Document conversion failed.";
          const errorMsg = rawMessage.includes(file.name)
            ? rawMessage
            : `Failed to process "${file.name}": ${rawMessage}`;
          settled[currentIdx] = { status: "rejected", reason: { errorMsg, failedFilename: file.name } };
        }
      }
    }),
  );

  const normalized: NormalizedDocumentResult[] = [];
  const failedFiles: Array<{ filename: string; reason: string }> = [];

  settled.forEach((res, idx) => {
    if (res.status === "fulfilled") {
      normalized.push(res.value);
    } else {
      const err = res.reason as { errorMsg?: string; failedFilename?: string } | Error;
      const filename = ("failedFilename" in err && err.failedFilename) ? err.failedFilename : files[idx].name;
      const rawReason = ("errorMsg" in err && err.errorMsg) ? err.errorMsg : (err instanceof Error ? err.message : "Could not process file");
      const reason = rawReason.replace(/^Failed to process "[^"]+":\s*/i, "").replace(/^"[^"]+"\s*(is\s*)?/i, "");
      failedFiles.push({ filename, reason });
    }
  });

  if (normalized.length === 0) {
    const firstFail = failedFiles[0];
    return NextResponse.json(
      {
        error: firstFail ? `Failed to process "${firstFail.filename}": ${firstFail.reason}` : "Document conversion failed.",
        failedFilename: firstFail?.filename,
        failedFiles,
      },
      { status: 400 },
    );
  }

  let customerId: string | null = null;
  const serverClient = await createSupabaseServerClient();
  if (serverClient) {
    const {
      data: { user },
    } = await serverClient.auth.getUser();
    if (user) {
      customerId = user.id;
    }
  }

  let orderId: string;
  let orderPublicId: string;
  let returnAccessToken: string;
  let isNewOrder = false;

  if (existingOrderId.success && existingOrderId.data && existingAccessToken.success && existingAccessToken.data) {
    const tokenHash = hashGuestOrderToken(existingAccessToken.data);
    const { data: existingOrder } = await client
      .from("orders")
      .select("id, public_id, status")
      .eq("id", existingOrderId.data)
      .eq("shop_id", shop.id)
      .eq("guest_access_token_hash", tokenHash)
      .maybeSingle();

    if (existingOrder && ["draft", "awaiting_payment"].includes(existingOrder.status)) {
      orderId = existingOrder.id;
      orderPublicId = existingOrder.public_id;
      returnAccessToken = existingAccessToken.data;
    } else {
      isNewOrder = true;
      const orderIdempotency = crypto.randomUUID();
      const guestToken = createGuestOrderToken();
      const { data: newOrder, error: orderError } = await client
        .from("orders")
        .insert({
          shop_id: shop.id,
          customer_id: customerId,
          idempotency_key: orderIdempotency,
          guest_access_token_hash: guestToken.hash,
          status: "draft",
        })
        .select("id, public_id")
        .single();
      if (orderError || !newOrder) return NextResponse.json({ error: "Could not create the order." }, { status: 500 });
      orderId = newOrder.id;
      orderPublicId = newOrder.public_id;
      returnAccessToken = guestToken.token;
    }
  } else {
    isNewOrder = true;
    const orderIdempotency = crypto.randomUUID();
    const guestToken = createGuestOrderToken();
    const { data: newOrder, error: orderError } = await client
      .from("orders")
      .insert({
        shop_id: shop.id,
        customer_id: customerId,
        idempotency_key: orderIdempotency,
        guest_access_token_hash: guestToken.hash,
        status: "draft",
      })
      .select("id, public_id")
      .single();
    if (orderError || !newOrder) return NextResponse.json({ error: "Could not create the order." }, { status: 500 });
    orderId = newOrder.id;
    orderPublicId = newOrder.public_id;
    returnAccessToken = guestToken.token;
  }

  const storedPaths: string[] = [];
  const rollback = async () => {
    if (storedPaths.length) await client.storage.from("print-documents").remove(storedPaths);
    if (isNewOrder) {
      await client.from("orders").delete().eq("id", orderId);
    }
  };

  try {
    const preparedDocs = normalized.map((doc) => {
      const documentId = crypto.randomUUID();
      const storagePath = `shops/${shop.id}/orders/${orderId}/documents/${documentId}/source.pdf`;
      const previewStoragePath = `shops/${shop.id}/orders/${orderId}/documents/${documentId}/preview.jpg`;
      return {
        id: documentId,
        doc,
        storagePath,
        previewStoragePath,
      };
    });

    // 1. Upload files to storage in parallel and collect ALL uploaded paths deterministically even on partial failure
    const uploadSettled = await Promise.allSettled(
      preparedDocs.map(async ({ storagePath, previewStoragePath, doc }) => {
        const uploadedForDoc: string[] = [];
        const { error: uploadError } = await client.storage
          .from("print-documents")
          .upload(storagePath, doc.bytes, { contentType: "application/pdf", upsert: false });
        if (uploadError) throw new Error("Could not securely store the document.");
        uploadedForDoc.push(storagePath);

        if (doc.previewImage) {
          const { error: previewUploadError } = await client.storage
            .from("print-documents")
            .upload(previewStoragePath, doc.previewImage, {
              contentType: doc.previewMime || "image/jpeg",
              upsert: true,
            });
          if (!previewUploadError) {
            uploadedForDoc.push(previewStoragePath);
          }
        }
        return uploadedForDoc;
      }),
    );

    let firstUploadErr: unknown = null;
    for (const res of uploadSettled) {
      if (res.status === "fulfilled") {
        storedPaths.push(...res.value);
      } else if (!firstUploadErr) {
        firstUploadErr = res.reason;
      }
    }
    if (firstUploadErr) {
      throw firstUploadErr instanceof Error ? firstUploadErr : new Error("Could not securely store the document.");
    }

    // 2. Batch insert all documents in a single round-trip query instead of N serial/parallel queries
    const documentsToInsert = preparedDocs.map(({ id, storagePath, doc }) => ({
      id,
      shop_id: shop.id,
      order_id: orderId,
      customer_id: customerId,
      storage_path: storagePath,
      original_filename: doc.filename,
      mime_type: "application/pdf",
      size_bytes: doc.bytes.length,
      page_count: doc.pageCount,
      processing_status: "ready",
      normalized_storage_path: storagePath,
      normalized_mime_type: "application/pdf",
    }));

    const { error: batchInsertError } = await client.from("documents").insert(documentsToInsert);
    if (batchInsertError) throw new Error("Could not register the documents.");

    if (replaceDocumentId.success && replaceDocumentId.data) {
      const oldDocId = replaceDocumentId.data;
      const { data: oldDoc } = await client
        .from("documents")
        .select("id, storage_path, normalized_storage_path")
        .eq("id", oldDocId)
        .eq("order_id", orderId)
        .maybeSingle();

      if (oldDoc) {
        await client.from("documents").delete().eq("id", oldDocId);
        const pathsToDelete = [
          oldDoc.storage_path,
          oldDoc.normalized_storage_path,
          `shops/${shop.id}/orders/${orderId}/documents/${oldDocId}/preview.jpg`,
          `shops/${shop.id}/orders/${orderId}/documents/${oldDocId}/preview_v2.jpg`,
        ].filter((p): p is string => Boolean(p) && !p.startsWith("local://") && !storedPaths.includes(p));
        if (pathsToDelete.length > 0) {
          void client.storage.from("print-documents").remove(pathsToDelete);
        }
      }
    }

    const documents = preparedDocs.map(({ id, doc }) => ({
      id,
      filename: doc.filename,
      pageCount: doc.pageCount,
      sizeBytes: doc.bytes.length,
    }));

    return NextResponse.json(
      {
        orderId,
        orderPublicId,
        accessToken: returnAccessToken,
        documents,
        failedFiles: failedFiles.length > 0 ? failedFiles : undefined,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    await rollback();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload documents." },
      { status: 500 },
    );
  }
}

const deleteDocsSchema = z.object({
  shopIdentifier: z.string().min(1),
  orderId: z.string().uuid(),
  accessToken: z.string().min(10),
  documentIds: z.array(z.string().uuid()).min(1).max(20),
});

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = deleteDocsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid delete request." }, { status: 400 });
  }

  const client = createSupabaseAdminClient();
  if (!client) return NextResponse.json({ error: "Storage service unavailable." }, { status: 503 });

  const { data: shop } = await client
    .from("shops")
    .select("id")
    .eq("public_id", parsed.data.shopIdentifier)
    .maybeSingle();
  if (!shop) return NextResponse.json({ error: "Shop not found." }, { status: 404 });

  const tokenHash = hashGuestOrderToken(parsed.data.accessToken);
  const { data: order } = await client
    .from("orders")
    .select("id, status")
    .eq("id", parsed.data.orderId)
    .eq("shop_id", shop.id)
    .eq("guest_access_token_hash", tokenHash)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Order access denied." }, { status: 403 });
  if (!["draft", "awaiting_payment"].includes(order.status)) {
    return NextResponse.json({ error: "Cannot delete documents after payment." }, { status: 409 });
  }

  const { data: docs } = await client
    .from("documents")
    .select("id, storage_path, normalized_storage_path")
    .eq("order_id", order.id)
    .eq("shop_id", shop.id)
    .in("id", parsed.data.documentIds);

  if (docs && docs.length > 0) {
    const idsToDelete = docs.map((d) => d.id);
    await client.from("print_jobs").delete().eq("order_id", order.id).in("document_id", idsToDelete);
    await client.from("documents").delete().eq("order_id", order.id).in("id", idsToDelete);
    const storagePaths = docs
      .flatMap((d) => [
        d.storage_path,
        d.normalized_storage_path,
        `shops/${shop.id}/orders/${order.id}/documents/${d.id}/preview.jpg`,
        `shops/${shop.id}/orders/${order.id}/documents/${d.id}/preview_v2.jpg`,
      ])
      .filter((p): p is string => Boolean(p) && !p.startsWith("local://"));
    if (storagePaths.length > 0) {
      await client.storage.from("print-documents").remove(storagePaths);
    }
  }

  return NextResponse.json({ success: true });
}
