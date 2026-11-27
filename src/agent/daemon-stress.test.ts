import os from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaimedJob, DiscoveredPrinter } from "./types";

const stressState = vi.hoisted(() => {
  const shopPrinters: DiscoveredPrinter[] = [
    ...Array.from({ length: 5 }, (_, i) => ({
      name: `HP LaserJet BW ${i + 1}`,
      systemIdentifier: `hp_bw_${i + 1}`,
      status: "online" as const,
      isDefault: i === 0,
      capabilities: { colorSupport: false, duplexSupport: i % 2 === 0, paperSizes: ["a4", "letter"] },
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      name: `Epson EcoTank Color ${i + 1}`,
      systemIdentifier: `epson_color_${i + 1}`,
      status: "online" as const,
      isDefault: false,
      capabilities: { colorSupport: true, duplexSupport: false, paperSizes: ["a4", "a3"] },
    })),
  ];

  return {
    shopPrinters,
    queue: [] as ClaimedJob[],
    submitted: [] as Array<{ jobId: string; printerName?: string }>,
    completed: [] as string[],
    failed: [] as Array<{ jobId: string; reason: string }>,
    activeBuilds: 0,
    peakActiveBuilds: 0,
    activePreslices: 0,
    peakActivePreslices: 0,
    printedBatches: [] as Array<{ printer: string; count: number; colorModes: string[] }>,
    liveSpoolCounts: {} as Record<string, number>,
    precacheReports: [] as Array<{ docId: string; orderId: string }>,
    counterQueueFetches: 0,
    counterQueuePayload: [] as unknown[],
    pendingApprovals: new Map<string, ClaimedJob>(),
  };
});

vi.mock("./config", () => ({
  loadConfig: () => ({
    serverUrl: "http://localhost:3000",
    agentId: "agent-stress",
    shopId: "shop-stress",
    shopName: "Stress Shop",
    agentToken: "ps_agent_stress",
    agentName: "i3-laptop",
    selectedPrinter: "HP LaserJet BW 1",
    version: "1.8.37",
    pollIntervalMs: 2000,
    heartbeatIntervalMs: 45000,
    enableSeparatorPage: true,
    disabledPrinters: [],
    printerColorOverrides: {},
  }),
  isConfigPaired: () => true,
  saveConfig: vi.fn((u: Record<string, unknown>) => u),
  clearConfig: vi.fn(),
  getDocumentCacheDirectory: () => "C:\\fake\\cache",
  cleanDocumentCache: vi.fn(),
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), getRecentLogs: () => [] },
}));

vi.mock("./whatsapp", () => ({
  whatsAppAgent: { start: vi.fn(), stop: vi.fn() },
}));

vi.mock("./client", () => ({
  AgentApiClient: class {
    async claimNextJob() {
      return stressState.queue.shift() || null;
    }
    async downloadDocument() {}
    async reportSubmit(jobId: string, printerName?: string) {
      stressState.submitted.push({ jobId, printerName });
      return true;
    }
    async reportComplete(jobId: string) {
      stressState.completed.push(jobId);
      return true;
    }
    async reportFailure(jobId: string, reason: string) {
      stressState.failed.push({ jobId, reason });
      return true;
    }
    async getCounterQueue() {
      stressState.counterQueueFetches += 1;
      return { queue: stressState.counterQueuePayload };
    }
    async reportPrecacheComplete(docId: string, orderId: string) {
      stressState.precacheReports.push({ docId, orderId });
    }
    async approveCounterOrder(orderId: string) {
      const claimedJob = stressState.pendingApprovals.get(orderId);
      return { success: true, message: "Approved", claimedJob };
    }
    async sendHeartbeat() {
      return { timestamp: new Date().toISOString() };
    }
  },
}));

vi.mock("./printer-discovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./printer-discovery")>();
  return {
    ...actual,
    discoverWindowsPrinters: async () => stressState.shopPrinters,
  };
});

