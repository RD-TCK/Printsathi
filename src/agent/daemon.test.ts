import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  download: vi.fn(),
  submit: vi.fn(),
  complete: vi.fn(),
  failure: vi.fn(),
  print: vi.fn(),
  printBatch: vi.fn(),
  approve: vi.fn(),
  findBestPrinter: vi.fn(),
  saveConfig: vi.fn(),
  waitForPhysicalPrintCompletion: vi.fn().mockResolvedValue({ completed: true }),
  cacheFileExists: false,
}));
vi.mock("./config", () => ({
  loadConfig: () => ({ serverUrl: "http://localhost:3000", agentToken: "test", selectedPrinter: null }),
  isConfigPaired: () => true,
  saveConfig: (...args: any[]) => mocks.saveConfig(...args),
  clearConfig: vi.fn(),
  getDocumentCacheDirectory: () => "C:\\fake\\cache",
  cleanDocumentCache: vi.fn(),
}));
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), getRecentLogs: () => [] },
}));
vi.mock("./client", () => ({
  AgentApiClient: class {
    claimNextJob = mocks.claim;
    downloadDocument = mocks.download;
    reportSubmit = mocks.submit;
    reportComplete = mocks.complete;
    reportFailure = mocks.failure;
    approveCounterOrder = mocks.approve;
  },
}));
vi.mock("./printer-discovery", () => ({
  discoverWindowsPrinters: async () => [
    { name: "Test physical printer", status: "online", capabilities: { colorSupport: false, duplexSupport: false } },
  ],
  findDefaultPrinter: () => ({ name: "Test physical printer", capabilities: { colorSupport: false, duplexSupport: false } }),
  findBestPrinterForJob: (...args: any[]) => mocks.findBestPrinter(...args),
  isPhysicalPrinter: () => true,
}));
vi.mock("./print-executor", () => ({
  prepareAndPrintDocument: mocks.print,
  prepareAndPrintBatch: mocks.printBatch,
  waitForPhysicalPrintCompletion: mocks.waitForPhysicalPrintCompletion,
  resetPrinterSpoolQueue: vi.fn(),
  proactiveWarmupPrinter: vi.fn(),
}));
vi.mock("node:fs", () => ({
  default: {
    existsSync: (p: string) => {
      if (typeof p === "string" && p.includes("cache")) return mocks.cacheFileExists;
      return true;
    },
    statSync: () => ({ size: 1024 }),
    mkdirSync: () => {},
    unlinkSync: () => {},
  },
}));
import { AgentDaemon } from "./daemon";

async function processJob(configure?: (daemon: AgentDaemon) => void) {
  const daemon = new AgentDaemon();
  if (configure) configure(daemon);
  await (daemon as unknown as { pollAndProcessNextJob(): Promise<void> }).pollAndProcessNextJob();
  return daemon;
}

