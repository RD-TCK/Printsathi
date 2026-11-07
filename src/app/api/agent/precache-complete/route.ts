import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent/auth";
import { recordAgentDocumentPrecached } from "@/lib/order-readiness-tracker";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized agent." }, { status: 401 });
  }

  let body: { orderId?: string; documentId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orderId, documentId } = body;
  if (!orderId || !documentId) {
    return NextResponse.json({ error: "Missing orderId or documentId" }, { status: 400 });
  }

  recordAgentDocumentPrecached(orderId, documentId);

  return NextResponse.json({
    success: true,
    orderId,
    documentId,
    precached: true,
  });
}
