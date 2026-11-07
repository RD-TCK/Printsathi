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
});

