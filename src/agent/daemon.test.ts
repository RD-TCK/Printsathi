import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  download: vi.fn(),
  submit: vi.fn(),
  complete: vi.fn(),
  failure: vi.fn(),
  print: vi.fn(),
  waitForPhysicalPrintCompletion: vi.fn().mockResolvedValue({ completed: true }),
  cacheFileExists: false,
}));
vi.mock("./config", () => ({
  loadConfig: () => ({ serverUrl: "http://localhost:3000", agentToken: "test", selectedPrinter: null }),
  isConfigPaired: () => true,
  saveConfig: vi.fn(),
  clearConfig: vi.fn(),
  getDocumentCacheDirectory: () => "C:\\fake\\cache",
  cleanDocumentCache: vi.fn(),
}));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./client", () => ({
  AgentApiClient: class {
    claimNextJob = mocks.claim;
    downloadDocument = mocks.download;
    reportSubmit = mocks.submit;
    reportComplete = mocks.complete;
    reportFailure = mocks.failure;
  },
}));
vi.mock("./printer-discovery", () => ({
  discoverWindowsPrinters: async () => [{ name: "Test physical printer", status: "online" }],
  findDefaultPrinter: () => ({ name: "Test physical printer" }),
  findBestPrinterForJob: () => ({ name: "Test physical printer" }),
  isPhysicalPrinter: () => true,
}));
vi.mock("./print-executor", () => ({
  prepareAndPrintDocument: mocks.print,
  waitForPhysicalPrintCompletion: mocks.waitForPhysicalPrintCompletion,
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

async function processJob() {
  const daemon = new AgentDaemon();
  await (daemon as unknown as { pollAndProcessNextJob(): Promise<void> }).pollAndProcessNextJob();
  return daemon;
}

describe("automatic dispatch safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cacheFileExists = false;
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
      { includeSeparatorPage: false },
    );
  });

  it("appends separator page in prepareAndPrintDocument on the last job in a multi-file order", async () => {
    mocks.claim.mockResolvedValue({
      id: "job-multi-6",
      orderId: "order-multi",
      isLastJobForOrder: true,
      defaultPrinter: null,
      document: { id: "doc-6", originalFilename: "file6.pdf", pageCount: 1 },
      pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "black_and_white", paperSize: "a4" }],
    });
    await processJob();
    expect(mocks.print).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ id: "job-multi-6", isLastJobForOrder: true }),
      expect.any(String),
      expect.any(Array),
      { includeSeparatorPage: true },
    );
  });
});

