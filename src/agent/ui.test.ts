import { describe, expect, it, vi } from "vitest";
import vm from "node:vm";
vi.mock("./daemon", () => ({ agentDaemon: { getStatus: () => ({ serverUrl: "https://printsathi.vercel.app" }) } }));
vi.mock("./logger", () => ({ logger: {} }));
import { AgentWebServer } from "./ui";

describe("agent dashboard status", () => {
  it("renders offline hardware as offline even when the server is connected", async () => {
    const server = new AgentWebServer();
    const html = (server as unknown as { getDashboardHtml(): string }).getDashboardHtml();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    const elements = new Map<string, Record<string, unknown>>();
    const status = {
      isPaired: true,
      isConnected: true,
      shopName: "Shop <unsafe>",
      agentName: "Test",
      serverUrl: "https://printsathi.vercel.app",
      lastHeartbeat: new Date().toISOString(),
      printers: [
        { name: "HP <M1005>", status: "offline", capabilities: { colorSupport: false } },
        { name: "Microsoft Print to PDF", status: "online" },
      ],
      stats: { jobsProcessed: 0, jobsSubmitted: 0, jobsFailed: 0, totalPagesSubmitted: 0 },
      recentLogs: [],
      currentJob: null,
    };
    const context = vm.createContext({
      document: {
        getElementById: (id: string) => {
          if (!elements.has(id)) elements.set(id, {});
          return elements.get(id);
        },
      },
      fetch: async () => ({ json: async () => structuredClone(status) }),
      setInterval: () => 0,
      window: {},
    });
    new vm.Script(script!).runInContext(context);
    await vm.runInContext("refreshStatus(true)", context);
    expect(elements.get("statusBadge")?.innerHTML).toContain("PRINTER OFFLINE");
    expect(elements.get("printersList")?.innerHTML).toContain("OFFLINE");
    expect(elements.get("printersList")?.innerHTML).not.toContain("Microsoft Print to PDF");
    expect(elements.get("printersList")?.innerHTML).toContain("HP &lt;M1005&gt;");
  });
});
