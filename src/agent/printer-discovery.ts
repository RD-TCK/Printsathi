import { exec } from "node:child_process";
import os from "node:os";
import type { DiscoveredPrinter } from "./types";
import { logger } from "./logger";

const execAsync = (cmd: string, options?: { timeout?: number }): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    exec(cmd, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      }
    });
  });
};

export async function discoverWindowsPrinters(): Promise<DiscoveredPrinter[]> {
  const isWindows = process.platform === "win32" || os.platform() === "win32";

  if (!isWindows) {
    logger.debug("Non-Windows platform detected; using standard printer interface.");
    return getFallbackPrinters();
  }

  try {
    // Query Win32_Printer
    const psPrintersCmd = `powershell.exe -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Printer | Select-Object Name, Default, PrinterStatus, DriverName, PortName, WorkOffline, Local | ConvertTo-Json -Compress"`;
    // Query Win32_PrinterConfiguration to reliably detect Color mode (1 = Monochrome/BW, 2 = Color)
    const psConfigCmd = `powershell.exe -NoProfile -NonInteractive -Command "Get-CimInstance Win32_PrinterConfiguration | Select-Object Name, Color | ConvertTo-Json -Compress"`;

    const [{ stdout: printerOut }, { stdout: configOut }] = await Promise.all([
      execAsync(psPrintersCmd, { timeout: 10000 }).catch(() => ({ stdout: "", stderr: "" })),
      execAsync(psConfigCmd, { timeout: 10000 }).catch(() => ({ stdout: "", stderr: "" })),
    ]);

    const trimmed = printerOut.trim();
    if (!trimmed) {
      logger.warn("PowerShell Win32_Printer query returned empty output.");
      return getFallbackPrinters();
    }

    // Build map of printerName -> isColor
    const colorMap = new Map<string, boolean>();
    try {
      const configTrimmed = configOut.trim();
      if (configTrimmed) {
        const configParsed = JSON.parse(configTrimmed);
        const configItems = Array.isArray(configParsed) ? configParsed : [configParsed];
        for (const item of configItems) {
          if (item && item.Name) {
            // In Win32_PrinterConfiguration, Color == 2 means Color, 1 means Monochrome
            colorMap.set(String(item.Name).trim().toLowerCase(), Number(item.Color) === 2);
          }
        }
      }
    } catch {
      // Non-fatal, fallback to driver/name heuristic
    }

    let rawList: unknown;
    try {
      rawList = JSON.parse(trimmed);
    } catch {
      logger.warn("Could not parse Win32_Printer JSON directly, attempting fallback.");
      return getFallbackPrinters();
    }

    const items = Array.isArray(rawList) ? rawList : [rawList];
    const discovered: DiscoveredPrinter[] = items
      .filter((item) => item && typeof item.Name === "string" && item.Name.trim().length > 0)
      .map((item) => {
        const name = String(item.Name).trim();
        const isDefault = Boolean(item.Default);
        const isOffline = Boolean(item.WorkOffline) || Number(item.PrinterStatus) === 7;
        const driverName = item.DriverName ? String(item.DriverName) : undefined;
        const systemId = name.toLowerCase().replace(/[^a-z0-9]/g, "_");

        let status: DiscoveredPrinter["status"] = "online";
        if (isOffline) {
          status = "offline";
        } else if (Number(item.PrinterStatus) === 4) {
          status = "printing";
        }

        // Determine color capability:
        // 1. First check Win32_PrinterConfiguration Color property
        // 2. Fall back to name/driver heuristics (e.g. LaserJet M1005 is mono)
        const nameLower = name.toLowerCase();
        let colorSupport = colorMap.get(nameLower);
        if (colorSupport === undefined) {
          const isKnownMono =
            nameLower.includes("mono") ||
            nameLower.includes("m1005") ||
            nameLower.includes("black") ||
            nameLower.includes("laserjet 1") ||
            nameLower.includes("laserjet p") ||
            nameLower.includes("thermal") ||
            nameLower.includes("pos-");
          colorSupport = !isKnownMono;
        }

        return {
          name,
          systemIdentifier: systemId,
          status,
          isDefault,
          driverName,
          capabilities: {
            colorSupport,
            duplexSupport: true,
            paperSizes: ["A4", "A3", "Letter", "Legal"],
          },
        };
      });

    if (discovered.length === 0) {
      return getFallbackPrinters();
    }

    logger.info(`Discovered ${discovered.length} Windows printer(s).`, {
      printers: discovered.map(
        (p) => `${p.name} (Color: ${p.capabilities?.colorSupport ? "Yes" : "No"}, Status: ${p.status})`,
      ),
    });

    return discovered;
  } catch (error) {
    logger.warn("Failed to query Win32_Printer, falling back to printer discovery fallback:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return getFallbackPrinters();
  }
}

function getFallbackPrinters(): DiscoveredPrinter[] {
  return [
    {
      name: "Microsoft Print to PDF",
      systemIdentifier: "microsoft_print_to_pdf",
      status: "online",
      isDefault: true,
      driverName: "Microsoft Print To PDF Driver",
      capabilities: {
        colorSupport: true,
        duplexSupport: true,
        paperSizes: ["A4", "Letter", "Legal", "A3"],
      },
    },
    {
      name: "Shop Thermal / Document Printer",
      systemIdentifier: "shop_thermal_document_printer",
      status: "online",
      isDefault: false,
      driverName: "Generic / Text Only",
      capabilities: {
        colorSupport: false,
        duplexSupport: false,
        paperSizes: ["A4", "Letter"],
      },
    },
  ];
}

/**
 * Intelligent Printer Matcher:
 * Automatically selects the best connected and online printer for the specific job requirements.
 * - If colorMode is "color", looks for an online printer with colorSupport === true.
 * - If colorMode is "black_and_white", prioritizes dedicated monochrome/B&W printers first to save color toner,
 *   then seamlessly falls back to any available online color printer.
 */
export function findBestPrinterForJob(
  printers: DiscoveredPrinter[],
  options: {
    colorMode: "color" | "black_and_white";
    paperSize?: string;
    preferredName?: string | null;
  },
): DiscoveredPrinter | null {
  const onlinePrinters = printers.filter((p) => p.status === "online" || p.status === "printing");
  if (onlinePrinters.length === 0) {
    // If no printer is explicitly online, return null or fallback
    return null;
  }

  // If user requested a preferred printer and it matches the mode, consider it
  if (options.preferredName) {
    const matched = onlinePrinters.find((p) => p.name.toLowerCase() === options.preferredName!.toLowerCase());
    if (matched) {
      if (options.colorMode === "color" && matched.capabilities?.colorSupport) {
        return matched;
      }
      if (options.colorMode === "black_and_white") {
        return matched;
      }
    }
  }

  if (options.colorMode === "color") {
    // Must find a printer that supports color
    const colorPrinter =
      onlinePrinters.find((p) => p.capabilities?.colorSupport && p.isDefault) ||
      onlinePrinters.find((p) => p.capabilities?.colorSupport);

    return colorPrinter || null;
  }

  // For Black & White:
  // 1. Prefer dedicated monochrome printer (colorSupport === false)
  const monoPrinter =
    onlinePrinters.find((p) => !p.capabilities?.colorSupport && p.isDefault) ||
    onlinePrinters.find((p) => !p.capabilities?.colorSupport);

  if (monoPrinter) {
    return monoPrinter;
  }

  // 2. Fall back to system default online printer, or any online printer
  const defaultOnline = onlinePrinters.find((p) => p.isDefault);
  if (defaultOnline) {
    return defaultOnline;
  }

  return onlinePrinters[0] || null;
}

export function findDefaultPrinter(
  printers: DiscoveredPrinter[],
  preferredName?: string | null,
): DiscoveredPrinter | null {
  if (preferredName) {
    const matched = printers.find((p) => p.name.toLowerCase() === preferredName.toLowerCase());
    if (matched && matched.status === "online") return matched;
  }

  const systemDefault = printers.find((p) => p.isDefault && p.status === "online");
  if (systemDefault) return systemDefault;

  const firstOnline = printers.find((p) => p.status === "online");
  if (firstOnline) return firstOnline;

  return printers[0] || null;
}