vi.mock("./print-executor", () => ({
  cleanSpoolDirectory: vi.fn(),
  getPreslicedSpoolPath: (jobId: string) => `C:\\fake\\spool\\presliced_${jobId}.pdf`,
  presliceJobDocument: async (_src: string, jobId: string) => {
    stressState.activePreslices += 1;
    if (stressState.activePreslices > stressState.peakActivePreslices) {
      stressState.peakActivePreslices = stressState.activePreslices;
    }
    await new Promise((r) => setTimeout(r, 4));
    stressState.activePreslices -= 1;
    return `C:\\fake\\spool\\presliced_${jobId}.pdf`;
  },
  getAllPrinterQueueCounts: async () => ({ ...stressState.liveSpoolCounts }),
  prepareAndPrintBatch: async (items: Array<{ job: ClaimedJob }>, printerName: string) => {
    stressState.activeBuilds += 1;
    if (stressState.activeBuilds > stressState.peakActiveBuilds) {
      stressState.peakActiveBuilds = stressState.activeBuilds;
    }
    const key = printerName.toLowerCase();
    stressState.liveSpoolCounts[key] = (stressState.liveSpoolCounts[key] || 0) + 1;
    await new Promise((r) => setTimeout(r, 8));
    stressState.printedBatches.push({
      printer: printerName,
      count: items.length,
      colorModes: items.map((i) => i.job.pagesConfig[0]?.colorMode || "black_and_white"),
    });
    stressState.activeBuilds -= 1;
    return {
      success: true,
      status: "PRINT_SUBMITTED",
      printerName,
      pagesSubmitted: items.length * 2,
    };
  },
  prepareAndPrintDocument: async (_src: string, job: ClaimedJob, printerName: string) => {
    stressState.activeBuilds += 1;
    if (stressState.activeBuilds > stressState.peakActiveBuilds) {
      stressState.peakActiveBuilds = stressState.activeBuilds;
    }
    await new Promise((r) => setTimeout(r, 6));
    stressState.printedBatches.push({
      printer: printerName,
      count: 1,
      colorModes: [job.pagesConfig[0]?.colorMode || "black_and_white"],
    });
    stressState.activeBuilds -= 1;
    return {
      success: true,
      status: "PRINT_SUBMITTED",
      printerName,
      pagesSubmitted: 2,
    };
  },
  waitForPhysicalPrintCompletion: vi.fn().mockResolvedValue({ completed: true, durationMs: 0 }),
  proactiveWarmupPrinter: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (p: string) => {
        if (typeof p === "string" && p.includes("presliced_")) return false;
        if (typeof p === "string" && p.includes("cache")) return true;
        return actual.existsSync(p);
      },
      statSync: (p: string) =>
        typeof p === "string" && p.includes("cache") ? ({ size: 2048 } as ReturnType<typeof actual.statSync>) : actual.statSync(p),
    },
    existsSync: (p: string) => {
      if (typeof p === "string" && p.includes("presliced_")) return false;
      if (typeof p === "string" && p.includes("cache")) return true;
      return actual.existsSync(p);
    },
    statSync: (p: string) =>
      typeof p === "string" && p.includes("cache") ? ({ size: 2048 } as ReturnType<typeof actual.statSync>) : actual.statSync(p),
  };
});

import { AgentDaemon } from "./daemon";

