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

import { getConfigDirectory } from "./config";

function rendererPath(): string {
  const bundled = path
    .join(path.dirname(require.resolve("pdf-to-printer")), "SumatraPDF-3.4.6-32.exe")
    .replace(/app\.asar([\\/])/, "app.asar.unpacked$1");

  if (fs.existsSync(bundled)) {
    return bundled;
  }

  // Use permanent bin directory in AppData (avoids %TEMP% dropper flags from antivirus scanners)
  const binDir = path.join(getConfigDirectory(), "bin");
  const permanentExe = path.join(binDir, "SumatraPDF.exe");

  // pkg assets live in a virtual filesystem and must be extracted before execution.
  if ((process as NodeJS.Process & { pkg?: unknown }).pkg) {
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expectedBuffer = Buffer.from(require("./renderer-data.json").base64, "base64");
    if (!fs.existsSync(permanentExe) || fs.statSync(permanentExe).size !== expectedBuffer.length) {
      fs.writeFileSync(permanentExe, expectedBuffer);
    }
    return permanentExe;
  }

  if (fs.existsSync(permanentExe)) {
    return permanentExe;
  }

  return bundled;
}

export function checkPrintBackend(): { bytes: number; sha256: string } {
  const executable = rendererPath();
  const bytes = fs.readFileSync(executable);
  if (bytes.length < 1024 || bytes.toString("ascii", 0, 2) !== "MZ") {
    throw new Error("Bundled PDF renderer is not a valid Windows executable.");
  }
  return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export interface PrintExecutionResult {
  success: boolean;
  status: "PRINT_SUBMITTED" | "PRINT_FAILED";
  printerName: string;
  pagesSubmitted: number;
  errorMessage?: string;
  duplexModeUsed?: "hardware" | "manual_odd" | "manual_even" | "simplex";
}

function runPowerShellInline(script: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `& { ${script} }`],
      { timeout: timeoutMs, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve("");
        } else {
          resolve(stdout ? stdout.toString() : "");
        }
      },
    );
  });
}

