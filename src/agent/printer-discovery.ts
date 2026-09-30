import { exec } from "node:child_process";
import os from "node:os";
import type { DiscoveredPrinter } from "./types";
import { logger } from "./logger";

const execAsync = (cmd: string, options?: { timeout?: number }): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    exec(cmd, { ...options, windowsHide: true }, (error, stdout, stderr) => {
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
    // An installed queue is not evidence that USB hardware is still attached.
    const psPrintersCmd = `powershell.exe -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); $devices=@(Get-PnpDevice -PresentOnly -ErrorAction Stop | Where-Object { $_.InstanceId -like 'USBPRINT*' -and $_.Status -eq 'OK' } | Select-Object -ExpandProperty InstanceId); Get-CimInstance Win32_Printer | Select-Object Name,Default,PrinterStatus,DriverName,PortName,WorkOffline,DetectedErrorState,PNPDeviceID,PrinterPaperNames,@{Name='UsbPresent';Expression={ $port=$_.PortName; $device=$_.PNPDeviceID; if ($port -match '^USB\\d+') { @($devices | Where-Object { ($device -and $_ -eq $device) -or $_ -like ('*&'+$port) -or $_ -like ('*'+$port) }).Count -gt 0 } else { $true } }} | ConvertTo-Json -Compress"`;
    const psConfigCmd = `powershell.exe -NoProfile -NonInteractive -Command "Get-CimInstance Win32_PrinterConfiguration | Select-Object Name,Color,Duplex | ConvertTo-Json -Compress"`;
    const [{ stdout: printerOut }, { stdout: configOut }] = await Promise.all([
      execAsync(psPrintersCmd, { timeout: 8000 }),
      execAsync(psConfigCmd, { timeout: 8000 }).catch(() => ({ stdout: "", stderr: "" })),
    ]);

    const trimmed = printerOut.trim();
    if (!trimmed) {
      logger.warn("PowerShell Win32_Printer query returned empty output.");
      return getFallbackPrinters();
    }

    // Build map of printerName -> isColor and isDuplex
    const colorMap = new Map<string, boolean>();
    const duplexMap = new Map<string, boolean>();
    try {
      const configTrimmed = configOut.trim();
      if (configTrimmed) {
        const configParsed = JSON.parse(configTrimmed);
        const configItems = Array.isArray(configParsed) ? configParsed : [configParsed];
        for (const item of configItems) {
          if (item && item.Name) {
            const key = String(item.Name).trim().toLowerCase();
            // In Win32_PrinterConfiguration, Color == 2 means Color, 1 means Monochrome
            if (item.Color !== undefined && item.Color !== null) {
              colorMap.set(key, Number(item.Color) === 2);
            }
            if (item.Duplex !== undefined && item.Duplex !== null) {
              duplexMap.set(key, Boolean(item.Duplex));
            }
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
        const isOffline = Boolean(item.WorkOffline) || Number(item.PrinterStatus) === 7 || item.UsbPresent === false;
        const driverName = item.DriverName ? String(item.DriverName) : undefined;
        const systemId = name.toLowerCase().replace(/[^a-z0-9]/g, "_");

        let status: DiscoveredPrinter["status"] = "online";
        if (isOffline) {
          status = "offline";
        } else if (Number(item.PrinterStatus) === 6 || [4, 6, 7, 8, 9, 10, 11].includes(Number(item.DetectedErrorState))) {
          status = "error";
        } else if (Number(item.PrinterStatus) === 4) {
          status = "printing";
        }

        // Determine color capability:
        // 1. First check Win32_PrinterConfiguration Color property
        // 2. Fall back to name/driver heuristics (e.g. LaserJet M1005 is mono)
        const nameLower = name.toLowerCase();
        const driverLower = (driverName || "").toLowerCase();
        const fullDesc = `${nameLower} ${driverLower}`;

        let colorSupport = colorMap.get(nameLower);
        if (colorSupport === undefined) {
          const isKnownMono =
            fullDesc.includes("mono") ||
            fullDesc.includes("m1005") ||
            fullDesc.includes("black") ||
            fullDesc.includes("laserjet 1") ||
            fullDesc.includes("laserjet p") ||
            fullDesc.includes("thermal") ||
            fullDesc.includes("pos-");
          colorSupport = !isKnownMono;
        }

        // Determine duplex capability:
        // 1. Check Win32_PrinterConfiguration Duplex property
        // 2. Fall back to known enterprise copiers and auto-duplex printer heuristics
        let duplexSupport = duplexMap.get(nameLower);
        if (duplexSupport === undefined || duplexSupport === false) {
          const isKnownSimplex =
            fullDesc.includes("m1005") ||
            fullDesc.includes("1020") ||
            fullDesc.includes("1007") ||
            fullDesc.includes("1008") ||
            fullDesc.includes("g2010") ||
            fullDesc.includes("g3010") ||
            fullDesc.includes("l130") ||
            fullDesc.includes("l3110") ||
            fullDesc.includes("l3210") ||
            fullDesc.includes("l3150") ||
            fullDesc.includes("thermal") ||
            fullDesc.includes("pos-");

          const isKnownDuplex =
            fullDesc.includes("ir-adv") ||
            fullDesc.includes("ir adv") ||
            fullDesc.includes("imagerunner") ||
            fullDesc.includes("c3326") ||
            fullDesc.includes("c3330") ||
            fullDesc.includes("c3520") ||
            fullDesc.includes("c5535") ||
            fullDesc.includes("c5540") ||
            fullDesc.includes("c5550") ||
            fullDesc.includes("c5560") ||
            fullDesc.includes("6075") ||
            fullDesc.includes("4545") ||
            fullDesc.includes("4245") ||
            fullDesc.includes("4045") ||
            fullDesc.includes("bizhub") ||
            fullDesc.includes("duplex") ||
            /\b(dn|dw|cdw|fdw|dne|dtn)\b/.test(fullDesc);

          if (isKnownDuplex && !isKnownSimplex) {
            duplexSupport = true;
          } else if (duplexSupport === undefined) {
            duplexSupport = false;
          }
        }

        return {
          name,
          systemIdentifier: systemId,
          status,
          isDefault,
          driverName,
          portName: item.PortName ? String(item.PortName) : undefined,
          capabilities: {
            colorSupport,
            duplexSupport: Boolean(duplexSupport),
            paperSizes: Array.isArray(item.PrinterPaperNames) && item.PrinterPaperNames.length ? item.PrinterPaperNames : ["A4", "Letter"],
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
  return [];
}

export function isPhysicalPrinter(printer: DiscoveredPrinter): boolean {
  return (
    !/onenote|print to pdf|xps|fax|pdfcreator|cutepdf|bullzip|dopdf/i.test(
      `${printer.name} ${printer.driverName || ""}`,
    ) && !/^(nul:|portprompt:|file:)$/i.test(printer.portName || "")
  );
}

/**
 * Intelligent Printer Matcher:
 * Automatically selects the best connected and online printer for the specific job requirements.
 * - STRICT COLOR ISOLATION:
 *   - "color" mode MUST route ONLY to printers with colorSupport === true.
 *   - "black_and_white" mode MUST route ONLY to dedicated monochrome/B&W printers (!colorSupport).
 *   - Black & White requests NEVER go to Color printers, and Color requests NEVER go to B&W printers.
 * - DUPLEX ROUTING:
 *   - If requiredPrinterName is provided (e.g. Step 2 "Print Next Side"), forces routing to that exact printer.
 * - SMART DIVERSION:
 *   - Automatically skips any printers listed in busyPrinters so other jobs divert to other free connected printers.
 */
export function findBestPrinterForJob(
  printers: DiscoveredPrinter[],
  options: {
    colorMode: "color" | "black_and_white";
    paperSize?: string;
    preferredName?: string | null;
    requiredPrinterName?: string | null;
    requiresDuplex?: boolean;
    busyPrinters?: Set<string> | string[];
  },
): DiscoveredPrinter | null {
  const busySet = new Set(
    Array.isArray(options.busyPrinters)
      ? options.busyPrinters.map((s) => s.toLowerCase())
      : options.busyPrinters
      ? Array.from(options.busyPrinters).map((s) => s.toLowerCase())
      : [],
  );

  // If a specific printer is required (e.g. Duplex Step 2 even pages must print on the exact same printer)
  if (options.requiredPrinterName) {
    const matched = printers.find(
      (p) =>
        isPhysicalPrinter(p) &&
        (p.status === "online" || p.status === "printing") &&
        p.name.toLowerCase() === options.requiredPrinterName!.toLowerCase(),
    );
    if (matched) return matched;
    return null;
  }

  // Filter for physical, online printers that are NOT currently busy or reserved
  const onlinePrinters = printers.filter(
    (p) =>
      isPhysicalPrinter(p) &&
      (p.status === "online" || p.status === "printing") &&
      !busySet.has(p.name.toLowerCase()),
  );

  const compatiblePrinters = onlinePrinters.filter(
    (p) =>
      !options.paperSize ||
      p.capabilities?.paperSizes?.some((size) =>
        size.toLowerCase().includes(options.paperSize!.toLowerCase()),
      ),
  );

  if (compatiblePrinters.length === 0) {
    return null;
  }

  // If user requested a preferred printer and it matches strict color mode, use it
  if (options.preferredName) {
    const matched = compatiblePrinters.find(
      (p) => p.name.toLowerCase() === options.preferredName!.toLowerCase(),
    );
    if (matched) {
      if (options.colorMode === "color" && matched.capabilities?.colorSupport === true) {
        return matched;
      }
      if (options.colorMode === "black_and_white" && !matched.capabilities?.colorSupport) {
        return matched;
      }
    }
  }

  if (options.colorMode === "color") {
    // STRICT: Must find an online printer that explicitly supports color.
    // NEVER fall back to monochrome/B&W printers for color jobs.
    const colorPrinters = compatiblePrinters.filter((p) => p.capabilities?.colorSupport === true);
    if (colorPrinters.length === 0) return null;

    if (options.requiresDuplex) {
      const duplexColor =
        colorPrinters.find((p) => p.capabilities?.duplexSupport === true && p.isDefault) ||
        colorPrinters.find((p) => p.capabilities?.duplexSupport === true);
      if (duplexColor) return duplexColor;
    }

    const defaultColor = colorPrinters.find((p) => p.isDefault);
    return defaultColor || colorPrinters[0] || null;
  }

  // STRICT B&W ROUTING:
  // Must find a dedicated monochrome/B&W printer (!colorSupport).
  // NEVER divert or fall back Black & White jobs to a Color printer.
  const monoPrinters = compatiblePrinters.filter((p) => !p.capabilities?.colorSupport);
  if (monoPrinters.length === 0) return null;

  if (options.requiresDuplex) {
    const duplexMono =
      monoPrinters.find((p) => p.capabilities?.duplexSupport === true && p.isDefault) ||
      monoPrinters.find((p) => p.capabilities?.duplexSupport === true);
    if (duplexMono) return duplexMono;
  }

  const defaultMono = monoPrinters.find((p) => p.isDefault);
  return defaultMono || monoPrinters[0] || null;
}

export function findDefaultPrinter(
  printers: DiscoveredPrinter[],
  preferredName?: string | null,
): DiscoveredPrinter | null {
  printers = printers.filter((p) => isPhysicalPrinter(p) && (p.status === "online" || p.status === "printing"));
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
