import { describe, expect, it } from "vitest";
import { availablePrinters, supportsPrint, type InventoryPrinter } from "./printer-availability";
const now = Date.now();
const printer: InventoryPrinter = { id: "p", name: "HP M1005", desktop_agent_id: "a", is_online: true, status: "online", last_seen_at: new Date(now).toISOString(), capabilities: { colorSupport: false, paperSizes: ["A4", "Letter"] } };
const agents = [{ id: "a", last_heartbeat_at: new Date(now).toISOString() }];
describe("live physical printer availability", () => {
  it("requires both a fresh device and its own fresh agent", () => {
    expect(availablePrinters([printer], agents, now)).toHaveLength(1);
    expect(availablePrinters([printer], [{ ...agents[0], id: "other" }], now)).toHaveLength(0);
    expect(availablePrinters([printer], agents, now + 31000)).toHaveLength(0);
    expect(availablePrinters([{ ...printer, last_seen_at: new Date(now - 31000).toISOString() }], agents, now)).toHaveLength(0);
  });
  it("never treats offline, errored, revoked, or virtual printers as available", () => {
    for (const update of [{ status: "offline" }, { is_online: false }, { status: "error" }, { name: "Microsoft Print to PDF" }, { name: "OneNote (Desktop)" }]) expect(availablePrinters([{ ...printer, ...update }], agents, now)).toHaveLength(0);
    expect(availablePrinters([printer], [{ ...agents[0], is_revoked: true }], now)).toHaveLength(0);
  });
  it("requires actual color and paper capabilities", () => {
    expect(supportsPrint(printer, "black_and_white", "a4")).toBe(true);
    expect(supportsPrint(printer, "color", "a4")).toBe(false);
    expect(supportsPrint(printer, "black_and_white", "a3")).toBe(false);
  });
});