export async function getPrinterQueueCount(printerName: string): Promise<number> {
  const isWindows = process.platform === "win32" || os.platform() === "win32";
  if (!isWindows || process.env.NODE_ENV === "test") return 0;

  try {
    const escaped = printerName.replace(/'/g, "''");
    const script = `@(Get-PrintJob -PrinterName '${escaped}' -ErrorAction SilentlyContinue).Count`;
    const out = await runPowerShellInline(script, 4000);
    const count = parseInt(out.trim(), 10);
    return Number.isInteger(count) ? count : 0;
  } catch {
    return 0;
  }
}

export async function waitForPhysicalPrintCompletion(
  printerName: string,
  timeoutMs = 90000,
): Promise<{ completed: boolean; durationMs: number }> {
  const isWindows = process.platform === "win32" || os.platform() === "win32";
  if (!isWindows || process.env.NODE_ENV === "test") {
    return { completed: true, durationMs: 0 };
  }

  const startTime = Date.now();
  // Brief initial pause to allow Windows spooler to register the job from SumatraPDF
  await new Promise((r) => setTimeout(r, 1000));

  while (Date.now() - startTime < timeoutMs) {
    const count = await getPrinterQueueCount(printerName);
    if (count > 0) {
      logger.info(`Printer "${printerName}" is printing (${count} job(s) in spooler queue)...`);
      await new Promise((r) => setTimeout(r, 1200));
    } else {
      logger.info(
        `Printer "${printerName}" queue cleared after ${Math.round((Date.now() - startTime) / 1000)}s. Physical pages completed.`,
      );
      return { completed: true, durationMs: Date.now() - startTime };
    }
  }

  logger.warn(`Printer "${printerName}" queue wait timed out after ${timeoutMs / 1000}s. Proceeding.`);
  return { completed: false, durationMs: Date.now() - startTime };
}

export interface PrintDocumentOptions {
  /**
   * When true (default unless job.isLastJobForOrder is false), appends an empty separator page
   * (or 2 blank pages for hardware duplex) after the printed document.
   * In a multi-file user order, this is set to false for intermediate documents, and true only for the final document.
   */
  includeSeparatorPage?: boolean;
}

export async function loadSourceAsPdfDocument(filePath: string): Promise<PDFDocument> {
  let sourceBuffer = fs.readFileSync(filePath);
  if (
    (sourceBuffer[0] === 0xff && sourceBuffer[1] === 0xd8 && sourceBuffer[2] === 0xff) ||
    (sourceBuffer[0] === 0x89 && sourceBuffer[1] === 0x50 && sourceBuffer[2] === 0x4e && sourceBuffer[3] === 0x47)
  ) {
    const imgDoc = await PDFDocument.create();
    const isPng = sourceBuffer[0] === 0x89;
    let embeddedImg;
    try {
      embeddedImg = isPng ? await imgDoc.embedPng(sourceBuffer) : await imgDoc.embedJpg(sourceBuffer);
    } catch {
      try {
        const sharp = (await import("sharp")).default;
        const normalizedJpeg = await sharp(sourceBuffer)
          .rotate()
          .toColorspace("srgb")
          .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
          .toBuffer();
        embeddedImg = await imgDoc.embedJpg(normalizedJpeg);
      } catch {
        embeddedImg = isPng ? await imgDoc.embedJpg(sourceBuffer) : await imgDoc.embedPng(sourceBuffer);
      }
    }
    const isLandscape = embeddedImg.width > embeddedImg.height * 1.15;
    const pageWidth = isLandscape ? 841.89 : 595.28;
    const pageHeight = isLandscape ? 595.28 : 841.89;
    const margin = 28.35; // ~10mm safe printable margin
    const contentW = pageWidth - margin * 2;
    const contentH = pageHeight - margin * 2;
    const scale = Math.min(contentW / embeddedImg.width, contentH / embeddedImg.height);
    const width = embeddedImg.width * scale;
    const height = embeddedImg.height * scale;
    const page = imgDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(embeddedImg, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
    });
    sourceBuffer = Buffer.from(await imgDoc.save());
    try {
      fs.writeFileSync(filePath, sourceBuffer);
    } catch {
      // non-fatal if path is read-only
    }
  }
  return PDFDocument.load(sourceBuffer, { ignoreEncryption: true });
}

