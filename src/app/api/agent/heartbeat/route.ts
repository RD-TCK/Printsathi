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

  // 2. Reconcile Discovered Printers in batched queries (avoids offline flicker & N+1 round-trips)
  if (parsed.data.printers !== undefined) {
    const { data: existingPrinters, error: lookupError } = await adminClient
      .from("printers")
      .select("id, system_identifier, desktop_agent_id, is_default")
      .eq("shop_id", auth.shop.id);
    if (lookupError) return NextResponse.json({ error: "Could not look up the printer inventory." }, { status: 500 });

    const existingBySystemId = new Map<string, { id: string; desktop_agent_id: string | null; is_default: boolean }>();
    for (const row of existingPrinters ?? []) {
      if (row.system_identifier) {
        existingBySystemId.set(row.system_identifier, {
          id: row.id,
          desktop_agent_id: row.desktop_agent_id,
          is_default: Boolean(row.is_default),
        });
      }
    }

    const activeSystemIds = new Set<string>();
    const inserts: Array<Record<string, unknown>> = [];
    const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];

    for (const p of parsed.data.printers) {
      if (/onenote|print to pdf|xps|fax|pdfcreator|cutepdf/i.test(`${p.name} ${p.driverName || ""}`)) continue;
      const systemId =
        p.systemIdentifier ||
        p.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "_");
      if (activeSystemIds.has(systemId)) continue;
      activeSystemIds.add(systemId);

      const existing = existingBySystemId.get(systemId);
      const isOnline = p.status === "online" || p.status === "printing";
      if (existing) {
        updates.push({
          id: existing.id,
          payload: {
            desktop_agent_id: auth.agent.id,
            name: p.name,
            status: p.status,
            driver_name: p.driverName,
            capabilities: p.capabilities || {},
            is_online: isOnline,
            is_default: existing.is_default,
            last_seen_at: now,
          },
        });
      } else {
        inserts.push({
          shop_id: auth.shop.id,
          desktop_agent_id: auth.agent.id,
          name: p.name,
          system_identifier: systemId,
          status: p.status,
          driver_name: p.driverName,
          capabilities: p.capabilities || {},
          is_online: isOnline,
          is_default: Boolean(p.isDefault),
          last_seen_at: now,
        });
      }
    }

    const stalePrinterIds = (existingPrinters ?? [])
      .filter((row) => row.desktop_agent_id === auth.agent.id && !activeSystemIds.has(row.system_identifier || ""))
      .map((row) => row.id);

    const tasks: Array<PromiseLike<{ error: unknown }>> = [];
    if (stalePrinterIds.length > 0) {
      tasks.push(
        adminClient
          .from("printers")
          .update({ status: "offline", is_online: false })
          .in("id", stalePrinterIds),
      );
    }
    if (inserts.length > 0) {
      tasks.push(adminClient.from("printers").insert(inserts));
    }
    for (const u of updates) {
      tasks.push(adminClient.from("printers").update(u.payload).eq("id", u.id));
    }

    const results = await Promise.all(tasks);
    if (results.some((r) => Boolean(r.error))) {
      return NextResponse.json({ error: "Could not reconcile printer inventory." }, { status: 500 });
    }
  } else {
    // Touch last_seen_at for all online printers of this connected agent so they never expire while agent is active
    await adminClient
      .from("printers")
      .update({ last_seen_at: now })
      .eq("shop_id", auth.shop.id)
      .eq("desktop_agent_id", auth.agent.id)
      .eq("is_online", true);
  }

  return NextResponse.json({
    success: true,
    timestamp: now,
    agentId: auth.agent.id,
    shopId: auth.shop.id,
  });
}
