import { WebAutoPrintStation } from "@/components/web-auto-print";
import { PrinterStatusRefresh } from "@/components/printer-status-refresh";
import { availablePrinters, isPhysical } from "@/lib/printer-availability";
import Link from "next/link";
import { Check, Download, KeyRound, Monitor, Printer, ShieldAlert, Trash2 } from "lucide-react";
import { getShopContext, formatStatus, canManageShop, isHeartbeatFresh } from "@/lib/shop-portal";
import { ShopPageHeader } from "@/components/shop-page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { generateAgentPairingCode, setDefaultPrinter, revokeAgent } from "@/app/shop/actions";

export const dynamic = "force-dynamic";

type AgentRecord = {
  id: string;
  name: string;
  version: string | null;
  status: string;
  last_heartbeat_at: string | null;
  last_error: string | null;
  machine_info: Record<string, unknown> | null;
  is_revoked: boolean;
};

type PrinterRecord = {
  id: string;
  name: string;
  system_identifier: string | null;
  status: string;
  driver_name: string | null;
  is_default: boolean;
  is_online: boolean;
  capabilities: Record<string, unknown> | null;
  last_seen_at: string | null;
  desktop_agent_id: string | null;
};

interface PrinterPageProps {
  searchParams: Promise<{
    pairingCode?: string;
    expires?: string;
    success?: string;
    error?: string;
  }>;
}