export async function prepareAndPrintDocument(
  sourcePdfPath: string,
  job: ClaimedJob,
  targetPrinterName: string,
  pagesConfigOverride?: ClaimedJob["pagesConfig"],
  options?: PrintDocumentOptions,
): Promise<PrintExecutionResult> {
  const isWindows = process.platform === "win32" || os.platform() === "win32";
  const activeConfigs = pagesConfigOverride || job.pagesConfig;
  const shouldAddSeparatorPage =
    options?.includeSeparatorPage !== undefined
      ? options.includeSeparatorPage
      : job.isLastJobForOrder !== undefined
        ? job.isLastJobForOrder
        : true;
  logger.info(`Starting print execution for Job #${job.id.slice(0, 8)} on "${targetPrinterName}" (separator: ${shouldAddSeparatorPage})`);

  let finalPdfPath = sourcePdfPath;
  let tempExtractedPath: string | null = null;

  try {
    if (!isWindows) throw new Error("Physical printing requires Windows; no job was submitted.");
    const printer = (await discoverWindowsPrinters()).find((p) => p.name === targetPrinterName);
    if (!printer || !isPhysicalPrinter(printer)) {
      throw new Error(`Printer "${targetPrinterName}" is not an installed physical Windows printer.`);
    }
    if (printer.status === "offline") {
      logger.info(
        `Target printer "${targetPrinterName}" is currently offline. Document will be spooled to Windows print queue and will print once connected.`,
      );
    }
    if (
      activeConfigs?.some(
        (config) => config.colorMode !== activeConfigs[0].colorMode || config.paperSize !== activeConfigs[0].paperSize,
      )
    ) {
      throw new Error("Mixed paper/color settings must be submitted as separate print groups.");
    }
    const sourcePdf = await loadSourceAsPdfDocument(sourcePdfPath);
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

    // Strict hardware isolation guards:
    // 1. Guard against B&W job sent to color printer (unless allowColorFallback is enabled)
    const isBwJob = (activeConfigs || []).every((c) => c.colorMode === "black_and_white");
    if (isBwJob && printer.capabilities?.colorSupport === true && !job.allowColorFallback) {
      throw new Error(
        `Hardware Isolation Violation: Black & White job #${job.id.slice(0, 8)} cannot be sent to Color printer "${printer.name}" to prevent wasting color ink/toner.`,
      );
    }
    // 2. Guard against Color job sent to monochrome printer
    const isColorJob = (activeConfigs || []).some((c) => c.colorMode === "color");
    if (isColorJob && !printer.capabilities?.colorSupport) {
      throw new Error(
        `Hardware Isolation Violation: Color job #${job.id.slice(0, 8)} cannot be sent to Monochrome printer "${printer.name}".`,
      );
    }

    // 3. Guard against Duplex job sent directly to simplex printer without duplexStep
    if (hasDoubleSidedConfig && !targetSupportsHardwareDuplex && !job.duplexStep) {
      throw new Error(
        `Hardware Isolation Violation: Double-sided job #${job.id.slice(0, 8)} cannot be sent to Simplex printer "${printer.name}".`,
      );
    }

    // Determine duplex execution step/mode:
    // If duplexStep is explicitly "odd" or "even", execute that specific manual pass.
    // Otherwise, if the job has double-sided configs:
    //   - If target printer supports hardware duplex -> execute in a single pass ("all" / hardware)
    //   - If target printer is simplex -> execute Step 1 ("odd" / manual duplex)
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

      if (shouldAddSeparatorPage) {
        if (isHardwareDuplex) {
          outputPdf.addPage(defaultPageSize);
          outputPdf.addPage(defaultPageSize);
        } else {
          outputPdf.addPage(defaultPageSize);
        }
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

      if (shouldAddSeparatorPage && !isManualDuplexOdd) {
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

    const settings = ["shrink"];
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
    logger.info(
      `Rendering PDF and submitting to Windows printer "${targetPrinterName}" with settings: ${settings.join(",")}`,
    );
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
    // In test environments, delete immediately for assertions; in production, delay cleanup so Windows Spooler finishes reading bytes
    if (tempExtractedPath && fs.existsSync(tempExtractedPath)) {
      if (process.env.NODE_ENV === "test") {
        try {
          fs.unlinkSync(tempExtractedPath);
        } catch {
          // Ignore deletion errors in test
        }
      } else {
        const fileToClean = tempExtractedPath;
        setTimeout(() => {
          try {
            if (fs.existsSync(fileToClean)) {
              fs.unlinkSync(fileToClean);
            }
          } catch {
            // Ignore deletion errors
          }
        }, 60000);
      }
    }
  }
}

export interface BatchPrintItem {
  sourcePath: string;
  job: ClaimedJob;
  pagesConfigOverride?: ClaimedJob["pagesConfig"];
}

export async function prepareAndPrintBatch(
  batchItems: BatchPrintItem[],
  targetPrinterName: string,
  options?: PrintDocumentOptions,
): Promise<PrintExecutionResult> {
  if (batchItems.length === 0) {
    return {
      success: true,
      status: "PRINT_SUBMITTED",
      printerName: targetPrinterName,
      pagesSubmitted: 0,
      duplexModeUsed: "simplex",
    };
  }

  if (batchItems.length === 1) {
    return prepareAndPrintDocument(
      batchItems[0].sourcePath,
      batchItems[0].job,
      targetPrinterName,
      batchItems[0].pagesConfigOverride,
      options,
    );
  }

  const isWindows = process.platform === "win32" || os.platform() === "win32";
  const firstJob = batchItems[0].job;
  const lastJob = batchItems[batchItems.length - 1].job;
  const shouldAddSeparatorPage =
    options?.includeSeparatorPage !== undefined
      ? options.includeSeparatorPage
      : lastJob.isLastJobForOrder !== undefined
        ? lastJob.isLastJobForOrder
        : true;

  logger.info(
    `Starting batch print execution for ${batchItems.length} jobs (Order #${firstJob.orderId?.slice(0, 8)}) on "${targetPrinterName}" (separator: ${shouldAddSeparatorPage})`,
  );

  let tempExtractedPath: string | null = null;

  try {
    if (!isWindows) throw new Error("Physical printing requires Windows; no job was submitted.");
    const printer = (await discoverWindowsPrinters()).find((p) => p.name === targetPrinterName);
    if (!printer || !isPhysicalPrinter(printer)) {
      throw new Error(`Printer "${targetPrinterName}" is not an installed physical Windows printer.`);
    }
    if (printer.status === "offline") {
      logger.info(
        `Target printer "${targetPrinterName}" is currently offline. Batch will be spooled to Windows print queue and will print once connected.`,
      );
    }

    const targetSupportsHardwareDuplex = Boolean(printer.capabilities?.duplexSupport);
    const hasDoubleSided = batchItems.some((item) =>
      (item.pagesConfigOverride || item.job.pagesConfig || []).some((c) => c.sideMode === "double_sided"),
    );

    // Hardware isolation checks
    const anyColorJob = batchItems.some((item) =>
      (item.pagesConfigOverride || item.job.pagesConfig || []).some((c) => c.colorMode === "color"),
    );
    if (anyColorJob && !printer.capabilities?.colorSupport) {
      throw new Error(
        `Hardware Isolation Violation: Color jobs cannot be sent to Monochrome printer "${printer.name}".`,
      );
    }

    const allBwJobs = batchItems.every((item) =>
      (item.pagesConfigOverride || item.job.pagesConfig || []).every((c) => c.colorMode === "black_and_white"),
    );
    const allowColorFallback = batchItems.every((item) => item.job.allowColorFallback);
    if (allBwJobs && printer.capabilities?.colorSupport === true && !allowColorFallback) {
      throw new Error(
        `Hardware Isolation Violation: Black & White batch cannot be sent to Color printer "${printer.name}" without color fallback enabled.`,
      );
    }

    if (hasDoubleSided && !targetSupportsHardwareDuplex) {
      throw new Error(
        `Hardware Isolation Violation: Double-sided batch cannot be sent directly to Simplex printer "${printer.name}".`,
      );
    }

    const isHardwareDuplex = hasDoubleSided && targetSupportsHardwareDuplex;
    const outputPdf = await PDFDocument.create();
    let totalCalculatedPages = 0;
    let defaultPageSize: [number, number] = [595.28, 841.89];

    for (const item of batchItems) {
      const sourcePdf = await loadSourceAsPdfDocument(item.sourcePath);
      const activeConfigs = item.pagesConfigOverride || item.job.pagesConfig;
      const configsToProcess =
        activeConfigs && activeConfigs.length > 0
          ? activeConfigs
          : [
              {
                startPage: 1,
                endPage: sourcePdf.getPageCount(),
                copies: 1,
                sideMode: hasDoubleSided ? ("double_sided" as const) : ("single_sided" as const),
                colorMode: "black_and_white" as const,
                paperSize: "a4" as const,
              },
            ];

      if (sourcePdf.getPageCount() > 0) {
        const firstP = sourcePdf.getPage(0);
        defaultPageSize = [firstP.getWidth(), firstP.getHeight()];
      }

      for (const config of configsToProcess) {
        const start = Math.max(1, config.startPage);
        const end = Math.min(sourcePdf.getPageCount(), config.endPage);
        const copies = Math.max(1, config.copies ?? 1);

        const pageIndices: number[] = [];
        for (let i = start; i <= end; i++) {
          pageIndices.push(i - 1);
        }

        const rangeCount = pageIndices.length;
        if (rangeCount > 0) {
          for (let c = 0; c < copies; c++) {
            const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndices);
            copiedPages.forEach((p) => outputPdf.addPage(p));
            totalCalculatedPages += rangeCount;

            // In hardware duplex, if a document or copy has an odd number of pages,
            // pad with an empty page so the next document doesn't print on the back side!
            if (isHardwareDuplex && rangeCount % 2 === 1) {
              const lastP = copiedPages[copiedPages.length - 1];
              const { width, height } = lastP.getSize();
              outputPdf.addPage([width, height]);
            }
          }
        }
      }
    }

    if (outputPdf.getPageCount() === 0) {
      return {
        success: true,
        status: "PRINT_SUBMITTED",
        printerName: targetPrinterName,
        pagesSubmitted: 0,
        duplexModeUsed: isHardwareDuplex ? "hardware" : "simplex",
      };
    }

    // Append blank separator page only once at the end of the batch
    if (shouldAddSeparatorPage) {
      if (isHardwareDuplex) {
        outputPdf.addPage(defaultPageSize);
        outputPdf.addPage(defaultPageSize);
      } else {
        outputPdf.addPage(defaultPageSize);
      }
    }

    const outputBytes = await outputPdf.save();
    const tempDir = path.join(os.tmpdir(), "printsaathi_spool");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    tempExtractedPath = path.join(tempDir, `batch_${firstJob.orderId || firstJob.id}_${Date.now()}_spooled.pdf`);
    fs.writeFileSync(tempExtractedPath, outputBytes);

    const settings = ["shrink"];
    if (isHardwareDuplex) {
      settings.push("duplex");
    } else {
      settings.push("simplex");
    }
    const firstConfig = (batchItems[0].pagesConfigOverride || batchItems[0].job.pagesConfig)?.[0];
    if (anyColorJob) {
      settings.push("color");
    } else {
      settings.push("monochrome");
    }
    if (firstConfig?.paperSize) {
      settings.push(`paper=${firstConfig.paperSize.toUpperCase()}`);
    }

    const executable = rendererPath();
    logger.info(
      `Rendering combined batch PDF (${totalCalculatedPages} pages across ${batchItems.length} items) and submitting to Windows printer "${targetPrinterName}" with settings: ${settings.join(",")}`,
    );
    await execFileAsync(
      executable,
      ["-print-to", targetPrinterName, "-silent", "-print-settings", settings.join(","), tempExtractedPath],
      { timeout: 180000, windowsHide: true },
    );

    logger.info(
      `Batch for Order #${firstJob.orderId?.slice(0, 8)} (${batchItems.length} docs) submitted to "${targetPrinterName}".`,
    );

    return {
      success: true,
      status: "PRINT_SUBMITTED",
      printerName: targetPrinterName,
      pagesSubmitted: totalCalculatedPages,
      duplexModeUsed: isHardwareDuplex ? "hardware" : "simplex",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Print batch execution error";
    logger.error(`Batch print execution failed for Order #${firstJob.orderId?.slice(0, 8)}: ${errorMsg}`);
    return {
      success: false,
      status: "PRINT_FAILED",
      printerName: targetPrinterName,
      pagesSubmitted: 0,
      errorMessage: errorMsg,
    };
  } finally {
    if (tempExtractedPath && fs.existsSync(tempExtractedPath)) {
      if (process.env.NODE_ENV === "test") {
        try {
          fs.unlinkSync(tempExtractedPath);
        } catch {
          // ignore
        }
      } else {
        const fileToClean = tempExtractedPath;
        setTimeout(() => {
          try {
            if (fs.existsSync(fileToClean)) fs.unlinkSync(fileToClean);
          } catch {
            // ignore
          }
        }, 60000);
      }
    }
  }
}
