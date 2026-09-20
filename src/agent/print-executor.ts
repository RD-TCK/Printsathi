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
    // 1. Process page ranges and append a blank separator page at the end of customer print request
    logger.info(`Extracting configured page ranges and appending separator page for Job #${job.id.slice(0, 8)}...`);
    const outputPdf = await PDFDocument.create();
    let effectivePagesCount = 0;

    let calculatedPages = 0;
    if (activeConfigs && activeConfigs.length > 0) {
      for (const config of activeConfigs) {
        const start = Math.max(1, config.startPage);
        const end = Math.min(sourcePdf.getPageCount(), config.endPage);
        const pageIndices: number[] = [];
        for (let i = start; i <= end; i++) {
          pageIndices.push(i - 1); // 0-indexed
          calculatedPages++;
        }
        if (pageIndices.length > 0) {
          const copiedPages = await outputPdf.copyPages(sourcePdf, pageIndices);
          copiedPages.forEach((p) => outputPdf.addPage(p));
        }
      }
    } else {
      const allIndices = Array.from({ length: sourcePdf.getPageCount() }, (_, i) => i);
      const copiedPages = await outputPdf.copyPages(sourcePdf, allIndices);
      copiedPages.forEach((p) => outputPdf.addPage(p));
      calculatedPages = sourcePdf.getPageCount();
    }

    // Add 1 blank page at the very end as a job separator
    const firstPage = outputPdf.getPageCount() > 0 ? outputPdf.getPage(0) : null;
    if (firstPage) {
      const { width, height } = firstPage.getSize();
      outputPdf.addPage([width, height]);
    } else {
      outputPdf.addPage([595.28, 841.89]); // Standard A4 points
    }

    effectivePagesCount = calculatedPages;

    const outputBytes = await outputPdf.save();
    const tempDir = path.join(os.tmpdir(), "printsaathi_spool");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    tempExtractedPath = path.join(tempDir, `job_${job.id}_${Date.now()}_spooled.pdf`);
    fs.writeFileSync(tempExtractedPath, outputBytes);
    finalPdfPath = tempExtractedPath;

    const settings = ["fit", "simplex"];
    const config = activeConfigs?.[0];
    if (config) {
      settings.push(config.colorMode === "color" ? "color" : "monochrome");
      if (config.paperSize) {
        settings.push(`paper=${config.paperSize.toUpperCase()}`);
      }
    }
    const executable = rendererPath();
    if ((process as NodeJS.Process & { pkg?: unknown }).pkg) extractedRenderer = executable;
    logger.info(`Rendering PDF and submitting to Windows printer "${targetPrinterName}"...`);
    // Wait for the renderer to finish spooling before removing the source PDF.
    // A successful renderer exit is submission, not proof of physical output.
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
      pagesSubmitted: effectivePagesCount,
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
