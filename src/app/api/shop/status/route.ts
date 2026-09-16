import { NextResponse } from "next/server";
import { getShopContext } from "@/lib/shop-portal";
import { availablePrinters, isFresh, isPhysical } from "@/lib/printer-availability";
import { getRazorpayServerEnv } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function GET() {
  const context = await getShopContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [printers, agents] = await Promise.all([
    context.client.from("printers").select("id,name,driver_name,desktop_agent_id,status,is_online,is_default,last_seen_at,capabilities").eq("shop_id", context.shop.id),
    context.client.from("desktop_agents").select("id,last_heartbeat_at,is_revoked").eq("shop_id", context.shop.id).eq("is_revoked", false),
  ]);
  if (printers.error || agents.error) return NextResponse.json({ error: "Connection status unavailable" }, { status: 503 });
  const inventory = (printers.data || []).filter(isPhysical);
  const connected = new Set(availablePrinters(inventory, agents.data || []).map(p => p.id));
  return NextResponse.json({
    agentConnected: (agents.data || []).some(a => isFresh(a.last_heartbeat_at)),
    paymentsReady: Boolean(getRazorpayServerEnv()),
    printers: inventory.map(p => ({ id: p.id, name: p.name, online: connected.has(p.id), color: p.capabilities?.colorSupport === true })),
  }, { headers: { "Cache-Control": "no-store" } });
}