export default async function PrinterPage({ searchParams }: PrinterPageProps) {
  const context = await getShopContext();
  if (!context) return <Alert tone="error">Shop workspace unavailable.</Alert>;

  const params = await searchParams;
  const canManage = canManageShop(context);

  // Fetch agents and printers
  const [{ data: agents }, { data: printers }] = await Promise.all([
    context.client
      .from("desktop_agents")
      .select("id, name, version, status, last_heartbeat_at, last_error, machine_info, is_revoked")
      .eq("shop_id", context.shop.id)
      .eq("is_revoked", false)
      .order("last_heartbeat_at", { ascending: false }),
    context.client
      .from("printers")
      .select(
        "id, name, system_identifier, status, driver_name, is_default, is_online, capabilities, last_seen_at, desktop_agent_id",
      )
      .eq("shop_id", context.shop.id)
      .order("is_default", { ascending: false })
      .order("last_seen_at", { ascending: false }),
  ]);

  const activeAgents: AgentRecord[] = agents ?? [];
  const available = new Set(availablePrinters(printers || [], activeAgents).map(p => p.id));
  const printerList: PrinterRecord[] = (printers || []).filter(isPhysical).map(p => ({ ...p, is_online: available.has(p.id), status: available.has(p.id) ? p.status : "offline" }));

  return (
    <div className="space-y-8">
      <PrinterStatusRefresh />
      <ShopPageHeader
        eyebrow="Hardware bridge"
        title="Printer connection &amp; Windows Agent"
        description="The Windows Desktop Agent connects your physical printer subsystem to Printiva. All discoveries, queue status, and heartbeats are verified live."
        action={
          <div className="flex items-center gap-3">
            <Button asChild variant="secondary">
              <Link href="/download">
                <Download className="size-4" />
                Download Agent
              </Link>
            </Button>
          </div>
        }
      />

      <WebAutoPrintStation shopName={context.shop.name} />

      {params.error ? (
        <Alert tone="error" title="Action failed">
          {params.error}
        </Alert>
      ) : null}

      {params.success ? (
        <Alert tone="success" title="Success">
          {params.success}
        </Alert>
      ) : null}

      {params.pairingCode ? (
        <Card className="border-emerald-300 bg-emerald-50/50 p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <KeyRound className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-brand-950">New Agent Pairing Code Generated</h2>
              <p className="text-xs text-muted">
                Expires in 15 minutes. Enter this code into your Windows Desktop Agent dashboard.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="rounded-xl border border-emerald-300 bg-white px-5 py-3 font-mono text-2xl font-bold tracking-widest text-brand-950">
              {params.pairingCode}
            </div>
            <p className="text-xs text-muted">
              Single-use authorization code scoped strictly to <b>{context.shop.name}</b>.
            </p>
          </div>
        </Card>
      ) : null}

      {activeAgents.length === 0 ? (
        <Card className="p-8">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-800">
            <Monitor className="size-8" />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-brand-950">Windows Desktop Agent (Optional)</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Install and run the Windows agent on the computer connected to your printer for automatic printing. Generate a pairing code below, then monitor paid jobs in <Link href="/shop/jobs" className="font-semibold text-brand-700 underline">Jobs</Link>. Keep the agent running so customers’ documents print without opening a browser print dialog.
          </p>
          {canManage ? (
            <form action={generateAgentPairingCode} className="mt-6">
              <Button type="submit">
                <KeyRound className="size-4" />
                Generate Pairing Code
              </Button>
            </form>
          ) : (
            <p className="mt-4 text-xs text-muted">Only shop owners or managers can generate pairing codes.</p>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-brand-950">Registered Desktop Agents</h2>
            {canManage ? (
              <form action={generateAgentPairingCode}>
                <Button variant="secondary" type="submit">
                  <KeyRound className="size-4" />
                  Pair Another Computer
                </Button>
              </form>
            ) : null}
          </div>

          <div className="grid gap-5">
            {activeAgents.map((agent) => {
              const isFresh = isHeartbeatFresh(agent.last_heartbeat_at, 30000) && agent.status === "online";
              const hostname = (agent.machine_info?.hostname as string) || "Windows Machine";
              const osPlatform = (agent.machine_info?.platform as string) || "Windows";

              return (
                <Card key={agent.id} className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
                        <Monitor className="size-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-brand-950">{agent.name}</h3>
                        <p className="text-xs text-muted">
                          {hostname} ({osPlatform}) &middot; Agent v{agent.version || "1.0.0"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={isFresh ? "success" : "warning"}>
                        {isFresh ? "ONLINE & READY" : "OFFLINE / STALE"}
                      </Badge>
                      {canManage ? (
                        <form action={revokeAgent}>
                          <input type="hidden" name="agentId" value={agent.id} />
                          <Button variant="secondary" type="submit" aria-label="Revoke Agent">
                            <Trash2 className="size-4 text-red-600" />
                            Revoke
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 border-t border-line/60 pt-4 text-xs sm:grid-cols-3">
                    <div>
                      <span className="text-muted">Agent ID:</span>{" "}
                      <span className="font-mono text-brand-950">{agent.id.slice(0, 12)}...</span>
                    </div>
                    <div>
                      <span className="text-muted">Last Heartbeat:</span>{" "}
                      <span className="font-semibold text-brand-950">
                        {agent.last_heartbeat_at
                          ? new Date(agent.last_heartbeat_at).toLocaleTimeString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: true,
                            }) + " IST"
                          : "No heartbeat yet"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Heartbeat Health:</span>{" "}
                      <span className={isFresh ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}>
                        {isFresh ? "Healthy (<30s)" : "Stale / Offline"}
                      </span>
                    </div>
                  </div>

                  {agent.last_error ? (
                    <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                      <ShieldAlert className="size-4 shrink-0" />
                      <span>{agent.last_error}</span>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>

          <div className="mt-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-brand-950">Discovered Windows Printers</h2>
                <p className="text-sm text-muted">
                  Printers reported live by your Windows Agent. Printiva <b>automatically switches</b> between color
                  and B&amp;W printers based on customer orders without requiring manual selection.
                </p>
              </div>
              <Badge tone="success">Auto-Routing Active</Badge>
            </div>

            {printerList.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted">
                No printers discovered yet. Ensure the Windows Desktop Agent is running and connected.
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {printerList.map((printer) => {
                  const caps = printer.capabilities as { colorSupport?: boolean } | null;
                  const isColor = Boolean(caps?.colorSupport);
                  return (
                    <Card key={printer.id} className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-800">
                            <Printer className="size-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-brand-950">{printer.name}</h3>
                              <Badge tone={isColor ? "success" : "neutral"}>{isColor ? "🎨 Color" : "📄 B&W"}</Badge>
                            </div>
                            <p className="text-xs text-muted">{printer.driver_name || "Standard Windows Driver"}</p>
                          </div>
                        </div>
                        <Badge tone={printer.status === "online" ? "success" : "warning"}>
                          {formatStatus(printer.status)}
                        </Badge>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-xs">
                        <span className="text-muted">
                          Last detected:{" "}
                          <b className="text-slate-800">
                            {printer.last_seen_at
                              ? new Date(printer.last_seen_at).toLocaleTimeString("en-IN", {
                                  timeZone: "Asia/Kolkata",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                  hour12: true,
                                }) + " IST"
                              : "—"}
                          </b>
                        </span>
                        {printer.is_default ? (
                          <Badge tone="success">
                            <Check className="size-3" /> DEFAULT PRINTER
                          </Badge>
                        ) : canManage ? (
                          <form action={setDefaultPrinter}>
                            <input type="hidden" name="printerId" value={printer.id} />
                            <Button variant="secondary" type="submit">
                              Set as Default
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
