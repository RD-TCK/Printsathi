import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import type { ClaimedJob } from "./types";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), discover: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: mocks.execute }));
vi.mock("./printer-discovery", () => ({
  discoverWindowsPrinters: mocks.discover,
  isPhysicalPrinter: (printer: { name: string }) => printer.name !== "Microsoft Print to PDF",
}));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
import { prepareAndPrintDocument } from "./print-executor";

describe("PDF print submission", () => {
  let directory: string;
  let source: string;
  const printerName = "Shop's HP & LaserJet";
  const job = {
    id: "job-test",
    totalPages: 1,
    pagesConfig: [{ startPage: 2, endPage: 2, colorMode: "black_and_white", paperSize: "a4" }],
  } as ClaimedJob;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(os, "platform").mockReturnValue("win32");
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "printsaathi-test-"));
    source = path.join(directory, "customer's file.pdf");
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    fs.writeFileSync(source, await pdf.save());
    mocks.discover.mockResolvedValue([{ name: printerName, status: "online" }]);
    mocks.execute.mockImplementation((_file, _args, _options, callback) => callback(null, "", ""));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("reports renderer errors as failures instead of success", async () => {
    mocks.execute.mockImplementation((_file, _args, _options, callback) => callback(new Error("Printer failed")));
    const result = await prepareAndPrintDocument(source, job, printerName);
    expect(result).toMatchObject({
      success: false,
      status: "PRINT_FAILED",
      pagesSubmitted: 0,
      errorMessage: "Printer failed",
    });
  });

  it("keeps selected pages until rendering finishes and reports only submission", async () => {
    let finish!: () => void;
    let sliced!: string;
    mocks.execute.mockImplementation((_file, args, options, callback) => {
      expect(args.slice(0, 2)).toEqual(["-print-to", printerName]);
      expect(args.some((arg: string) => arg.toLowerCase().includes("paper=a4"))).toBe(true);
      expect(options).toMatchObject({ windowsHide: true, timeout: 120000 });
      sliced = args.at(-1);
      finish = () => callback(null, "", "");
    });
    const pending = prepareAndPrintDocument(source, job, printerName);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    // 1 customer page + 1 blank separator page = 2 pages in spooled output
    expect((await PDFDocument.load(fs.readFileSync(sliced))).getPageCount()).toBe(2);
    finish();
    expect(await pending).toMatchObject({ success: true, status: "PRINT_SUBMITTED", pagesSubmitted: 1 });
    expect(fs.existsSync(sliced)).toBe(false);
    expect(fs.existsSync(source)).toBe(true);
  });

  it.each(["offline", "error"])("rejects %s printers without launching a renderer", async (status) => {
    mocks.discover.mockResolvedValue([{ name: printerName, status }]);
    expect((await prepareAndPrintDocument(source, job, printerName)).success).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects virtual printers and invalid ranges", async () => {
    mocks.discover.mockResolvedValue([{ name: "Microsoft Print to PDF", status: "online" }]);
    expect((await prepareAndPrintDocument(source, job, "Microsoft Print to PDF")).success).toBe(false);
    mocks.discover.mockResolvedValue([{ name: printerName, status: "online" }]);
    const invalidJob = { ...job, pagesConfig: [{ ...job.pagesConfig[0], endPage: 99 }] };
    expect((await prepareAndPrintDocument(source, invalidJob, printerName)).success).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