describe("automatic dispatch safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cacheFileExists = false;
    mocks.saveConfig.mockImplementation((update: Record<string, unknown>) => ({
      serverUrl: "http://localhost:3000",
      agentToken: "test",
      selectedPrinter: null,
      ...update,
    }));
    mocks.claim.mockResolvedValue({
      id: "job-123456",
      orderId: "order-123456",
      defaultPrinter: null,
      document: { id: "document-123456", originalFilename: "test.pdf", pageCount: 2 },
      pagesConfig: [{ startPage: 1, endPage: 2, colorMode: "black_and_white", paperSize: "a4" }],
    });
    mocks.download.mockResolvedValue(undefined);
    mocks.submit.mockResolvedValue(true);
    mocks.complete.mockResolvedValue(true);
    mocks.waitForPhysicalPrintCompletion.mockResolvedValue({ completed: true });
    mocks.failure.mockResolvedValue(true);
    mocks.print.mockResolvedValue({ success: true, pagesSubmitted: 2 });
    mocks.printBatch.mockResolvedValue({ success: true, pagesSubmitted: 4 });
    mocks.findBestPrinter.mockImplementation((_printers: any, req: any) => {
      if (req?.colorMode === "color" && !req?.allowMonoFallbackForColor) {
        return null;
      }
      return { name: "Test physical printer", capabilities: { colorSupport: false, duplexSupport: false } };
    });
  });

  it("persists dispatch before sending the customer's settings to the printer", async () => {
    await processJob();
    expect(mocks.submit.mock.invocationCallOrder[0]).toBeLessThan(mocks.print.mock.invocationCallOrder[0]);
    expect(mocks.print.mock.calls[0][3]).toEqual([
      { startPage: 1, endPage: 2, colorMode: "black_and_white", paperSize: "a4" },
    ]);
    expect(mocks.waitForPhysicalPrintCompletion).toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalledWith("job-123456");
    expect(mocks.failure).not.toHaveBeenCalled();
  });

  it("does not print when dispatch acknowledgement is lost", async () => {
    mocks.submit.mockRejectedValue(new Error("Connection lost"));
    await processJob();
    expect(mocks.print).not.toHaveBeenCalled();
    expect(mocks.failure).toHaveBeenCalledWith("job-123456", "Connection lost", false);
  });

  it("never automatically retries after the renderer starts", async () => {
    mocks.print.mockResolvedValue({ success: false, errorMessage: "Partial output" });
    await processJob();
    expect(mocks.failure).toHaveBeenCalledWith("job-123456", "Partial output", false);
  });

  it("allows retrying a failed download before dispatch", async () => {
    mocks.download.mockRejectedValue(new Error("Download failed"));
    await processJob();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.print).not.toHaveBeenCalled();
    expect(mocks.failure).toHaveBeenCalledWith("job-123456", "Download failed", true);
  });

  it("prints directly from local cache when present without cloud download", async () => {
    mocks.cacheFileExists = true;
    await processJob();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.submit).toHaveBeenCalled();
    expect(mocks.print).toHaveBeenCalled();
  });

  it("omits separator page in prepareAndPrintDocument for intermediate jobs in a multi-file order", async () => {
    mocks.claim.mockResolvedValue({
      id: "job-multi-1",
      orderId: "order-multi",
      isLastJobForOrder: false,
      defaultPrinter: null,
      document: { id: "doc-1", originalFilename: "file1.pdf", pageCount: 1 },
      pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "black_and_white", paperSize: "a4" }],
    });
    await processJob();
    expect(mocks.print).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: "job-multi-1", isLastJobForOrder: false }),
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ includeSeparatorPage: false }),
    );
  });

  it("appends separator page in prepareAndPrintDocument on the last job in a multi-file order when enabled", async () => {
    mocks.claim.mockResolvedValue({
      id: "job-multi-6",
      orderId: "order-multi",
      isLastJobForOrder: true,
      defaultPrinter: null,
      document: { id: "doc-6", originalFilename: "file6.pdf", pageCount: 1 },
      pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "black_and_white", paperSize: "a4" }],
    });
    await processJob((d) => {
      (d as unknown as { config: { enableSeparatorPage: boolean } }).config.enableSeparatorPage = true;
    });
    expect(mocks.print).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: "job-multi-6", isLastJobForOrder: true }),
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ includeSeparatorPage: true }),
    );
  });

  it("prints continuous batch when siblingJobs are returned for multi-file order", async () => {
    mocks.claim.mockResolvedValue({
      id: "job-pic-1",
      orderId: "order-pics",
      defaultPrinter: null,
      document: { id: "doc-1", originalFilename: "pic1.jpg", pageCount: 1 },
      pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "black_and_white", paperSize: "a4" }],
      siblingJobs: [
        {
          id: "job-pic-2",
          orderId: "order-pics",
          defaultPrinter: null,
          document: { id: "doc-2", originalFilename: "pic2.jpg", pageCount: 1 },
          pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "black_and_white", paperSize: "a4" }],
        },
        {
          id: "job-pic-3",
          orderId: "order-pics",
          defaultPrinter: null,
          document: { id: "doc-3", originalFilename: "pic3.jpg", pageCount: 1 },
          pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "black_and_white", paperSize: "a4" }],
        },
        {
          id: "job-pic-4",
          orderId: "order-pics",
          defaultPrinter: null,
          document: { id: "doc-4", originalFilename: "pic4.jpg", pageCount: 1 },
          pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "black_and_white", paperSize: "a4" }],
        },
      ],
    });

    await processJob();

    // Verify prepareAndPrintBatch was called with all 4 jobs in 1 continuous spool operation
    expect(mocks.printBatch).toHaveBeenCalledTimes(1);
    expect(mocks.printBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ job: expect.objectContaining({ id: "job-pic-1" }) }),
        expect.objectContaining({ job: expect.objectContaining({ id: "job-pic-2" }) }),
        expect.objectContaining({ job: expect.objectContaining({ id: "job-pic-3" }) }),
        expect.objectContaining({ job: expect.objectContaining({ id: "job-pic-4" }) }),
      ]),
      expect.any(String),
      expect.objectContaining({ includeSeparatorPage: true }),
    );
    // Verify reportSubmit was called for all 4 jobs
    expect(mocks.submit).toHaveBeenCalledWith("job-pic-1", expect.any(String), undefined);
    expect(mocks.submit).toHaveBeenCalledWith("job-pic-2", expect.any(String), undefined);
    expect(mocks.submit).toHaveBeenCalledWith("job-pic-3", expect.any(String), undefined);
    expect(mocks.submit).toHaveBeenCalledWith("job-pic-4", expect.any(String), undefined);
    // Verify reportComplete was called for all 4 jobs
    expect(mocks.complete).toHaveBeenCalledWith("job-pic-1");
    expect(mocks.complete).toHaveBeenCalledWith("job-pic-2");
    expect(mocks.complete).toHaveBeenCalledWith("job-pic-3");
    expect(mocks.complete).toHaveBeenCalledWith("job-pic-4");
    // Verify physical print completion was monitored once for the whole continuous batch
    expect(mocks.waitForPhysicalPrintCompletion).toHaveBeenCalledTimes(1);
  });

  it("skips physical print queue wait on intermediate single jobs to prevent motor spin-down", async () => {
    mocks.claim.mockResolvedValue({
      id: "job-intermediate",
      orderId: "order-multi",
      isLastJobForOrder: false,
      defaultPrinter: null,
      document: { id: "doc-inter", originalFilename: "file.pdf", pageCount: 1 },
      pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "black_and_white", paperSize: "a4" }],
    });
    await processJob();
    expect(mocks.waitForPhysicalPrintCompletion).not.toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalledWith("job-intermediate");
  });

  it("dispatches instantly via atomic claimedJob returned on approveCounterOrder (zero-latency fast path)", async () => {
    const daemon = new AgentDaemon();
    mocks.approve.mockResolvedValue({
      success: true,
      claimedJob: {
        id: "job-fast-1",
        orderId: "order-fast",
        defaultPrinter: null,
        document: { id: "doc-fast-1", originalFilename: "instant.pdf", pageCount: 1 },
        pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "black_and_white", paperSize: "a4" }],
      },
    });

    await daemon.approveCounterOrder("order-fast", "all");

    // Fast-path: immediately submitted & printed without polling or calling claimNextJob!
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.submit).toHaveBeenCalledWith("job-fast-1", "Test physical printer", undefined);
    expect(mocks.print).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: "job-fast-1" }),
      "Test physical printer",
      expect.any(Array),
      expect.any(Object),
    );
    expect(mocks.complete).toHaveBeenCalledWith("job-fast-1");
  });

  it("splits multi-job order: prints B&W jobs and holds Color job when shop lacks color printer", async () => {
    mocks.claim.mockResolvedValue({
      id: "job-bw-1",
      orderId: "order-split",
      defaultPrinter: null,
      document: { id: "doc-bw-1", originalFilename: "notes.pdf", pageCount: 1 },
      pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "black_and_white", paperSize: "a4" }],
      siblingJobs: [
        {
          id: "job-color-1",
          orderId: "order-split",
          defaultPrinter: null,
          document: { id: "doc-color-1", originalFilename: "photo.jpg", pageCount: 1 },
          pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "color", paperSize: "a4" }],
        },
        {
          id: "job-bw-2",
          orderId: "order-split",
          defaultPrinter: null,
          document: { id: "doc-bw-2", originalFilename: "doc2.pdf", pageCount: 1 },
          pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "black_and_white", paperSize: "a4" }],
        },
      ],
    });

    await processJob();

    // 1. Ready B&W jobs (job-bw-1 and job-bw-2) are batched and printed on the mono printer!
    expect(mocks.printBatch).toHaveBeenCalledTimes(1);
    expect(mocks.printBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ job: expect.objectContaining({ id: "job-bw-1" }) }),
        expect.objectContaining({ job: expect.objectContaining({ id: "job-bw-2" }) }),
      ]),
      "Test physical printer",
      expect.any(Object),
    );

    // 2. Both B&W jobs are submitted and marked complete
    expect(mocks.submit).toHaveBeenCalledWith("job-bw-1", "Test physical printer", undefined);
    expect(mocks.submit).toHaveBeenCalledWith("job-bw-2", "Test physical printer", undefined);
    expect(mocks.complete).toHaveBeenCalledWith("job-bw-1");
    expect(mocks.complete).toHaveBeenCalledWith("job-bw-2");

    // 3. Color job was held and reported to server as held, NEVER submitted or completed in B&W!
    expect(mocks.submit).not.toHaveBeenCalledWith("job-color-1", expect.any(String), undefined);
    expect(mocks.complete).not.toHaveBeenCalledWith("job-color-1");
    expect(mocks.failure).toHaveBeenCalledWith(
      "job-color-1",
      expect.stringContaining("No free compatible Color printer is available"),
      true,
    );
  });

  it("prints held color job on monochrome printer when Force Print is approved", async () => {
    const daemon = new AgentDaemon();
    mocks.approve.mockResolvedValue({
      success: true,
      claimedJob: {
        id: "job-color-1",
        orderId: "order-split",
        defaultPrinter: null,
        document: { id: "doc-color-1", originalFilename: "photo.jpg", pageCount: 1 },
        pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "color", paperSize: "a4" }],
      },
    });

    // Shopkeeper clicks Force Print
    await daemon.approveCounterOrder("order-split", "all");

    // On Force Print, mono fallback is allowed, so color job prints on the mono printer
    expect(mocks.submit).toHaveBeenCalledWith("job-color-1", "Test physical printer", undefined);
    expect(mocks.print).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: "job-color-1", allowMonoFallback: true }),
      "Test physical printer",
      expect.any(Array),
      expect.any(Object),
    );
    expect(mocks.complete).toHaveBeenCalledWith("job-color-1");
  });

  it("splits single-job multi-page document: prints B&W pages and holds Color page on mono shop", async () => {
    mocks.claim.mockResolvedValue({
      id: "job-mixed-doc",
      orderId: "order-mixed",
      defaultPrinter: null,
      document: { id: "doc-mixed", originalFilename: "mixed.pdf", pageCount: 2 },
      pagesConfig: [
        { startPage: 1, endPage: 1, colorMode: "color", paperSize: "a4" },
        { startPage: 2, endPage: 2, colorMode: "black_and_white", paperSize: "a4" },
      ],
    });

    await processJob();

    // 1. Page 2 (B&W) prints on the mono printer!
    expect(mocks.print).toHaveBeenCalledTimes(1);
    expect(mocks.print).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: "job-mixed-doc" }),
      "Test physical printer",
      [{ startPage: 2, endPage: 2, colorMode: "black_and_white", paperSize: "a4" }],
      expect.any(Object),
    );

    // 2. Job is submitted to printer
    expect(mocks.submit).toHaveBeenCalledWith("job-mixed-doc", "Test physical printer", undefined);

    // 3. Color page is held and reported to server as held
    expect(mocks.complete).not.toHaveBeenCalledWith("job-mixed-doc");
    expect(mocks.failure).toHaveBeenCalledWith(
      "job-mixed-doc",
      expect.stringContaining("Black & White page(s) printed. Color page(s) held"),
      true,
    );
  });

  it("prints all pages of mixed document on mono printer when Force Print is approved", async () => {
    const daemon = new AgentDaemon();
    mocks.approve.mockResolvedValue({
      success: true,
      claimedJob: {
        id: "job-mixed-doc",
        orderId: "order-mixed",
        defaultPrinter: null,
        document: { id: "doc-mixed", originalFilename: "mixed.pdf", pageCount: 2 },
        pagesConfig: [
          { startPage: 1, endPage: 1, colorMode: "color", paperSize: "a4" },
          { startPage: 2, endPage: 2, colorMode: "black_and_white", paperSize: "a4" },
        ],
      },
    });

    // Shopkeeper clicks Force Print
    await daemon.approveCounterOrder("order-mixed", "all");

    // Both groups are printed on the mono printer
    expect(mocks.print).toHaveBeenCalledTimes(2);
    expect(mocks.submit).toHaveBeenCalledWith("job-mixed-doc", "Test physical printer", undefined);
    expect(mocks.complete).toHaveBeenCalledWith("job-mixed-doc");
    expect(mocks.failure).not.toHaveBeenCalled();
  });

  it("applies Switch to Color override case-insensitively and updates status immediately", async () => {
    const daemon = new AgentDaemon();
    (daemon as unknown as { discoveredPrinters: any[] }).discoveredPrinters = [
      {
        name: "HP LaserJet M1005",
        status: "offline",
        capabilities: { colorSupport: false, duplexSupport: false, paperSizes: ["A4"] },
      },
    ];

    daemon.setPrinterColorOverride("HP LaserJet M1005", true);

    const status = daemon.getStatus();
    expect(status.printerColorOverrides?.["hp laserjet m1005"]).toBe(true);
    expect(status.printers[0].capabilities?.colorSupport).toBe(true);
    expect(status.printers[0].isColorUserOverride).toBe(true);
  });
});

