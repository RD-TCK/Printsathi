import { describe, expect, it, vi } from "vitest";
import vm from "node:vm";
vi.mock("./daemon", () => ({ agentDaemon: { getStatus: () => ({ serverUrl: "https://printiva.co.in" }) } }));
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

  it("handles counter queue cancellation flow and optimistic updates without blocking confirm", async () => {
    const server = new AgentWebServer();
    const html = (server as unknown as { getDashboardHtml(): string }).getDashboardHtml();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();

    const elements = new Map<string, Record<string, unknown>>();
    elements.set("counterQueueCard", { style: { display: "block" } });
    elements.set("counterQueueBadge", { innerText: "", style: {} });
    elements.set("counterQueueList", { innerHTML: "" });
    elements.set("agentTokenSearchInput", { value: "" });

    const queueData = {
      queue: [
        {
          id: "order-123",
          tokenNumber: 4,
          status: "awaiting_payment",
          totalAmount: 10,
          totalPages: 2,
          blackAndWhitePages: 2,
          colorPages: 0,
          remainingSeconds: 600,
          isExpired: false,
          documents: [{ filename: "sample.pdf" }],
        },
      ],
    };

    let cancelEndpointCalled = false;
    const context = vm.createContext({
      document: {
        getElementById: (id: string) => {
          if (!elements.has(id)) elements.set(id, {});
          return elements.get(id);
        },
      },
      fetch: async (url: string) => {
        if (url === "/api/counter-queue") {
          return { ok: true, json: async () => structuredClone(queueData) };
        }
        if (url === "/api/cancel-counter-order") {
          cancelEndpointCalled = true;
          queueData.queue[0].status = "cancelled";
          return { ok: true, json: async () => ({ success: true }) };
        }
        if (url === "/api/status") {
          return {
            ok: true,
            json: async () => ({
              isPaired: true,
              isConnected: true,
              printers: [],
              stats: { jobsProcessed: 0, jobsSubmitted: 0, jobsFailed: 0, totalPagesSubmitted: 0 },
              recentLogs: [],
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      },
      setInterval: () => 0,
      window: {},
    });

    new vm.Script(script!).runInContext(context);

    // Initial queue load
    await vm.runInContext("refreshCounterQueue()", context);
    expect(elements.get("counterQueueList")?.innerHTML).toContain("Token #4");
    expect(elements.get("counterQueueList")?.innerHTML).toContain("Print &amp; Approve");
    expect(elements.get("counterQueueList")?.innerHTML).toContain("Cancel");

    // Clicking Cancel prompts inline confirmation
    vm.runInContext("cancelCounterOrder('order-123')", context);
    expect(elements.get("counterQueueList")?.innerHTML).toContain("Cancel order?");
    expect(elements.get("counterQueueList")?.innerHTML).toContain("Yes, Cancel");
    expect(elements.get("counterQueueList")?.innerHTML).toContain("Keep");

    // Clicking Keep aborts cancellation prompt
    vm.runInContext("abortCancelCounterOrder()", context);
    expect(elements.get("counterQueueList")?.innerHTML).not.toContain("Yes, Cancel");
    expect(elements.get("counterQueueList")?.innerHTML).toContain("Print &amp; Approve");

    // Execute cancellation
    await vm.runInContext("executeCancelOrder('order-123')", context);
    expect(cancelEndpointCalled).toBe(true);
    expect(elements.get("counterQueueList")?.innerHTML).toContain("Cancelled");
  });

  it("does not render print options for expired counter tokens", async () => {
    const server = new AgentWebServer();
    const html = (server as unknown as { getDashboardHtml(): string }).getDashboardHtml();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();

    const elements = new Map<string, Record<string, unknown>>();
    elements.set("counterQueueCard", { style: { display: "block" } });
    elements.set("counterQueueBadge", { innerText: "", style: {} });
    elements.set("counterQueueList", { innerHTML: "" });
    elements.set("agentTokenSearchInput", { value: "" });

    const queueData = {
      queue: [
        {
          id: "order-expired-1",
          tokenNumber: 1,
          status: "awaiting_payment",
          totalAmount: 5,
          totalPages: 1,
          blackAndWhitePages: 1,
          colorPages: 0,
          remainingSeconds: 0,
          isExpired: true,
          expiresAt: new Date(Date.now() - 60000).toISOString(),
          documents: [{ filename: "expired_doc.pdf" }],
        },
      ],
    };

    const context = vm.createContext({
      document: {
        getElementById: (id: string) => {
          if (!elements.has(id)) elements.set(id, {});
          return elements.get(id);
        },
      },
      fetch: async (url: string) => {
        if (url === "/api/counter-queue") {
          return { ok: true, json: async () => structuredClone(queueData) };
        }
        if (url === "/api/status") {
          return {
            ok: true,
            json: async () => ({
              isPaired: true,
              isConnected: true,
              printers: [],
              stats: { jobsProcessed: 0, jobsSubmitted: 0, jobsFailed: 0, totalPagesSubmitted: 0 },
              recentLogs: [],
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      },
      setInterval: () => 0,
      window: {},
    });

    new vm.Script(script!).runInContext(context);
    await vm.runInContext("refreshCounterQueue()", context);

    const listHtml = elements.get("counterQueueList")?.innerHTML as string;
    expect(listHtml).toContain("Token #1");
    expect(listHtml).toContain("Expired (1 hr)");
    expect(listHtml).not.toContain("Print &amp; Approve");
    expect(listHtml).not.toContain("Print Document");
    expect(listHtml).toContain("⏰ Expired");
    expect(elements.get("counterQueueBadge")?.innerText).toBe("0 waiting");
  });

  it("keeps Print Next Side active for partially_printed duplex jobs even if token elapsed 1 hour", async () => {
    const server = new AgentWebServer();
    const html = (server as unknown as { getDashboardHtml(): string }).getDashboardHtml();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();

    const elements = new Map<string, Record<string, unknown>>();
    elements.set("counterQueueCard", { style: { display: "block" } });
    elements.set("counterQueueBadge", { innerText: "", style: {} });
    elements.set("counterQueueList", { innerHTML: "" });
    elements.set("agentTokenSearchInput", { value: "" });

    const queueData = {
      queue: [
        {
          id: "order-duplex-partially-printed",
          tokenNumber: 9,
          status: "partially_printed",
          duplexStep: "odd_printed",
          sideMode: "double_sided",
          totalAmount: 10,
          totalPages: 4,
          blackAndWhitePages: 4,
          colorPages: 0,
          remainingSeconds: 0,
          isExpired: false,
          expiresAt: new Date(Date.now() - 3600000).toISOString(),
          documents: [{ filename: "duplex_doc.pdf" }],
        },
      ],
    };

    const context = vm.createContext({
      document: {
        getElementById: (id: string) => {
          if (!elements.has(id)) elements.set(id, {});
          return elements.get(id);
        },
      },
      fetch: async (url: string) => {
        if (url === "/api/counter-queue") {
          return { ok: true, json: async () => structuredClone(queueData) };
        }
        if (url === "/api/status") {
          return {
            ok: true,
            json: async () => ({
              isPaired: true,
              isConnected: true,
              printers: [],
              stats: { jobsProcessed: 0, jobsSubmitted: 0, jobsFailed: 0, totalPagesSubmitted: 0 },
              recentLogs: [],
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      },
      setInterval: () => 0,
      window: {},
    });

    new vm.Script(script!).runInContext(context);
    await vm.runInContext("refreshCounterQueue()", context);

    const listHtml = elements.get("counterQueueList")?.innerHTML as string;
    expect(listHtml).toContain("Token #9");
    expect(listHtml).toContain("Front Side Printed");
    expect(listHtml).toContain("Print Next Side (Even)");
    expect(listHtml).not.toContain("Expired (1 hr)");
  });

  it("differentiates Processing, Printing Pages, and Printed states, and displays customer page configurations", async () => {
    const server = new AgentWebServer();
    const html = (server as unknown as { getDashboardHtml(): string }).getDashboardHtml();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();

    const elements = new Map<string, Record<string, unknown>>();
    elements.set("counterQueueCard", { style: { display: "block" } });
    elements.set("counterQueueBadge", { innerText: "", style: {} });
    elements.set("counterQueueList", { innerHTML: "" });
    elements.set("agentTokenSearchInput", { value: "" });

    const queueData = {
      queue: [
        {
          id: "order-proc",
          tokenNumber: 5,
          status: "paid",
          totalAmount: 12,
          totalPages: 4,
          blackAndWhitePages: 4,
          colorPages: 0,
          remainingSeconds: 1200,
          isExpired: false,
          copiesSummary: "Pages 2–5, 2 Copies",
          documents: [{ filename: "chapter1.pdf" }],
          jobs: [{ id: "job-1", status: "queued", totalPages: 4 }],
        },
      ],
    };

    const context = vm.createContext({
      document: {
        getElementById: (id: string) => {
          if (!elements.has(id)) elements.set(id, {});
          return elements.get(id);
        },
      },
      fetch: async (url: string) => {
        if (url === "/api/counter-queue") {
          return { ok: true, json: async () => structuredClone(queueData) };
        }
        if (url === "/api/status") {
          return {
            ok: true,
            json: async () => ({
              isPaired: true,
              isConnected: true,
              printers: [],
              stats: { jobsProcessed: 0, jobsSubmitted: 0, jobsFailed: 0, totalPagesSubmitted: 0 },
              recentLogs: [],
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      },
      setInterval: () => 0,
      window: {},
    });

    new vm.Script(script!).runInContext(context);

    // 1. Processing state
    await vm.runInContext("refreshCounterQueue()", context);
    let listHtml = elements.get("counterQueueList")?.innerHTML as string;
    expect(listHtml).toContain("Token #5");
    expect(listHtml).toContain("Processing...");
    expect(listHtml).toContain("Pages 2–5, 2 Copies");
    expect(listHtml).not.toContain("✅ Printed");

    // 2. Printing pages state (physically spooling / printing)
    queueData.queue[0].jobs = [{ id: "job-1", status: "print_submitted", totalPages: 4 }];
    await vm.runInContext("refreshCounterQueue()", context);
    listHtml = elements.get("counterQueueList")?.innerHTML as string;
    expect(listHtml).toContain("Printing Pages...");
    expect(listHtml).not.toContain("✅ Printed");

    // 3. Completed / printed state (physical sheets came out)
    queueData.queue[0].status = "completed";
    queueData.queue[0].jobs = [{ id: "job-1", status: "completed", totalPages: 4 }];
    await vm.runInContext("refreshCounterQueue()", context);
    listHtml = elements.get("counterQueueList")?.innerHTML as string;
    expect(listHtml).toContain("Printed");
    expect(listHtml).toContain("✅ Printed");
    expect(listHtml).toContain("Re-Print");
  });
});
