import { describe, expect, it } from "vitest";
import { findBestPrinterForJob } from "./printer-discovery";
import type { DiscoveredPrinter } from "./types";

describe("Printer Routing & Exclusion Safety", () => {
  const bwPrinter: DiscoveredPrinter = {
    name: "HP LaserJet M1005 (B&W)",
    systemIdentifier: "sys-hp-m1005",
    driverName: "HP LaserJet M1005",
    portName: "USB001",
    status: "online",
    isDefault: true,
    capabilities: {
      colorSupport: false,
      duplexSupport: false,
      paperSizes: ["a4"],
    },
  };

  const colorPrinter: DiscoveredPrinter = {
    name: "Epson L805 (Color)",
    systemIdentifier: "sys-epson-l805",
    driverName: "Epson L805 Series",
    portName: "USB002",
    status: "online",
    isDefault: false,
    capabilities: {
      colorSupport: true,
      duplexSupport: false,
      paperSizes: ["a4"],
    },
  };

  const thirdPrinter: DiscoveredPrinter = {
    name: "Canon G2000 (Color)",
    systemIdentifier: "sys-canon-g2000",
    driverName: "Canon G2000",
    portName: "USB003",
    status: "online",
    isDefault: false,
    capabilities: {
      colorSupport: true,
      duplexSupport: false,
      paperSizes: ["a4"],
    },
  };

  it("never routes a color print job to a black-and-white printer even if B&W is the default/preferred printer", () => {
    const printers = [bwPrinter, colorPrinter];

    // Customer requests a color job, but shop has HP LaserJet set as default/preferred
    const selected = findBestPrinterForJob(printers, {
      colorMode: "color",
      preferredName: bwPrinter.name,
    });

    expect(selected).not.toBeNull();
    expect(selected?.name).toBe(colorPrinter.name);
    expect(selected?.capabilities?.colorSupport).toBe(true);
  });

  it("returns null if a color job is requested but no color printers exist (never sends color to B&W)", () => {
    const printers = [bwPrinter];

    const selected = findBestPrinterForJob(printers, {
      colorMode: "color",
      preferredName: bwPrinter.name,
    });

    expect(selected).toBeNull();
  });

  it("allows black and white jobs to route to the default B&W printer", () => {
    const printers = [bwPrinter, colorPrinter];

    const selected = findBestPrinterForJob(printers, {
      colorMode: "black_and_white",
      preferredName: bwPrinter.name,
    });

    expect(selected).not.toBeNull();
    expect(selected?.name).toBe(bwPrinter.name);
  });

  it("excludes disabled printers (e.g. 4 printers connected, 1 disabled)", () => {
    // Color printer is disabled by user in disabledPrinters
    const printers = [bwPrinter, colorPrinter, thirdPrinter];
    const disabledPrinters = [colorPrinter.name];

    const selected = findBestPrinterForJob(printers, {
      colorMode: "color",
      disabledPrinters,
    });

    // Should route to thirdPrinter (Canon G2000), skipping the disabled Epson L805
    expect(selected).not.toBeNull();
    expect(selected?.name).toBe(thirdPrinter.name);
  });

  it("does not pick a disabled printer even if specifically named as preferredName", () => {
    const printers = [bwPrinter, colorPrinter, thirdPrinter];
    const disabledPrinters = [bwPrinter.name];

    const selected = findBestPrinterForJob(printers, {
      colorMode: "black_and_white",
      preferredName: bwPrinter.name,
      disabledPrinters,
      allowColorFallbackForMono: true,
    });

    // B&W is disabled, so it must fall back to one of the non-disabled printers
    expect(selected).not.toBeNull();
    expect(selected?.name).not.toBe(bwPrinter.name);
  });

  it("routes jobs to a sleeping/idle connected printer so it can be auto-woken without confusion", () => {
    const sleepingBwPrinter: DiscoveredPrinter = {
      ...bwPrinter,
      name: "HP LaserJet 1020 (Sleeping)",
      status: "online",
      isSleeping: true,
      isDefault: true,
    };
    const printers = [sleepingBwPrinter, colorPrinter];

    const selected = findBestPrinterForJob(printers, {
      colorMode: "black_and_white",
      preferredName: sleepingBwPrinter.name,
    });

    // Sleeping connected printer is online and ready to be woken up
    expect(selected).not.toBeNull();
    expect(selected?.name).toBe(sleepingBwPrinter.name);
    expect(selected?.isSleeping).toBe(true);
  });

  it("prefers an awake active printer when multiple compatible printers exist, but uses sleeping printer when preferred", () => {
    const sleepingBwPrinter: DiscoveredPrinter = {
      ...bwPrinter,
      name: "HP LaserJet 1020 (Sleeping)",
      status: "online",
      isSleeping: true,
      isDefault: false,
    };
    const awakeBwPrinter: DiscoveredPrinter = {
      ...bwPrinter,
      name: "HP LaserJet M1005 (Awake)",
      status: "online",
      isSleeping: false,
      isDefault: false,
    };

    // When no preference is specified, prefer the awake printer over the sleeping one
    const autoPicked = findBestPrinterForJob([sleepingBwPrinter, awakeBwPrinter], {
      colorMode: "black_and_white",
    });
    expect(autoPicked?.name).toBe(awakeBwPrinter.name);

    // When the sleeping printer is set as preferred, route to it so it auto-wakes
    const preferredPicked = findBestPrinterForJob([sleepingBwPrinter, awakeBwPrinter], {
      colorMode: "black_and_white",
      preferredName: sleepingBwPrinter.name,
    });
    expect(preferredPicked?.name).toBe(sleepingBwPrinter.name);
  });

  it("falls back to monochrome printer when allowMonoFallbackForColor is enabled and no color printer exists", () => {
    const printers = [bwPrinter];

    const selected = findBestPrinterForJob(printers, {
      colorMode: "color",
      preferredName: bwPrinter.name,
      allowMonoFallbackForColor: true,
    });

    expect(selected).not.toBeNull();
    expect(selected?.name).toBe(bwPrinter.name);
  });

  it("still prefers color printer over monochrome printer when both exist and allowMonoFallbackForColor is enabled", () => {
    const printers = [bwPrinter, colorPrinter];

    const selected = findBestPrinterForJob(printers, {
      colorMode: "color",
      preferredName: bwPrinter.name,
      allowMonoFallbackForColor: true,
    });

    expect(selected).not.toBeNull();
    expect(selected?.name).toBe(colorPrinter.name);
  });

  it("prefers dedicated monochrome printer over a color preferred/default printer for B&W jobs", () => {
    const printers = [
      { ...bwPrinter, isDefault: false },
      { ...colorPrinter, isDefault: true },
    ];

    const selected = findBestPrinterForJob(printers, {
      colorMode: "black_and_white",
      preferredName: colorPrinter.name,
      allowColorFallbackForMono: true,
    });

    expect(selected).not.toBeNull();
    expect(selected?.name).toBe(bwPrinter.name);
    expect(selected?.capabilities?.colorSupport).toBe(false);
  });

  it("load-balances 5 B&W and 4 Color printers by least Windows spooler queue + round-robin while keeping strict isolation", () => {
    const makeBw = (idx: number, isDefault = false): DiscoveredPrinter => ({
      ...bwPrinter,
      name: `HP B&W ${idx}`,
      systemIdentifier: `bw_${idx}`,
      isDefault,
    });
    const makeColor = (idx: number): DiscoveredPrinter => ({
      ...colorPrinter,
      name: `Epson Color ${idx}`,
      systemIdentifier: `color_${idx}`,
      isDefault: false,
    });

    const shopPrinters: DiscoveredPrinter[] = [
      makeBw(1, true),
      makeBw(2),
      makeBw(3),
      makeBw(4),
      makeBw(5),
      makeColor(1),
      makeColor(2),
      makeColor(3),
      makeColor(4),
    ];

    // 1. Round-robin across 5 idle B&W printers when queues are all 0 (never picks any Color printer)
    const lastUsed = new Map<string, number>();
    const pickedBwNames: string[] = [];
    for (let step = 1; step <= 5; step++) {
      const picked = findBestPrinterForJob(shopPrinters, {
        colorMode: "black_and_white",
        preferredName: "HP B&W 1",
        lastUsedOrder: lastUsed,
        loadBalancePools: true,
      });
      expect(picked).not.toBeNull();
      expect(picked?.capabilities?.colorSupport).toBe(false);
      pickedBwNames.push(picked!.name);
      lastUsed.set(picked!.name.toLowerCase(), step);
    }
    expect(new Set(pickedBwNames).size).toBe(5);

    // 2. Round-robin across 4 idle Color printers (never picks any B&W printer)
    const pickedColorNames: string[] = [];
    for (let step = 1; step <= 4; step++) {
      const picked = findBestPrinterForJob(shopPrinters, {
        colorMode: "color",
        preferredName: "HP B&W 1",
        lastUsedOrder: lastUsed,
        loadBalancePools: true,
      });
      expect(picked).not.toBeNull();
      expect(picked?.capabilities?.colorSupport).toBe(true);
      pickedColorNames.push(picked!.name);
      lastUsed.set(picked!.name.toLowerCase(), 10 + step);
    }
    expect(new Set(pickedColorNames).size).toBe(4);

    // 3. Live spooler queue count overrides LRU/default: least-queued printer wins in its pool
    const queueCounts: Record<string, number> = {
      "hp b&w 1": 3,
      "hp b&w 2": 2,
      "hp b&w 3": 0,
      "hp b&w 4": 1,
      "hp b&w 5": 4,
      "epson color 1": 2,
      "epson color 2": 0,
      "epson color 3": 3,
      "epson color 4": 1,
    };
    expect(
      findBestPrinterForJob(shopPrinters, {
        colorMode: "black_and_white",
        preferredName: "HP B&W 1",
        queueCounts,
        lastUsedOrder: { "hp b&w 3": 99 },
        loadBalancePools: true,
      })?.name,
    ).toBe("HP B&W 3");

    expect(
      findBestPrinterForJob(shopPrinters, {
        colorMode: "color",
        queueCounts,
        lastUsedOrder: { "epson color 2": 99 },
        loadBalancePools: true,
      })?.name,
    ).toBe("Epson Color 2");

    // 4. Even when all 5 B&W printers are busy/offline, B&W job must NEVER go to Color printers
    const allBwBusy = shopPrinters.filter((p) => !p.capabilities?.colorSupport).map((p) => p.name);
    expect(
      findBestPrinterForJob(shopPrinters, {
        colorMode: "black_and_white",
        busyPrinters: allBwBusy,
        loadBalancePools: true,
      }),
    ).toBeNull();
  });

  it("changes functional routing when a printer is toggled between B&W and Color", () => {
    const printer: DiscoveredPrinter = {
      name: "HP LaserJet M1005",
      systemIdentifier: "sys-m1005",
      driverName: "HP LaserJet M1005",
      portName: "USB001",
      status: "online",
      isDefault: true,
      capabilities: {
        colorSupport: false,
        duplexSupport: false,
        paperSizes: ["a4"],
      },
    };

    // Initially B&W: rejects color jobs, accepts B&W jobs
    expect(findBestPrinterForJob([printer], { colorMode: "color" })).toBeNull();
    expect(findBestPrinterForJob([printer], { colorMode: "black_and_white" })?.name).toBe("HP LaserJet M1005");

    // After Switch to Color (colorSupport = true): accepts Color jobs and isolates B&W
    printer.capabilities!.colorSupport = true;
    expect(findBestPrinterForJob([printer], { colorMode: "color" })?.name).toBe("HP LaserJet M1005");
    expect(findBestPrinterForJob([printer], { colorMode: "black_and_white" })).toBeNull();
  });
});

