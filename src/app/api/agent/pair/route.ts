import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateAgentToken, hashAgentToken } from "@/lib/agent/auth";

const pairAgentSchema = z.object({
  pairingCode: z.string().min(4),
  agentName: z.string().min(1).max(100).optional(),
  version: z.string().max(50).optional(),
  machineInfo: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = pairAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid pairing request payload." }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service not configured." }, { status: 503 });
  }

  const cleanCode = parsed.data.pairingCode.trim().toUpperCase();
  const codeHash = hashAgentToken(cleanCode);

  // 1. Verify pairing code
  const { data: pairingRecord, error: pairingError } = await adminClient
    .from("agent_pairing_codes")
    .select("id, shop_id, expires_at, is_used")
    .eq("code_hash", codeHash)
    .maybeSingle();

  if (pairingError || !pairingRecord) {
    return NextResponse.json({ error: "Invalid pairing code." }, { status: 404 });
  }

  if (pairingRecord.is_used) {
    return NextResponse.json({ error: "Pairing code has already been used." }, { status: 409 });
  }

  if (new Date(pairingRecord.expires_at) <= new Date()) {
    return NextResponse.json({ error: "Pairing code has expired. Please generate a new one." }, { status: 410 });
  }

  // 2. Verify shop
  const { data: shop, error: shopError } = await adminClient
    .from("shops")
    .select("id, name, public_id, is_active")
    .eq("id", pairingRecord.shop_id)
    .maybeSingle();

  if (shopError || !shop || !shop.is_active) {
    return NextResponse.json({ error: "Associated shop is inactive or not found." }, { status: 403 });
  }

  // 3. Generate Agent credentials
  const agentToken = generateAgentToken();
  const tokenHash = hashAgentToken(agentToken);

  const agentName = parsed.data.agentName || "Windows Agent";
  const version = parsed.data.version || "1.0.0";
  const machineInfo = parsed.data.machineInfo || {};

  const { data: newAgent, error: agentError } = await adminClient
    .from("desktop_agents")
    .insert({
      shop_id: shop.id,
      name: agentName,
      version,
      status: "online",
      auth_token_hash: tokenHash,
      machine_info: machineInfo,
      last_heartbeat_at: new Date().toISOString(),
      is_revoked: false,
    })
    .select("id, name, status, created_at")
    .single();

  if (agentError || !newAgent) {
    return NextResponse.json({ error: "Failed to register desktop agent." }, { status: 500 });
  }

  // 4. Mark pairing code used
  await adminClient
    .from("agent_pairing_codes")
    .update({
      is_used: true,
      used_at: new Date().toISOString(),
      used_by_agent_id: newAgent.id,
    })
    .eq("id", pairingRecord.id);

  // 5. Audit log
  await adminClient.from("audit_logs").insert({
    shop_id: shop.id,
    action: "agent_paired",
    entity_type: "desktop_agent",
    entity_id: newAgent.id,
    metadata: {
      agent_id: newAgent.id,
      agent_name: agentName,
      version,
      machine_info: machineInfo,
    },
  });

  return NextResponse.json({
    success: true,
    agentId: newAgent.id,
    shopId: shop.id,
    shopPublicId: shop.public_id,
    shopName: shop.name,
    agentToken, // Agent stores this securely on local disk
  });
}
