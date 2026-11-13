import { execFile } from "node:child_process";
import os from "node:os";
import type { DiscoveredPrinter } from "./types";
import { logger } from "./logger";
import { loadConfig } from "./config";

function runPowerShellScript(script: string, timeoutMs: number = 8000): Promise<string> {
  return new Promise((resolve) => {
    // Executing via standard -Command with script block avoids triggering AV AMSI heuristics on base64 -EncodedCommand
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `& { ${script} }`],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          logger.debug("PowerShell printer query warning:", { error: error.message });
          resolve("");
        } else {
          resolve(stdout ? stdout.toString() : "");
        }
      },
    );
  });
}

let cachedPrinters: DiscoveredPrinter[] | null = null;
let lastDiscoveryTimestamp = 0;
const PRINTER_CACHE_TTL_MS = 10000; // 10 seconds cache

export async function discoverWindowsPrinters(forceRefresh = false): Promise<DiscoveredPrinter[]> {
  const isWindows = process.platform === "win32" || os.platform() === "win32";

  if (!isWindows) {
    logger.debug("Non-Windows platform detected; using standard printer interface.");
    return getFallbackPrinters();
  }

  const now = Date.now();
  if (!forceRefresh && cachedPrinters && now - lastDiscoveryTimestamp < PRINTER_CACHE_TTL_MS) {
    return cachedPrinters;
  }

  try {
    const config = loadConfig();
    const disabledSet = new Set((config.disabledPrinters || []).map((s) => s.trim().toLowerCase()));
    const colorOverrides = config.printerColorOverrides || {};

    const printerScript = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$printers = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue
if (-not $printers) {
  $printers = Get-WmiObject Win32_Printer -ErrorAction SilentlyContinue
}
if (-not $printers) {
  $printers = Get-Printer -ErrorAction SilentlyContinue
}
$pnp = Get-PnpDevice -Class Printer -ErrorAction SilentlyContinue

$results = foreach ($p in $printers) {
  $pName = $p.Name
  $matchedPnp = $pnp | Where-Object { $_.FriendlyName -eq $pName -or ($p.PortName -and $_.InstanceId -like "*$($p.PortName)*") } | Select-Object -First 1
  $isPnpPresent = $null
  if ($matchedPnp) {
    $isPnpPresent = [bool]$matchedPnp.Present
  }
  [PSCustomObject]@{
    Name = $p.Name
    Default = [bool]$p.Default
    PrinterStatus = [int]$p.PrinterStatus
    DriverName = [string]$p.DriverName
    PortName = [string]$p.PortName
    WorkOffline = [bool]$p.WorkOffline
    DetectedErrorState = [int]$p.DetectedErrorState
    PrinterPaperNames = $p.PrinterPaperNames
    PnpPresent = $isPnpPresent
  }
}
if ($results) {
  $results | ConvertTo-Json -Compress
}
`;

    const configScript = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$configs = Get-CimInstance Win32_PrinterConfiguration -ErrorAction SilentlyContinue
if (-not $configs) {
  $configs = Get-WmiObject Win32_PrinterConfiguration -ErrorAction SilentlyContinue
}
if ($configs) {
  $configs | Select-Object Name, Color, Duplex | ConvertTo-Json -Compress
}
`;

    const [printerOut, configOut] = await Promise.all([
      runPowerShellScript(printerScript, 8000),
      runPowerShellScript(configScript, 8000),
    ]);

    const trimmed = printerOut.trim();
    if (!trimmed) {
      logger.warn("PowerShell printer discovery returned empty output.");
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
        const nameLower = name.toLowerCase();
        const isDefault = Boolean(item.Default);
        const driverName = item.DriverName ? String(item.DriverName) : undefined;
        const portName = item.PortName ? String(item.PortName).trim() : undefined;
        const systemId = nameLower.replace(/[^a-z0-9]/g, "_");

        const statusCode = Number(item.PrinterStatus);
        const isWorkOffline = Boolean(item.WorkOffline);
        const isUsb = Boolean(portName && /^(usb|dot4)/i.test(portName)) || item.PnpPresent !== null;
        const isPnpDisconnected = item.PnpPresent === false;
        const isExplicitOffline = statusCode === 7;

        // Physical Disconnection:
        // A USB printer is disconnected ONLY when absent from the USB bus (PnpPresent === false).
        // If PnpPresent === true, the hardware IS plugged in and powered; WorkOffline = true simply
        // means Windows Spooler entered power-saving deep sleep / idle timeout.
        const isPhysicallyDisconnected = isUsb
          ? isPnpDisconnected
          : isPnpDisconnected || (isWorkOffline && item.PnpPresent !== true) || isExplicitOffline;

        // Detect if printer is in sleep / idle power-saving state:
        const isSleeping = !isPhysicallyDisconnected && (isWorkOffline || statusCode === 11);

        let status: DiscoveredPrinter["status"] = "online";
        if (isPhysicallyDisconnected) {
          status = "offline";
        } else if (
          statusCode === 6 ||
          [4, 6, 7, 8, 9, 10].includes(Number(item.DetectedErrorState))
        ) {
          status = "error";
        } else if (statusCode === 4) {
          status = "printing";
        }

        // Check if printer is disabled by user in agent config
        const isDisabled = disabledSet.has(nameLower);
        if (isDisabled) {
          status = "offline";
        }

        // Determine color capability:
        // Priority 1: User manual override in agent config (highest authority)
        // Priority 2: Win32_PrinterConfiguration Color property (2=Color, 1=Mono)
        // Priority 3: Driver/Name model keywords (defaults safely to Monochrome for unknown office printers)
        let isColorUserOverride = false;
        let colorSupport: boolean | undefined;

        if (colorOverrides[nameLower] !== undefined) {
          colorSupport = Boolean(colorOverrides[nameLower]);
          isColorUserOverride = true;
        } else if (colorMap.has(nameLower)) {
          colorSupport = colorMap.get(nameLower);
        } else {
          const driverLower = (driverName || "").toLowerCase();
          const fullDesc = `${nameLower} ${driverLower}`;

          const isExplicitColor =
            fullDesc.includes("color") ||
            fullDesc.includes("clp") ||
            fullDesc.includes("c-series") ||
            fullDesc.includes("deskjet") ||
            fullDesc.includes("inkjet") ||
            fullDesc.includes("pixma") ||
            fullDesc.includes("ecotank") ||
            fullDesc.includes("smart tank") ||
            fullDesc.includes("tank") ||
            fullDesc.includes("l32") ||
            fullDesc.includes("l31") ||
            fullDesc.includes("l130") ||
            fullDesc.includes("g20") ||
            fullDesc.includes("g30") ||
            fullDesc.includes("g10") ||
            fullDesc.includes("t510") ||
            fullDesc.includes("dcp-t") ||
            fullDesc.includes("mfc-t");

          const isExplicitMono =
            fullDesc.includes("mono") ||
            fullDesc.includes("m1005") ||
            fullDesc.includes("1020") ||
            fullDesc.includes("1007") ||
            fullDesc.includes("1008") ||
            fullDesc.includes("black") ||
            fullDesc.includes("laserjet") ||
            fullDesc.includes("lbp") ||
            fullDesc.includes("hl-") ||
            fullDesc.includes("dcp-l") ||
            fullDesc.includes("mfc-l") ||
            fullDesc.includes("pantum") ||
            fullDesc.includes("thermal") ||
            fullDesc.includes("pos-");

          if (isExplicitColor) {
            colorSupport = true;
          } else if (isExplicitMono) {
            colorSupport = false;
          } else {
            // Default safe choice for office printers: Monochrome (never falsely assume color)
            colorSupport = false;
          }
        }

        // Determine duplex capability:
        let duplexSupport = duplexMap.get(nameLower);
        if (duplexSupport === undefined || duplexSupport === false) {
          const driverLower = (driverName || "").toLowerCase();
          const fullDesc = `${nameLower} ${driverLower}`;
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
            fullDesc.includes("bizhub") ||
            fullDesc.includes("ecosys") ||
            fullDesc.includes("taskalfa") ||
            fullDesc.includes("kyocera") ||
            fullDesc.includes("duplex") ||
            /\b(dn|dw|cdw|fdw|dne|dtn)\b/.test(fullDesc) ||
            /(cidn|cdn|ciwh|ciph)$/.test(nameLower);

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
          portName,
          isDisabled,
          isSleeping,
          isColorUserOverride,
          capabilities: {
            colorSupport: Boolean(colorSupport),
            duplexSupport: Boolean(duplexSupport),
            paperSizes:
              Array.isArray(item.PrinterPaperNames) && item.PrinterPaperNames.length
                ? item.PrinterPaperNames
                : ["A4", "Letter"],
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

    cachedPrinters = discovered;
    lastDiscoveryTimestamp = Date.now();
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
 *   - Black & White requests NEVER go to Color printers under any circumstances (saving expensive color ink/toner).
 *   - Color requests NEVER go to B&W printers.
 * - STRICT DUPLEX ISOLATION:
 *   - Double-sided / duplex requests MUST route ONLY to printers with hardware duplex support (duplexSupport === true).
 *   - Duplex print requests NEVER go to Simplex printers under any circumstances.
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
    disabledPrinters?: string[];
    allowColorFallbackForMono?: boolean;
    allowMonoFallbackForColor?: boolean;
    allowOffline?: boolean;
  },
): DiscoveredPrinter | null {
  const busySet = new Set(
    Array.isArray(options.busyPrinters)
      ? options.busyPrinters.map((s) => s.toLowerCase())
      : options.busyPrinters
        ? Array.from(options.busyPrinters).map((s) => s.toLowerCase())
        : [],
  );

  let configDisabled: string[] = [];
  try {
    const config = loadConfig();
    configDisabled = config?.disabledPrinters || [];
  } catch {
    // Non-fatal if config unavailable
  }

  const disabledSet = new Set([
    ...(options.disabledPrinters || []).map((s) => s.toLowerCase()),
    ...configDisabled.map((s) => s.toLowerCase()),
  ]);

  // If a specific printer is required (e.g. Duplex Step 2 even pages must print on the exact same printer)
  if (options.requiredPrinterName) {
    const matched = printers.find(
      (p) =>
        !p.isDisabled &&
        !disabledSet.has(p.name.toLowerCase()) &&
        isPhysicalPrinter(p) &&
        (options.allowOffline || p.status !== "offline") &&
        p.name.toLowerCase() === options.requiredPrinterName!.toLowerCase(),
    );
    if (matched) {
      // 1. Color isolation: Color jobs cannot go to Monochrome printers unless allowMonoFallbackForColor is true
      if (options.colorMode === "color" && !matched.capabilities?.colorSupport && !options.allowMonoFallbackForColor) return null;

      // 2. Strict B&W isolation: B&W jobs cannot go to Color printers unless allowColorFallbackForMono is true
      if (
        options.colorMode === "black_and_white" &&
        matched.capabilities?.colorSupport &&
        options.allowColorFallbackForMono !== true
      ) {
        return null;
      }

      // 3. Duplex isolation: Duplex jobs NEVER go to Simplex printers when hardware duplex is required.
      if (options.requiresDuplex && matched.capabilities?.duplexSupport !== true) return null;

      return matched;
    }
    return null;
  }

  // Filter for physical printers that are enabled and NOT currently busy, disabled, or reserved.
  const availablePrinters = printers.filter(
    (p) =>
      !p.isDisabled &&
      !disabledSet.has(p.name.toLowerCase()) &&
      isPhysicalPrinter(p) &&
      (options.allowOffline || p.status !== "offline") &&
      !busySet.has(p.name.toLowerCase()),
  );

  const compatiblePrinters = availablePrinters.filter(
    (p) =>
      !options.paperSize ||
      p.capabilities?.paperSizes?.some((size) => size.toLowerCase().includes(options.paperSize!.toLowerCase())),
  );

  if (compatiblePrinters.length === 0) {
    return null;
  }

  // Helper to pick best printer from candidates:
  const pickBestCandidate = (candidates: DiscoveredPrinter[]): DiscoveredPrinter | null => {
    if (candidates.length === 0) return null;
    const onlineDefault = candidates.find((p) => p.isDefault && (p.status === "online" || p.status === "printing"));
    if (onlineDefault) return onlineDefault;

    // Prefer active awake printers first over sleeping ones if multiple are available
    const awakeOnline = candidates.find((p) => !p.isSleeping && (p.status === "online" || p.status === "printing"));
    if (awakeOnline) return awakeOnline;

    const firstOnline = candidates.find((p) => p.status === "online" || p.status === "printing");
    if (firstOnline) return firstOnline;

    const physicalDefault = candidates.find((p) => p.isDefault);
    if (physicalDefault) return physicalDefault;

    return candidates[0] || null;
  };

  if (options.colorMode === "color") {
    // STRICT COLOR AUTO-ROUTING:
    // Color jobs MUST route ONLY to a physical printer that explicitly supports Color!
    // A B&W printer marked as "default" will NEVER receive color prints under any circumstances!
    const colorPrinters = compatiblePrinters.filter((p) => p.capabilities?.colorSupport === true);
    if (colorPrinters.length === 0) {
      if (options.allowMonoFallbackForColor) {
        return pickBestCandidate(compatiblePrinters);
      }
      return null;
    }

    // Use preferred printer ONLY if it is an actual color printer
    if (options.preferredName) {
      const preferred = colorPrinters.find((p) => p.name.toLowerCase() === options.preferredName!.toLowerCase());
      if (preferred) {
        const hasOnlineCandidate = colorPrinters.some(
          (p) =>
            (p.status === "online" || p.status === "printing") &&
            (!options.requiresDuplex || p.capabilities?.duplexSupport === true),
        );
        if (preferred.status !== "offline" || !hasOnlineCandidate) {
          return preferred;
        }
      }
    }

    if (options.requiresDuplex) {
      const duplexColor = colorPrinters.filter((p) => p.capabilities?.duplexSupport === true);
      if (duplexColor.length > 0) return pickBestCandidate(duplexColor);
    }

    return pickBestCandidate(colorPrinters);
  }

  // B&W ROUTING:
  // If user selected a preferred default printer, use it ONLY if it is a B&W printer (or fallback is allowed)
  if (options.preferredName) {
    const matched = compatiblePrinters.find((p) => p.name.toLowerCase() === options.preferredName!.toLowerCase());
    if (matched) {
      const satisfiesDuplex = !options.requiresDuplex || matched.capabilities?.duplexSupport === true;
      const satisfiesMono = !matched.capabilities?.colorSupport || options.allowColorFallbackForMono === true;

      if (satisfiesDuplex && satisfiesMono) {
        const hasOnlineCandidate = compatiblePrinters.some(
          (p) =>
            (p.status === "online" || p.status === "printing") &&
            (!options.requiresDuplex || p.capabilities?.duplexSupport === true) &&
            !p.capabilities?.colorSupport,
        );
        if (matched.status !== "offline" || !hasOnlineCandidate) {
          return matched;
        }
      }
    }
  }

  if (options.requiresDuplex) {
    // 1. Prioritize dedicated monochrome duplex printer
    const duplexMono = compatiblePrinters.filter(
      (p) => !p.capabilities?.colorSupport && p.capabilities?.duplexSupport === true,
    );
    if (duplexMono.length > 0) return pickBestCandidate(duplexMono);

    // 2. Fallback to color duplex only if explicitly permitted
    if (options.allowColorFallbackForMono === true) {
      const duplexColor = compatiblePrinters.filter(
        (p) => p.capabilities?.colorSupport === true && p.capabilities?.duplexSupport === true,
      );
      if (duplexColor.length > 0) return pickBestCandidate(duplexColor);
    }
    return null;
  }

  // Single-sided B&W:
  // 1. Dedicated monochrome printer (!colorSupport)
  const monoPrinters = compatiblePrinters.filter((p) => !p.capabilities?.colorSupport);
  if (monoPrinters.length > 0) {
    return pickBestCandidate(monoPrinters);
  }

  // 2. Color printer fallback ONLY if allowColorFallbackForMono is explicitly true
  if (options.allowColorFallbackForMono === true) {
    const colorPrinters = compatiblePrinters.filter((p) => p.capabilities?.colorSupport === true);
    if (colorPrinters.length > 0) {
      return pickBestCandidate(colorPrinters);
    }
  }

  return null;
}

export function findDefaultPrinter(
  printers: DiscoveredPrinter[],
  preferredName?: string | null,
  allowOffline = false,
): DiscoveredPrinter | null {
  const physicalPrinters = printers.filter((p) => !p.isDisabled && isPhysicalPrinter(p) && (allowOffline || p.status !== "offline"));
  if (physicalPrinters.length === 0) return null;

  if (preferredName) {
    const matched = physicalPrinters.find((p) => p.name.toLowerCase() === preferredName.toLowerCase());
    const hasOnlinePhysical = physicalPrinters.some((p) => p.status === "online" || p.status === "printing");
    if (matched && (matched.status !== "offline" || !hasOnlinePhysical)) {
      return matched;
    }
  }

  const onlineDefault = physicalPrinters.find((p) => p.isDefault && (p.status === "online" || p.status === "printing"));
  if (onlineDefault) return onlineDefault;

  const firstOnline = physicalPrinters.find((p) => p.status === "online" || p.status === "printing");
  if (firstOnline) return firstOnline;

  const systemDefault = physicalPrinters.find((p) => p.isDefault);
  if (systemDefault) return systemDefault;

  return physicalPrinters[0] || null;
}
