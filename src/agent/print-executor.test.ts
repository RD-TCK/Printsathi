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
    // 1 customer page + 1 blank separator sheet = 2 pages in spooled output
    expect((await PDFDocument.load(fs.readFileSync(sliced))).getPageCount()).toBe(2);
    finish();
    expect(await pending).toMatchObject({ success: true, status: "PRINT_SUBMITTED", pagesSubmitted: 1 });
    expect(fs.existsSync(sliced)).toBe(false);
    expect(fs.existsSync(source)).toBe(true);
  });

  it("prints exact number of copies requested by customer with 1 separator sheet at the end of single-sided jobs", async () => {
    let spooledCount = 0;
    mocks.execute.mockImplementation(async (_file, args, _options, callback) => {
      const p = args.at(-1);
      const loaded = await PDFDocument.load(fs.readFileSync(p));
      spooledCount = loaded.getPageCount();
      callback(null, "", "");
    });

    // 2 copies of page 1-2 = 4 pages + 1 blank separator page = 5 pages spooled
    const multiCopyJob = {
      id: "job-multi-copy",
      totalPages: 4,
      pagesConfig: [
        {
          startPage: 1,
          endPage: 2,
          colorMode: "black_and_white",
          paperSize: "a4",
          sideMode: "single_sided",
          copies: 2,
        },
      ],
    } as ClaimedJob;

    const result = await prepareAndPrintDocument(source, multiCopyJob, printerName);
    expect(result.success).toBe(true);
    expect(result.pagesSubmitted).toBe(4);
    expect(spooledCount).toBe(5);
    expect(mocks.execute).toHaveBeenCalled();
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

  it("slices only odd pages when duplexStep is 'odd' and only even pages when duplexStep is 'even'", async () => {
    // Create a 4-page source PDF (Pages 1, 2, 3, 4)
    const multiPageSource = path.join(directory, "four_pages.pdf");
    const fourPagePdf = await PDFDocument.create();
    fourPagePdf.addPage();
    fourPagePdf.addPage();
    fourPagePdf.addPage();
    fourPagePdf.addPage();
    fs.writeFileSync(multiPageSource, await fourPagePdf.save());

    const duplexJobOdd = {
      id: "job-duplex-odd",
      totalPages: 4,
      duplexStep: "odd",
      pagesConfig: [
        { startPage: 1, endPage: 4, colorMode: "black_and_white", paperSize: "a4", sideMode: "double_sided" },
      ],
    } as ClaimedJob;

    let oddPagesCount = 0;
    mocks.execute.mockImplementation(async (_file, args, _options, callback) => {
      const p = args.at(-1);
      const doc = await PDFDocument.load(fs.readFileSync(p));
      oddPagesCount = doc.getPageCount();
      callback(null, "", "");
    });

    const oddResult = await prepareAndPrintDocument(multiPageSource, duplexJobOdd, printerName);
    expect(oddResult.success).toBe(true);
    // 2 odd pages (1, 3) - no separator blank page in manual duplex
    expect(oddPagesCount).toBe(2);
    expect(oddResult.pagesSubmitted).toBe(2);

    const duplexJobEven = {
      id: "job-duplex-even",
      totalPages: 4,
      duplexStep: "even",
      pagesConfig: [{ startPage: 1, endPage: 4, colorMode: "black_and_white", paperSize: "a4" }],
    } as ClaimedJob;

    let evenPagesCount = 0;
    mocks.execute.mockImplementation(async (_file, args, _options, callback) => {
      const p = args.at(-1);
      const doc = await PDFDocument.load(fs.readFileSync(p));
      evenPagesCount = doc.getPageCount();
      callback(null, "", "");
    });

    const evenResult = await prepareAndPrintDocument(multiPageSource, duplexJobEven, printerName);
    expect(evenResult.success).toBe(true);
    // 2 even pages (2, 4) + 1 blank separator page at end of completed job = 3 pages
    expect(evenPagesCount).toBe(3);
    expect(evenResult.pagesSubmitted).toBe(2);

    // Single page document in even step should complete with 0 pages submitted and not invoke renderer
    const singlePageSource = path.join(directory, "single_page.pdf");
    const singlePagePdf = await PDFDocument.create();
    singlePagePdf.addPage();
    fs.writeFileSync(singlePageSource, await singlePagePdf.save());

    mocks.execute.mockClear();
    const singlePageJobEven = {
      id: "job-single-even",
      totalPages: 1,
      duplexStep: "even",
      pagesConfig: [{ startPage: 1, endPage: 1, colorMode: "black_and_white", paperSize: "a4" }],
    } as ClaimedJob;

    const singlePageResult = await prepareAndPrintDocument(singlePageSource, singlePageJobEven, printerName);
    expect(singlePageResult.success).toBe(true);
    expect(singlePageResult.pagesSubmitted).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("collates multiple copies per copy for manual duplex passes", async () => {
    // 4-page source PDF
    const fourPageSource = path.join(directory, "multi_copy_4p.pdf");
    const doc = await PDFDocument.create();
    for (let i = 0; i < 4; i++) doc.addPage();
    fs.writeFileSync(fourPageSource, await doc.save());

    // 2 copies of 4-page document in odd step
    const jobOddCopies = {
      id: "job-odd-copies",
      totalPages: 4,
      duplexStep: "odd",
      pagesConfig: [
        {
          startPage: 1,
          endPage: 4,
          colorMode: "black_and_white",
          paperSize: "a4",
          sideMode: "double_sided",
          copies: 2,
        },
      ],
    } as ClaimedJob;

    let oddPdfPages = 0;
    mocks.execute.mockImplementation(async (_file, args, _options, callback) => {
      const p = args.at(-1);
      const loaded = await PDFDocument.load(fs.readFileSync(p));
      oddPdfPages = loaded.getPageCount();
      callback(null, "", "");
    });

    const oddRes = await prepareAndPrintDocument(fourPageSource, jobOddCopies, printerName);
    expect(oddRes.success).toBe(true);
    // 2 odd pages * 2 copies = 4 pages (collated Copy 1: [1, 3], Copy 2: [1, 3])
    expect(oddPdfPages).toBe(4);
    expect(oddRes.pagesSubmitted).toBe(4);

    // 2 copies of 4-page document in even step
    const jobEvenCopies = {
      id: "job-even-copies",
      totalPages: 4,
      duplexStep: "even",
      pagesConfig: [
        {
          startPage: 1,
          endPage: 4,
          colorMode: "black_and_white",
          paperSize: "a4",
          sideMode: "double_sided",
          copies: 2,
        },
      ],
    } as ClaimedJob;

    let evenPdfPages = 0;
    mocks.execute.mockImplementation(async (_file, args, _options, callback) => {
      const p = args.at(-1);
      const loaded = await PDFDocument.load(fs.readFileSync(p));
      evenPdfPages = loaded.getPageCount();
      callback(null, "", "");
    });

    const evenRes = await prepareAndPrintDocument(fourPageSource, jobEvenCopies, printerName);
    expect(evenRes.success).toBe(true);
    // 2 even pages * 2 copies = 4 pages + 1 blank separator page = 5 pages
    expect(evenPdfPages).toBe(5);
    expect(evenRes.pagesSubmitted).toBe(4);
  });

  it("uses hardware duplex with duplex setting and pads odd-length copies when printer supports duplex", async () => {
    // Hardware duplex printer
    const duplexPrinterName = "Canon iR-ADV 6075";
    mocks.discover.mockResolvedValue([
      {
        name: duplexPrinterName,
        status: "online",
        capabilities: { duplexSupport: true, colorSupport: false, paperSizes: ["A4"] },
      },
    ]);

    // 3-page document with 2 copies
    const threePageSource = path.join(directory, "three_pages.pdf");
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) doc.addPage();
    fs.writeFileSync(threePageSource, await doc.save());

    const hardwareDuplexJob = {
      id: "job-hw-duplex",
      totalPages: 3,
      pagesConfig: [
        {
          startPage: 1,
          endPage: 3,
          colorMode: "black_and_white",
          paperSize: "a4",
          sideMode: "double_sided",
          copies: 2,
        },
      ],
    } as ClaimedJob;

    let submittedSettings = "";
    let spooledPageCount = 0;
    mocks.execute.mockImplementation(async (_file, args, _options, callback) => {
      const settingsIndex = args.indexOf("-print-settings");
      if (settingsIndex !== -1) {
        submittedSettings = args[settingsIndex + 1];
      }
      const p = args.at(-1);
      const loaded = await PDFDocument.load(fs.readFileSync(p));
      spooledPageCount = loaded.getPageCount();
      callback(null, "", "");
    });

    const result = await prepareAndPrintDocument(threePageSource, hardwareDuplexJob, duplexPrinterName);
    expect(result.success).toBe(true);
    expect(result.duplexModeUsed).toBe("hardware");
    // SumatraPDF setting must include "duplex"
    expect(submittedSettings).toContain("duplex");
    // 3 pages + 1 blank padding per copy * 2 copies = 8 spooled pages + 2 blank separator pages (1 physical double-sided sheet) = 10
    expect(spooledPageCount).toBe(10);
    expect(result.pagesSubmitted).toBe(6);
  });
});
