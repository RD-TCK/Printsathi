import { describe, expect, it, vi } from "vitest";
import vm from "node:vm";
vi.mock("./daemon", () => ({ agentDaemon: { getStatus: () => ({ serverUrl: "https://printiva.co.in" }) } }));
vi.mock("./logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
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

  it("handles single-sided partially_printed orders without showing Print & Approve or duplex prompt", async () => {
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
          id: "order-single-partial",
          tokenNumber: 3,
          status: "partially_printed",
          sideMode: "single_sided",
          totalAmount: 10,
          totalPages: 2,
          blackAndWhitePages: 2,
          colorPages: 0,
          remainingSeconds: 3500,
          isExpired: false,
          documents: [{ filename: "photo_1.jpg" }, { filename: "photo_2.jpg" }],
          jobs: [
            { id: "job-1", status: "completed", totalPages: 1 },
            { id: "job-2", status: "queued", totalPages: 1 },
          ],
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

    // 1. While job-2 is queued / claimed, it should show Processing...
    await vm.runInContext("refreshCounterQueue()", context);
    let listHtml = elements.get("counterQueueList")?.innerHTML as string;
    expect(listHtml).toContain("Token #3");
    expect(listHtml).toContain("Processing...");
    expect(listHtml).not.toContain("Print &amp; Approve");
    expect(listHtml).not.toContain("Front Side Printed");

    // 2. While job-2 is print_submitted, it should show Printing Pages...
    queueData.queue[0].jobs[1].status = "print_submitted";
    await vm.runInContext("refreshCounterQueue()", context);
    listHtml = elements.get("counterQueueList")?.innerHTML as string;
    expect(listHtml).toContain("Printing Pages...");
    expect(listHtml).not.toContain("Print &amp; Approve");
    expect(listHtml).not.toContain("Front Side Printed");

    // 3. If finished without all jobs completed (e.g. idle partially printed), shows Partially Printed with Re-Print
    queueData.queue[0].jobs = [];
    await vm.runInContext("refreshCounterQueue()", context);
    listHtml = elements.get("counterQueueList")?.innerHTML as string;
    expect(listHtml).toContain("Partially Printed");
    expect(listHtml).toContain("Re-Print");
    expect(listHtml).not.toContain("Print &amp; Approve");
    expect(listHtml).not.toContain("Front Side Printed");
  });

  it("renders Print Held and Force Print when a job in the order failed", async () => {
    const server = new AgentWebServer();
    const html = (server as unknown as { getDashboardHtml(): string }).getDashboardHtml();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();

    const elements = new Map<string, Record<string, unknown>>();
    const queueData = {
      queue: [
        {
          id: "order-held-1",
          publicId: "held123",
          tokenNumber: 1,
          status: "paid",
          sideMode: "single_sided",
          totalAmount: 2,
          totalPages: 2,
          blackAndWhitePages: 2,
          colorPages: 0,
          remainingSeconds: 3500,
          isExpired: false,
          documents: [{ filename: "photo_1.jpg" }, { filename: "photo_2.jpg" }],
          jobs: [
            { id: "job-h1", status: "failed", failureReason: "No compatible printer connected", totalPages: 2 },
          ],
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
    expect(listHtml).toContain("Print Held");
    expect(listHtml).toContain("Force Print");
    expect(listHtml).toContain("No compatible printer connected");
    expect(listHtml).not.toContain("⏳ Processing...");
  });

  it("toggles printer color mode case-insensitively and updates button label immediately", async () => {
    const server = new AgentWebServer();
    const html = (server as unknown as { getDashboardHtml(): string }).getDashboardHtml();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();

    const elements = new Map<string, Record<string, unknown>>();
    const status = {
      isPaired: true,
      isConnected: true,
      printers: [
        { name: "HP LaserJet M1005", status: "offline", capabilities: { colorSupport: false } },
      ],
      printerColorOverrides: {} as Record<string, boolean>,
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
      fetch: async (url: string, init?: { body?: string }) => {
        if (url === "/api/toggle-color-printer") {
          const payload = JSON.parse(init?.body || "{}");
          status.printerColorOverrides[String(payload.printerName).toLowerCase()] = Boolean(payload.isColor);
          status.printers[0].capabilities.colorSupport = Boolean(payload.isColor);
          return { ok: true, json: async () => ({ success: true }) };
        }
        return { ok: true, json: async () => structuredClone(status) };
      },
      setInterval: () => 0,
      window: {},
    });

    new vm.Script(script!).runInContext(context);
    await vm.runInContext("refreshStatus(true)", context);
    const initialHtml = elements.get("printersList")?.innerHTML as string;
    expect(initialHtml).toContain("Switch to Color");
    expect(initialHtml).toContain('data-printer="HP LaserJet M1005"');
    expect(initialHtml).toContain('data-target-color="true"');

    // Execute the exact rendered onclick handler attribute to mirror clicking the UI button
    await vm.runInContext("toggleColorPrinter('HP LaserJet M1005', true)", context);
    expect(elements.get("printersList")?.innerHTML).toContain("Switch to B&W");
    expect(elements.get("printersList")?.innerHTML).toContain("🎨 Color");
    expect(elements.get("printerCount")?.innerText).toContain("0 online (1 disconnected)");
  });

  it("displays target printer directly on awaiting tokens and opens token details on click", async () => {
    const server = new AgentWebServer();
    const html = (server as unknown as { getDashboardHtml(): string }).getDashboardHtml();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();

    const elements = new Map<string, Record<string, unknown>>();
    elements.set("tokenDetailsModal", { style: { display: "none" } });
    elements.set("tokenModalTitle", { innerHTML: "" });
    elements.set("tokenDetailsBody", { innerHTML: "" });

    const statusData = {
      isPaired: true,
      isConnected: true,
      printers: [
        { name: "HP LaserJet M1005", status: "online", isDefault: true, capabilities: { colorSupport: false } },
      ],
      printerColorOverrides: {} as Record<string, boolean>,
      stats: { jobsProcessed: 0, jobsSubmitted: 0, jobsFailed: 0, totalPagesSubmitted: 0 },
      recentLogs: [],
      currentJob: null,
    };

    const queueData = {
      queue: [
        {
          id: "order-awaiting-token",
          tokenNumber: 5,
          status: "awaiting_payment",
          totalAmount: 15,
          totalPages: 5,
          blackAndWhitePages: 5,
          colorPages: 0,
          remainingSeconds: 1800,
          isExpired: false,
          documents: [{ id: "doc-1", filename: "assignment.pdf", pageCount: 5 }],
          jobs: [],
        },
      ],
    };

    const context = vm.createContext({
      document: {
        getElementById: (id: string) => {
          if (!elements.has(id)) elements.set(id, { style: {} });
          return elements.get(id);
        },
      },
      fetch: async (url: string) => {
        if (url === "/api/counter-queue") {
          return { ok: true, json: async () => structuredClone(queueData) };
        }
        return { ok: true, json: async () => structuredClone(statusData) };
      },
      setInterval: () => 0,
      setTimeout: () => 0,
      window: {},
    });

    new vm.Script(script!).runInContext(context);
    await vm.runInContext("refreshStatus(true); refreshCounterQueue();", context);

    const listHtml = elements.get("counterQueueList")?.innerHTML as string;
    // Printer name must be visible directly on the token badge even before dispatch
    expect(listHtml).toContain("token-badge-printer");
    expect(listHtml).toContain("HP LaserJet M1005");
    expect(listHtml).toContain('data-token-order-id="order-awaiting-token"');

    // Clicking token opens details modal showing target printer for document
    vm.runInContext("openTokenDetails('order-awaiting-token')", context);
    const modal = elements.get("tokenDetailsModal") as { style: { display: string } };
    expect(modal.style.display).toBe("flex");
    const modalBody = elements.get("tokenDetailsBody")?.innerHTML as string;
    expect(modalBody).toContain("HP LaserJet M1005");
    expect(modalBody).toContain("assignment.pdf");
  });

  it("opens token inspector modal on click showing exact assigned printer names per document", async () => {
    const server = new AgentWebServer();
    const html = (server as unknown as { getDashboardHtml(): string }).getDashboardHtml();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();

    const elements = new Map<string, Record<string, unknown>>();
    elements.set("tokenDetailsModal", { style: { display: "none" } });
    elements.set("tokenModalTitle", { innerHTML: "" });
    elements.set("tokenDetailsBody", { innerHTML: "" });

    const queueData = {
      queue: [
        {
          id: "order-multi-printer",
          tokenNumber: 14,
          status: "paid",
          totalAmount: 28,
          totalPages: 12,
          blackAndWhitePages: 8,
          colorPages: 4,
          remainingSeconds: 1800,
          isExpired: false,
          assignedPrinters: ["HP LaserJet BW 2", "Epson EcoTank Color 1"],
          documents: [
            {
              id: "doc-bw",
              filename: "notes_bw.pdf",
              pageCount: 8,
              printerNames: ["HP LaserJet BW 2"],
            },
            {
              id: "doc-color",
              filename: "poster_color.pdf",
              pageCount: 4,
              printerNames: ["Epson EcoTank Color 1"],
            },
          ],
          jobs: [
            {
              id: "job-bw",
              documentId: "doc-bw",
              status: "print_submitted",
              liveRoutingStatus: "printing",
              printerName: "HP LaserJet BW 2",
              printerNames: ["HP LaserJet BW 2"],
              totalPages: 8,
              pages: [{ startPage: 1, endPage: 8, colorMode: "black_and_white" }],
            },
            {
              id: "job-color",
              documentId: "doc-color",
              status: "print_submitted",
              liveRoutingStatus: "printing",
              printerName: "Epson EcoTank Color 1",
              printerNames: ["Epson EcoTank Color 1"],
              totalPages: 4,
              pages: [{ startPage: 1, endPage: 4, colorMode: "color" }],
            },
          ],
        },
      ],
    };

    const statusData = {
      isPaired: true,
      isConnected: true,
      printers: [
        { name: "HP LaserJet BW 2", status: "printing", capabilities: { colorSupport: false } },
        { name: "Epson EcoTank Color 1", status: "printing", capabilities: { colorSupport: true } },
      ],
      activeDispatches: [
        { orderId: "order-multi-printer", jobId: "job-bw", filename: "notes_bw.pdf", printerName: "HP LaserJet BW 2", totalPages: 8, isColorPrinter: false },
        { orderId: "order-multi-printer", jobId: "job-color", filename: "poster_color.pdf", printerName: "Epson EcoTank Color 1", totalPages: 4, isColorPrinter: true },
      ],
      stats: { jobsProcessed: 2, jobsSubmitted: 2, jobsFailed: 0, totalPagesSubmitted: 12 },
      recentLogs: [],
      currentJob: null,
    };

    const context = vm.createContext({
      document: {
        getElementById: (id: string) => {
          if (!elements.has(id)) elements.set(id, { style: {} });
          return elements.get(id);
        },
      },
      fetch: async (url: string) => {
        if (url === "/api/counter-queue") {
          return { ok: true, json: async () => structuredClone(queueData) };
        }
        return { ok: true, json: async () => structuredClone(statusData) };
      },
      setInterval: () => 0,
      setTimeout: () => 0,
      window: {},
    });

    new vm.Script(script!).runInContext(context);
    await vm.runInContext("refreshStatus(true); refreshCounterQueue();", context);

    const listHtml = elements.get("counterQueueList")?.innerHTML as string;
    expect(listHtml).toContain("openTokenDetails('order-multi-printer')");
    expect(listHtml).toContain("HP LaserJet BW 2, Epson EcoTank Color 1");

    // Simulate clicking Token #14
    vm.runInContext("openTokenDetails('order-multi-printer')", context);

    const modal = elements.get("tokenDetailsModal") as { style: { display: string } };
    expect(modal.style.display).toBe("flex");

    const modalBody = elements.get("tokenDetailsBody")?.innerHTML as string;
    expect(modalBody).toContain("Currently Printing On (2 Printers)");
    expect(modalBody).toContain("notes_bw.pdf");
    expect(modalBody).toContain("HP LaserJet BW 2");
    expect(modalBody).toContain("poster_color.pdf");
    expect(modalBody).toContain("Epson EcoTank Color 1");

    // Closing resets modal display
    vm.runInContext("closeTokenDetails()", context);
    expect(modal.style.display).toBe("none");
  });
});
