import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authenticateAgent } from "@/lib/agent/auth";

const printerSchema = z.object({
  name: z.string().min(1),
  systemIdentifier: z.string().optional(),
  status: z.enum(["online", "offline", "printing", "error", "no_printer"]).default("offline"),
  isDefault: z.boolean().optional(),
  driverName: z.string().optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
});

const heartbeatSchema = z.object({
  version: z.string().optional(),
  machineInfo: z.record(z.string(), z.unknown()).optional(),
  currentJobId: z.string().uuid().nullable().optional(),
  printers: z.array(printerSchema).optional(),
});

export async function POST(request: Request) {
  const auth = await authenticateAgent(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized agent." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = heartbeatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid heartbeat payload." }, { status: 400 });
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Database service not configured." }, { status: 503 });
  }

  const now = new Date().toISOString();

  // 1. Update Agent Status & Heartbeat
  const { error: agentError } = await adminClient
    .from("desktop_agents")
    .update({
      status: "online",
      last_heartbeat_at: now,
      version: parsed.data.version || auth.agent.version,
      machine_info: parsed.data.machineInfo || auth.agent.machine_info,
      current_job_id: parsed.data.currentJobId,
    })
    .eq("id", auth.agent.id);
  if (agentError) return NextResponse.json({ error: "Could not save agent heartbeat." }, { status: 500 });

  // A complete inventory must retire printers that disappeared, including an empty inventory.
  const { error: offlineError } = await adminClient.from("printers")
    .update({ status: "offline", is_online: false })
    .eq("shop_id", auth.shop.id).eq("desktop_agent_id", auth.agent.id);
  if (offlineError) return NextResponse.json({ error: "Could not reconcile printer inventory." }, { status: 500 });
  // 2. Upsert Discovered Printers
  if (parsed.data.printers && parsed.data.printers.length > 0) {
    for (const p of parsed.data.printers) {
      if (/onenote|print to pdf|xps|fax|pdfcreator|cutepdf/i.test(`${p.name} ${p.driverName || ""}`)) continue;
      const systemId =
        p.systemIdentifier ||
        p.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "_");

      const { data: existing, error: lookupError } = await adminClient
        .from("printers")
        .select("id, is_default")
        .eq("shop_id", auth.shop.id)
        .eq("system_identifier", systemId)
        .maybeSingle();
      if (lookupError) return NextResponse.json({ error: "Could not look up the printer inventory." }, { status: 500 });

      if (existing) {
        const { error: printerError } = await adminClient
          .from("printers")
          .update({
            desktop_agent_id: auth.agent.id,
            name: p.name,
            status: p.status,
            driver_name: p.driverName,
            capabilities: p.capabilities || {},
            is_online: p.status === "online" || p.status === "printing",
            is_default: existing.is_default,
            last_seen_at: now,
          })
          .eq("id", existing.id);
        if (printerError) return NextResponse.json({ error: "Could not update the detected printer." }, { status: 500 });
      } else {
        const { error: printerError } = await adminClient.from("printers").insert({
          shop_id: auth.shop.id,
          desktop_agent_id: auth.agent.id,
          name: p.name,
          system_identifier: systemId,
          status: p.status,
          driver_name: p.driverName,
          capabilities: p.capabilities || {},
          is_online: p.status === "online" || p.status === "printing",
          is_default: Boolean(p.isDefault),
          last_seen_at: now,
        });
        if (printerError) return NextResponse.json({ error: "Could not register the detected printer." }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: now,
    agentId: auth.agent.id,
    shopId: auth.shop.id,
  });
}
