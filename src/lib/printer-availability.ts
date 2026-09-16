export const PRINTER_FRESHNESS_MS = 30000;
export function isFresh(timestamp: string | null | undefined, now = Date.now()): boolean {
  const age = now - new Date(timestamp || "").getTime();
  return Number.isFinite(age) && age >= -5000 && age < PRINTER_FRESHNESS_MS;
}
export type InventoryPrinter = {
  id: string; name: string; driver_name?: string | null; desktop_agent_id?: string | null;
  status: string; is_online: boolean; is_default?: boolean; last_seen_at?: string | null;
  capabilities?: { colorSupport?: boolean; paperSizes?: string[]; isVirtual?: boolean } | null;
};
export type InventoryAgent = { id: string; last_heartbeat_at: string | null; is_revoked?: boolean };
export function isPhysical(printer: InventoryPrinter): boolean {
  return !printer.capabilities?.isVirtual && !/onenote|print to pdf|xps|fax|pdfcreator|cutepdf|bullzip|dopdf/i.test(`${printer.name} ${printer.driver_name || ""}`);
}
export function availablePrinters(printers: InventoryPrinter[], agents: InventoryAgent[], now = Date.now()): InventoryPrinter[] {
  return printers.filter((p) => isPhysical(p) && p.is_online && ["online", "printing"].includes(p.status) &&
    isFresh(p.last_seen_at, now) && agents.some((a) => a.id === p.desktop_agent_id && !a.is_revoked && isFresh(a.last_heartbeat_at, now)));
}
export function supportsPrint(printer: InventoryPrinter, color: string, paper: string): boolean {
  return (color !== "color" || printer.capabilities?.colorSupport === true) &&
    (printer.capabilities?.paperSizes || ["A4"]).some((size) => size.toLowerCase().includes(paper.toLowerCase()));
}
