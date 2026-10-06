import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { discoverWindowsPrinters, isPhysicalPrinter } from "./printer-discovery";
import { PDFDocument } from "pdf-lib";
import type { ClaimedJob } from "./types";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

function rendererPath(): string {
  const bundled = path
    .join(path.dirname(require.resolve("pdf-to-printer")), "SumatraPDF-3.4.6-32.exe")
    .replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
  // pkg assets live in a virtual filesystem and must be extracted before execution.
  if ((process as NodeJS.Process & { pkg?: unknown }).pkg) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "printsaathi-renderer-"));
    const executable = path.join(directory, "SumatraPDF.exe");
    // Static require is required for pkg to include the renderer payload.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fs.writeFileSync(executable, Buffer.from(require("./renderer-data.json").base64, "base64"));
    return executable;
  }
  return bundled;
}

export function checkPrintBackend(): { bytes: number; sha256: string } {
  const executable = rendererPath();
  try {
    const bytes = fs.readFileSync(executable);
    if (bytes.length < 1024 || bytes.toString("ascii", 0, 2) !== "MZ") {
      throw new Error("Bundled PDF renderer is not a valid Windows executable.");
    }
    return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  } finally {
    if ((process as NodeJS.Process & { pkg?: unknown }).pkg) {
      fs.unlinkSync(executable);
      fs.rmdirSync(path.dirname(executable));
    }
  }
}

export interface PrintExecutionResult {
  success: boolean;
  status: "PRINT_SUBMITTED" | "PRINT_FAILED";
  printerName: string;
  pagesSubmitted: number;
  errorMessage?: string;
  duplexModeUsed?: "hardware" | "manual_odd" | "manual_even" | "simplex";
}

