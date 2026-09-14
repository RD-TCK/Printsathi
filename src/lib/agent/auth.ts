import "server-only";
import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export function hashAgentToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateAgentToken(): string {
  return `ps_agent_${crypto.randomBytes(32).toString("hex")}`;
}

export function generatePairingCode(): { displayCode: string; codeHash: string } {
  // Format: PS-XXXX-YYYY
  const part1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const part2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const displayCode = `PS-${part1}-${part2}`;
  const codeHash = hashAgentToken(displayCode);
  return { displayCode, codeHash };
}

export interface AuthenticatedAgent {
  agent: {
    id: string;
    shop_id: string;
    name: string;
    version: string | null;
    status: string;
    is_revoked: boolean;
    machine_info: Record<string, unknown>;
    current_job_id: string | null;
  };
  shop: {
    id: string;
    public_id: string;
    name: string;
    is_active: boolean;
  };
}

export async function authenticateAgent(request: Request): Promise<AuthenticatedAgent | null> {
  const authHeader = request.headers.get("Authorization");
  const agentTokenHeader = request.headers.get("x-agent-token");

  let token = agentTokenHeader;
  if (!token && authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token) return null;

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) return null;

  const tokenHash = hashAgentToken(token);

  const { data: agent, error } = await adminClient
    .from("desktop_agents")
    .select("id, shop_id, name, version, status, is_revoked, machine_info, current_job_id")
    .eq("auth_token_hash", tokenHash)
    .eq("is_revoked", false)
    .maybeSingle();

  if (error || !agent) return null;

  const { data: shop } = await adminClient
    .from("shops")
    .select("id, public_id, name, is_active")
    .eq("id", agent.shop_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!shop) return null;

  return { agent, shop };
}