function createOrderBatch(orderIndex: number, docCount: number, mixedColor = true): ClaimedJob {
  const orderId = `order-i3-${orderIndex}`;
  const jobs: ClaimedJob[] = Array.from({ length: docCount }, (_, dIdx) => {
    const isColor = mixedColor ? dIdx >= 8 : false;
    return {
      id: `job-${orderIndex}-${dIdx}`,
      orderId,
      documentId: `doc-${orderIndex}-${dIdx}`,
      shopId: "shop-stress",
      totalPages: 2,
      totalAmount: 10,
      currency: "INR",
      printAttempts: 1,
      maxAttempts: 3,
      claimedAt: new Date().toISOString(),
      claimExpiresAt: new Date(Date.now() + 45_000).toISOString(),
      defaultPrinter: "HP LaserJet BW 1",
      document: {
        id: `doc-${orderIndex}-${dIdx}`,
        storagePath: `local://doc-${orderIndex}-${dIdx}.pdf`,
        originalFilename: `file_${dIdx}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 2048,
        pageCount: 2,
      },
      pagesConfig: [
        {
          startPage: 1,
          endPage: 2,
          colorMode: isColor ? "color" : "black_and_white",
          paperSize: "a4",
          sideMode: "single_sided",
          copies: 1,
        },
      ],
    };
  });
  const primary = jobs[0];
  primary.siblingJobs = jobs.slice(1);
  return primary;
}

describe("Low-End i3 Hardware & Multi-Printer Stress Verification", () => {
  beforeEach(() => {
    stressState.queue = [];
    stressState.submitted = [];
    stressState.completed = [];
    stressState.failed = [];
    stressState.activeBuilds = 0;
    stressState.peakActiveBuilds = 0;
    stressState.activePreslices = 0;
    stressState.peakActivePreslices = 0;
    stressState.printedBatches = [];
    stressState.liveSpoolCounts = {};
    stressState.precacheReports = [];
    stressState.counterQueueFetches = 0;
    stressState.counterQueuePayload = [];
    stressState.pendingApprovals = new Map();
  });

  it("handles 3 consecutive loops of 10 simultaneous mixed orders x 12 docs on a 2-core 4GB i3 laptop without overflow or color/BW leaks", async () => {
    const cpuSpy = vi.spyOn(os, "cpus").mockReturnValue([{}, {}] as unknown as os.CpuInfo[]);
    const memSpy = vi.spyOn(os, "totalmem").mockReturnValue(4 * 1024 * 1024 * 1024);

    try {
      const daemon = new AgentDaemon();
      expect(daemon.getHardwareConcurrencyLimit()).toBe(2);

      const daemonInternals = daemon as unknown as {
        isRunning: boolean;
        discoveredPrinters: DiscoveredPrinter[];
        runAdaptivePollCycle: () => Promise<void>;
        executeClaimedJob: (job: ClaimedJob, onRouted?: () => void) => Promise<boolean>;
      };
      daemonInternals.isRunning = true;
      daemonInternals.discoveredPrinters = [...stressState.shopPrinters];

      let activeOrders = 0;
      let peakActiveOrders = 0;
      const origExecute = daemonInternals.executeClaimedJob.bind(daemon);
      daemonInternals.executeClaimedJob = async (job, onRouted) => {
        activeOrders += 1;
        if (activeOrders > peakActiveOrders) peakActiveOrders = activeOrders;
        try {
          return await origExecute(job, onRouted);
        } finally {
          activeOrders -= 1;
        }
      };

      for (let loop = 1; loop <= 3; loop++) {
        stressState.queue = Array.from({ length: 10 }, (_, idx) => createOrderBatch(loop * 100 + idx, 12, true));
        stressState.submitted = [];
        stressState.completed = [];
        stressState.failed = [];
        stressState.peakActiveBuilds = 0;
        peakActiveOrders = 0;
        stressState.printedBatches = [];
        stressState.liveSpoolCounts = {};

        let cycles = 0;
        while (stressState.queue.length > 0 && cycles < 20) {
          cycles += 1;
          await daemonInternals.runAdaptivePollCycle();
        }

        expect(stressState.completed).toHaveLength(120);
        expect(stressState.failed).toHaveLength(0);
        expect(peakActiveOrders).toBeLessThanOrEqual(2);

        const usedBwPrinters = new Set<string>();
        const usedColorPrinters = new Set<string>();
        for (const batch of stressState.printedBatches) {
          const printerObj = stressState.shopPrinters.find((p) => p.name === batch.printer)!;
          if (printerObj.capabilities?.colorSupport) {
            usedColorPrinters.add(batch.printer);
            expect(batch.colorModes.every((m) => m === "color")).toBe(true);
          } else {
            usedBwPrinters.add(batch.printer);
            expect(batch.colorModes.every((m) => m === "black_and_white")).toBe(true);
          }
        }

        expect(usedBwPrinters.size).toBe(5);
        expect(usedColorPrinters.size).toBe(4);
      }
      daemon.stop();
    } finally {
      cpuSpy.mockRestore();
      memSpy.mockRestore();
    }
  });

  it("caps parallel batch builds & balances evenly (2 orders per printer) across 5 B&W printers for 10 B&W orders x 12 docs over 3 loops", async () => {
    const cpuSpy = vi.spyOn(os, "cpus").mockReturnValue([{}, {}, {}, {}] as unknown as os.CpuInfo[]);
    const memSpy = vi.spyOn(os, "totalmem").mockReturnValue(4 * 1024 * 1024 * 1024);

    let daemon: AgentDaemon | null = null;
    try {
      daemon = new AgentDaemon();
      const daemonInternals = daemon as unknown as {
        isRunning: boolean;
        discoveredPrinters: DiscoveredPrinter[];
        runAdaptivePollCycle: () => Promise<void>;
      };
      daemonInternals.isRunning = true;
      daemonInternals.discoveredPrinters = [...stressState.shopPrinters];

      for (let loop = 1; loop <= 3; loop++) {
        stressState.queue = Array.from({ length: 10 }, (_, idx) => createOrderBatch(loop * 1000 + idx, 12, false));
        stressState.completed = [];
        stressState.failed = [];
        stressState.peakActiveBuilds = 0;
        stressState.printedBatches = [];
        stressState.liveSpoolCounts = {};

        let cycles = 0;
        while (stressState.queue.length > 0 && cycles < 20) {
          cycles += 1;
          await daemonInternals.runAdaptivePollCycle();
        }

        expect(stressState.completed).toHaveLength(120);
        expect(stressState.failed).toHaveLength(0);
        expect(stressState.peakActiveBuilds).toBeLessThanOrEqual(2);

        const countsByPrinter: Record<string, number> = {};
        for (const b of stressState.printedBatches) {
          expect(b.printer.startsWith("HP LaserJet BW")).toBe(true);
          countsByPrinter[b.printer] = (countsByPrinter[b.printer] || 0) + 1;
        }
        // Exactly 2 batches (24 docs each) per each of the 5 B&W printers = 120 docs, zero on Color printers
        expect(Object.keys(countsByPrinter)).toHaveLength(5);
        expect(Object.values(countsByPrinter).every((c) => c === 2)).toBe(true);
      }
    } finally {
      daemon?.stop();
      cpuSpy.mockRestore();
      memSpy.mockRestore();
    }
  });

  it("serializes background pre-slicing to 1 worker at a time on a low-end i3 during 40-job burst", async () => {
    const cpuSpy = vi.spyOn(os, "cpus").mockReturnValue([{}, {}] as unknown as os.CpuInfo[]);
    const memSpy = vi.spyOn(os, "totalmem").mockReturnValue(4 * 1024 * 1024 * 1024);

    let daemon: AgentDaemon | null = null;
    try {
      daemon = new AgentDaemon();
      const daemonInternals = daemon as unknown as {
        enqueuePreslice: (
          targetPath: string,
          matchingJob: { id?: string; pagesConfig?: ClaimedJob["pagesConfig"]; duplexStep?: "odd" | "even" | "all" | "none" },
        ) => void;
      };

      for (let i = 0; i < 40; i++) {
        daemonInternals.enqueuePreslice(`C:\\fake\\cache\\doc_${i}.pdf`, {
          id: `preslice-job-${i}`,
          duplexStep: "none",
          pagesConfig: [{ startPage: 1, endPage: 2, colorMode: "black_and_white", paperSize: "a4" }],
        });
      }

      // Wait for bounded serial queue to drain
      await new Promise((r) => setTimeout(r, 350));

      expect(stressState.peakActivePreslices).toBe(1);
    } finally {
      daemon?.stop();
      cpuSpy.mockRestore();
      memSpy.mockRestore();
    }
  });

  it("handles a 50-order burst (250 jobs) on a 2-core 4GB i3 with strict concurrency caps and rapid manual approvals", async () => {
    const cpuSpy = vi.spyOn(os, "cpus").mockReturnValue([{}, {}] as unknown as os.CpuInfo[]);
    const memSpy = vi.spyOn(os, "totalmem").mockReturnValue(4 * 1024 * 1024 * 1024);

    let daemon: AgentDaemon | null = null;
    try {
      daemon = new AgentDaemon();
      const daemonInternals = daemon as unknown as {
        isRunning: boolean;
        discoveredPrinters: DiscoveredPrinter[];
        runAdaptivePollCycle: () => Promise<void>;
        executeClaimedJob: (job: ClaimedJob, onRouted?: () => void) => Promise<boolean>;
      };
      daemonInternals.isRunning = true;
      daemonInternals.discoveredPrinters = [...stressState.shopPrinters];

      let activeOrders = 0;
      let peakActiveOrders = 0;
      const origExecute = daemonInternals.executeClaimedJob.bind(daemon);
      daemonInternals.executeClaimedJob = async (job, onRouted) => {
        activeOrders += 1;
        if (activeOrders > peakActiveOrders) peakActiveOrders = activeOrders;
        try {
          return await origExecute(job, onRouted);
        } finally {
          activeOrders -= 1;
        }
      };

      // 1. 50 queued orders x 5 docs = 250 jobs through sliding poll pool
      stressState.queue = Array.from({ length: 50 }, (_, idx) => createOrderBatch(idx + 1, 5, false));
      let cycles = 0;
      while (stressState.queue.length > 0 && cycles < 10) {
        cycles += 1;
        await daemonInternals.runAdaptivePollCycle();
      }
      expect(stressState.completed).toHaveLength(250);
      expect(stressState.failed).toHaveLength(0);
      expect(peakActiveOrders).toBeLessThanOrEqual(2);
      expect(stressState.peakActiveBuilds).toBeLessThanOrEqual(2);

      // 2. Rapid burst of 50 simultaneous manual Print & Approve clicks (non-blocking HTTP fast path + bounded FIFO execution)
      stressState.completed = [];
      stressState.peakActiveBuilds = 0;
      peakActiveOrders = 0;
      for (let i = 0; i < 50; i++) {
        const order = createOrderBatch(500 + i, 1, false);
        stressState.pendingApprovals.set(order.orderId, order);
      }

      const approvalResponses = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          daemon!.approveCounterOrder(`order-i3-${500 + i}`, "all", { waitForExecution: false }),
        ),
      );
      expect(approvalResponses).toHaveLength(50);

      await vi.waitFor(() => expect(stressState.completed).toHaveLength(50), { timeout: 5000 });
      expect(peakActiveOrders).toBeLessThanOrEqual(2);
      expect(stressState.peakActiveBuilds).toBeLessThanOrEqual(2);
    } finally {
      daemon?.stop();
      cpuSpy.mockRestore();
      memSpy.mockRestore();
    }
  });

  it("avoids duplicate getCounterQueue calls and reportPrecacheComplete storms across 50 cached orders", async () => {
    const cpuSpy = vi.spyOn(os, "cpus").mockReturnValue([{}, {}] as unknown as os.CpuInfo[]);
    const memSpy = vi.spyOn(os, "totalmem").mockReturnValue(4 * 1024 * 1024 * 1024);

    let daemon: AgentDaemon | null = null;
    try {
      daemon = new AgentDaemon();
      (daemon as unknown as { isRunning: boolean }).isRunning = true;

      stressState.counterQueuePayload = Array.from({ length: 50 }, (_, i) => ({
        id: `q-order-${i}`,
        status: "awaiting_payment",
        isExpired: false,
        documents: [{ id: `q-doc-${i}`, filename: `doc_${i}.pdf`, pageCount: 2 }],
        jobs: [],
      }));

      for (let poll = 0; poll < 5; poll++) {
        await daemon.getCounterQueue();
      }
      await new Promise((r) => setTimeout(r, 30));

      // Exactly 1 backend fetch per getCounterQueue() call (5 total, never doubled to 10)
      expect(stressState.counterQueueFetches).toBe(5);
      // Each of the 50 cached documents is reported pre-cached ONLY ONCE across all 5 polls (50, not 250)
      expect(stressState.precacheReports).toHaveLength(50);
    } finally {
      daemon?.stop();
      cpuSpy.mockRestore();
      memSpy.mockRestore();
    }
  });
});