export async function prepareAndPrintDocument(
  sourcePdfPath: string,
  job: ClaimedJob,
  targetPrinterName: string,
  pagesConfigOverride?: ClaimedJob["pagesConfig"],
): Promise<PrintExecutionResult> {
  const isWindows = process.platform === "win32" || os.platform() === "win32";
  const activeConfigs = pagesConfigOverride || job.pagesConfig;
  logger.info(`Starting print execution for Job #${job.id.slice(0, 8)} on "${targetPrinterName}"`);

  let finalPdfPath = sourcePdfPath;
  let tempExtractedPath: string | null = null;
  let extractedRenderer: string | null = null;

  try {
    if (!isWindows) throw new Error("Physical printing requires Windows; no job was submitted.");
    const printer = (await discoverWindowsPrinters()).find((p) => p.name === targetPrinterName);
    if (!printer || !isPhysicalPrinter(printer) || !["online", "printing"].includes(printer.status)) {
      throw new Error(
        `Printer "${targetPrinterName}" is unavailable, offline, or virtual. Check its Windows print queue.`,
      );
    }
    if (activeConfigs?.some(config => config.colorMode !== activeConfigs[0].colorMode || config.paperSize !== activeConfigs[0].paperSize)) {
      throw new Error("Mixed paper/color settings must be submitted as separate print groups.");
    }
    const sourcePdf = await PDFDocument.load(fs.readFileSync(sourcePdfPath));
    for (const config of activeConfigs || []) {
      if (
        !Number.isInteger(config.startPage) ||
        !Number.isInteger(config.endPage) ||
        config.startPage < 1 ||
        config.endPage < config.startPage ||
        config.endPage > sourcePdf.getPageCount()
      ) {
        throw new Error("Invalid print page range; no pages were submitted.");
      }
    }

    const targetSupportsHardwareDuplex = Boolean(printer.capabilities?.duplexSupport);
    const hasDoubleSidedConfig = (activeConfigs || []).some((c) => c.sideMode === "double_sided");

    // Determine duplex execution step/mode:
    // If duplexStep is explicitly "odd" or "even", execute that specific manual pass.
    // Otherwise, if the job has double-sided configs:
    //   - If target printer supports hardware duplex -> execute in a single pass ("all" / hardware)
    //   - If target printer does not support hardware duplex -> default to first pass of manual duplex ("odd")
    let duplexStep = job.duplexStep;
    if (hasDoubleSidedConfig) {
      if (!duplexStep || duplexStep === "none") {
        duplexStep = targetSupportsHardwareDuplex ? "all" : "odd";
      }
    } else if (!duplexStep) {
      duplexStep = "none";
    }

    const isHardwareDuplex = hasDoubleSidedConfig && duplexStep === "all";
    const isManualDuplexOdd = duplexStep === "odd";
    const isManualDuplexEven = duplexStep === "even";

    logger.info(
      `Job #${job.id.slice(0, 8)} duplex mode: ${
        isHardwareDuplex
          ? "Hardware Duplex (Single Pass)"
          : isManualDuplexOdd
          ? "Manual Duplex (Step 1: Odd Pages)"
          : isManualDuplexEven
          ? "Manual Duplex (Step 2: Even Pages)"
          : "Single-Sided"
      }`,
    );

    let calculatedPages = 0;

    const firstPageRef = sourcePdf.getPageCount() > 0 ? sourcePdf.getPage(0) : null;
    const defaultPageSize: [number, number] = firstPageRef
      ? [firstPageRef.getWidth(), firstPageRef.getHeight()]
      : [595.28, 841.89]; // Standard A4 points

    const configsToProcess =
      activeConfigs && activeConfigs.length > 0
        ? activeConfigs
        : [
            {
              startPage: 1,
              endPage: sourcePdf.getPageCount(),
              copies: 1,
              sideMode: hasDoubleSidedConfig ? ("double_sided" as const) : ("single_sided" as const),
              colorMode: "black_and_white" as const,
              paperSize: "a4" as const,
            },
          ];

    let outputPdf: PDFDocument;

    const isSimpleFullPrint =
      configsToProcess.length === 1 &&
      configsToProcess[0].startPage === 1 &&
      configsToProcess[0].endPage === sourcePdf.getPageCount() &&
      configsToProcess[0].copies === 1 &&
      !isManualDuplexOdd &&
      !isManualDuplexEven;

    if (isSimpleFullPrint) {
      outputPdf = sourcePdf;
      calculatedPages = sourcePdf.getPageCount();

      if (isHardwareDuplex && calculatedPages % 2 === 1) {
        outputPdf.addPage(defaultPageSize);
      }

      if (isHardwareDuplex) {
        outputPdf.addPage(defaultPageSize);
        outputPdf.addPage(defaultPageSize);
      } else {
        outputPdf.addPage(defaultPageSize);
      }
    } else {
      outputPdf = await PDFDocument.create();

      for (const config of configsToProcess) {
        const start = Math.max(1, config.startPage);
        const end = Math.min(sourcePdf.getPageCount(), config.endPage);
        const copies = Math.max(1, config.copies ?? 1);

        if (isHardwareDuplex) {
          const pageIndices: number[] = [];
          for (let i = start; i <= end; i++) {
            pageIndices.push(i - 1);
          }
          const rangeCount = pageIndices.length;
          if (rangeCount > 0) {
            for (let c = 0; c < copies; c++) {
              const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndices);
              copiedPages.forEach((p) => outputPdf.addPage(p));
              calculatedPages += rangeCount;

              if (rangeCount % 2 === 1) {
                const lastPage = copiedPages[copiedPages.length - 1];
                const { width, height } = lastPage.getSize();
                outputPdf.addPage([width, height]);
              }
            }
          }
        } else if (isManualDuplexOdd) {
          const oddIndices: number[] = [];
          for (let i = start; i <= end; i++) {
            if (i % 2 === 1) {
              oddIndices.push(i - 1);
            }
          }
          if (oddIndices.length > 0) {
            for (let c = 0; c < copies; c++) {
              const copiedPages = await outputPdf.copyPages(sourcePdf, oddIndices);
              copiedPages.forEach((p) => outputPdf.addPage(p));
              calculatedPages += oddIndices.length;
            }
          }
        } else if (isManualDuplexEven) {
          const evenPagesInConfig: number[] = [];
          for (let i = start; i <= end; i++) {
            if (i % 2 === 0) evenPagesInConfig.push(i);
          }

          if (evenPagesInConfig.length > 0) {
            const oddPagesInConfig: number[] = [];
            for (let i = start; i <= end; i++) {
              if (i % 2 === 1) oddPagesInConfig.push(i);
            }

            for (let c = 0; c < copies; c++) {
              for (const oddPage of oddPagesInConfig) {
                const evenPage = oddPage + 1;
                if (evenPage <= end) {
                  const [copiedPage] = await outputPdf.copyPages(sourcePdf, [evenPage - 1]);
                  outputPdf.addPage(copiedPage);
                  calculatedPages += 1;
                } else {
                  const [correspondingOdd] = await outputPdf.copyPages(sourcePdf, [oddPage - 1]);
                  const { width, height } = correspondingOdd.getSize();
                  outputPdf.addPage([width, height]);
                }
              }
            }
          }
        } else {
          const pageIndices: number[] = [];
          for (let i = start; i <= end; i++) {
            pageIndices.push(i - 1);
          }
          if (pageIndices.length > 0) {
            for (let c = 0; c < copies; c++) {
              const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndices);
              copiedPages.forEach((p) => outputPdf.addPage(p));
              calculatedPages += pageIndices.length;
            }
          }
        }
      }

      if (outputPdf.getPageCount() === 0) {
        logger.info(`Job #${job.id.slice(0, 8)}: No pages to print for step "${duplexStep || "standard"}".`);
        return {
          success: true,
          status: "PRINT_SUBMITTED",
          printerName: targetPrinterName,
          pagesSubmitted: 0,
          duplexModeUsed: isHardwareDuplex
            ? "hardware"
            : isManualDuplexOdd
            ? "manual_odd"
            : isManualDuplexEven
            ? "manual_even"
            : "simplex",
        };
      }

      if (!isManualDuplexOdd) {
        if (isHardwareDuplex) {
          outputPdf.addPage(defaultPageSize);
          outputPdf.addPage(defaultPageSize);
        } else {
          outputPdf.addPage(defaultPageSize);
        }
      }
    }

    const outputBytes = await outputPdf.save();
    const tempDir = path.join(os.tmpdir(), "printsaathi_spool");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    tempExtractedPath = path.join(tempDir, `job_${job.id}_${Date.now()}_spooled.pdf`);
    fs.writeFileSync(tempExtractedPath, outputBytes);
    finalPdfPath = tempExtractedPath;

    const settings = ["fit"];
    const config = activeConfigs?.[0];
    if (isHardwareDuplex) {
      settings.push("duplex");
    } else {
      settings.push("simplex");
    }
    if (config) {
      settings.push(config.colorMode === "color" ? "color" : "monochrome");
      if (config.paperSize) {
        settings.push(`paper=${config.paperSize.toUpperCase()}`);
      }
    }
    const executable = rendererPath();
    if ((process as NodeJS.Process & { pkg?: unknown }).pkg) extractedRenderer = executable;
    logger.info(`Rendering PDF and submitting to Windows printer "${targetPrinterName}" with settings: ${settings.join(",")}`);
    await execFileAsync(
      executable,
      ["-print-to", targetPrinterName, "-silent", "-print-settings", settings.join(","), finalPdfPath],
      { timeout: 120000, windowsHide: true },
    );
    logger.info(`Job #${job.id.slice(0, 8)} submitted to "${targetPrinterName}"; physical completion is unconfirmed.`);
    return {
      success: true,
      status: "PRINT_SUBMITTED",
      printerName: targetPrinterName,
      pagesSubmitted: calculatedPages,
      duplexModeUsed: isHardwareDuplex
        ? "hardware"
        : isManualDuplexOdd
        ? "manual_odd"
        : isManualDuplexEven
        ? "manual_even"
        : "simplex",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Print execution error";
    logger.error(`Print execution failed for Job #${job.id.slice(0, 8)}: ${errorMsg}`);
    return {
      success: false,
      status: "PRINT_FAILED",
      printerName: targetPrinterName,
      pagesSubmitted: 0,
      errorMessage: errorMsg,
    };
  } finally {
    if (extractedRenderer) {
      try {
        fs.unlinkSync(extractedRenderer);
        fs.rmdirSync(path.dirname(extractedRenderer));
      } catch {
        /* Best-effort renderer cleanup. */
      }
    }
    // Clean up sliced temporary PDF
    if (tempExtractedPath && fs.existsSync(tempExtractedPath)) {
      try {
        fs.unlinkSync(tempExtractedPath);
      } catch {
        // Ignore deletion errors
      }
    }
  }
}
