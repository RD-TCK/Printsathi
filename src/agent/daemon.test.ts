import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(), download: vi.fn(), submit: vi.fn(), failure: vi.fn(), print: vi.fn(),
}));
vi.mock("./config", () => ({
  loadConfig: () => ({ serverUrl: "http://localhost:3000", agentToken: "test", selectedPrinter: null }),
  isConfigPaired: () => true, saveConfig: vi.fn(), clearConfig: vi.fn(),
}));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./client", () => ({ AgentApiClient: class {
  claimNextJob = mocks.claim;
  downloadDocument = mocks.download;
  reportSubmit = mocks.submit;
  reportFailure = mocks.failure;
} }));
vi.mock("./printer-discovery", () => ({
  discoverWindowsPrinters: async () => [{ name: "Test physical printer", status: "online" }],
  findDefaultPrinter: () => ({ name: "Test physical printer" }),
  findBestPrinterForJob: () => ({ name: "Test physical printer" }),
}));
vi.mock("./print-executor", () => ({ prepareAndPrintDocument: mocks.print }));
vi.mock("node:fs", () => ({ default: { existsSync: () => true, mkdirSync: vi.fn(), unlinkSync: vi.fn() } }));
import { AgentDaemon } from "./daemon";

async function processJob() {
  const daemon = new AgentDaemon();
  await (daemon as unknown as { pollAndProcessNextJob(): Promise<void> }).pollAndProcessNextJob();
  return daemon;
}

describe("automatic dispatch safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.claim.mockResolvedValue({
      id: "job-123456", orderId: "order-123456", defaultPrinter: null,
      document: { id: "document-123456", originalFilename: "test.pdf", pageCount: 2 },
      pagesConfig: [{ startPage: 1, endPage: 2, colorMode: "black_and_white", paperSize: "a4" }],
    });
    mocks.download.mockResolvedValue(undefined);
    mocks.submit.mockResolvedValue(true);
    mocks.failure.mockResolvedValue(true);
    mocks.print.mockResolvedValue({ success: true, pagesSubmitted: 2 });
  });

  it("persists dispatch before sending the customer's settings to the printer", async () => {
    await processJob();
    expect(mocks.submit.mock.invocationCallOrder[0]).toBeLessThan(mocks.print.mock.invocationCallOrder[0]);
    expect(mocks.print.mock.calls[0][3]).toEqual([{ startPage: 1, endPage: 2, colorMode: "black_and_white", paperSize: "a4" }]);
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
});
