import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { authenticateAgent } from "@/lib/agent/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createGuestOrderToken } from "@/lib/guest-order";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized agent." }, { status: 401 });
  }

  const { shop } = auth;
  let body: {
    customerPhone?: string;
    customerName?: string;
    files?: Array<{ filename: string; sizeBytes?: number; mimetype?: string }>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request payload." }, { status: 400 });
  }

  const files = body.files || [];
  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "No files specified for upload." }, { status: 400 });
  }

  const client = createSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ error: "Storage service unavailable." }, { status: 503 });
  }

  const orderIdempotency = crypto.randomUUID();
  const guestToken = createGuestOrderToken();
  const { data: newOrder, error: orderError } = await client
    .from("orders")
    .insert({
      shop_id: shop.id,
      idempotency_key: orderIdempotency,
      guest_access_token_hash: guestToken.hash,
      status: "draft",
    })
    .select("id, public_id")
    .single();

  if (orderError || !newOrder) {
    return NextResponse.json({ error: "Could not create the draft order." }, { status: 500 });
  }

  const orderId = newOrder.id;
  const uploads: Array<{
    documentId: string;
    filename: string;
    storagePath: string;
    signedUrl: string;
    token: string;
  }> = [];

  for (const f of files) {
    const documentId = crypto.randomUUID();
    const sanitizedName = (f.filename || "document.pdf").replace(/[/\\?%*:|"<>]/g, "_");
    const storagePath = `shops/${shop.id}/orders/${orderId}/documents/${documentId}/raw_${sanitizedName}`;

    const { data: signData, error: signError } = await client.storage
      .from("print-documents")
      .createSignedUploadUrl(storagePath);

    if (signError || !signData?.signedUrl) {
      await client.from("orders").delete().eq("id", orderId);
      return NextResponse.json(
        { error: signError?.message || "Failed to generate presigned upload URL." },
        { status: 500 },
      );
    }

    let fullSignedUrl = signData.signedUrl;
    if (!fullSignedUrl.startsWith("http")) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") || "";
      if (fullSignedUrl.startsWith("/storage/v1/")) {
        fullSignedUrl = `${supabaseUrl}${fullSignedUrl}`;
      } else {
        fullSignedUrl = `${supabaseUrl}/storage/v1/${fullSignedUrl.replace(/^\/+/, "")}`;
      }
    }

    uploads.push({
      documentId,
      filename: sanitizedName,
      storagePath,
      signedUrl: fullSignedUrl,
      token: signData.token,
    });
  }

  return NextResponse.json({
    orderId,
    orderPublicId: newOrder.public_id,
    guestToken: guestToken.token,
    uploads,
  });
}
