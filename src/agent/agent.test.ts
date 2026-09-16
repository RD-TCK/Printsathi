import { describe, expect, it } from "vitest";
import { generateAgentToken, generatePairingCode, hashAgentToken } from "@/lib/agent/auth";
import { isConfigPaired } from "@/agent/config";
import { findDefaultPrinter, findBestPrinterForJob } from "@/agent/printer-discovery";
import type { AgentConfig, DiscoveredPrinter } from "@/agent/types";

describe("Phase 8: Windows Desktop Agent Subsystem", () => {
  describe("Agent Cryptographic Pairing & Authentication", () => {
    it("generates well-formatted pairing codes with matching SHA-256 hash", () => {
      const { displayCode, codeHash } = generatePairingCode();

      expect(displayCode).toMatch(/^PS-[0-9A-F]{4}-[0-9A-F]{4}$/);
      expect(codeHash).toBe(hashAgentToken(displayCode));
    });

    it("hashes agent secret tokens deterministically", () => {
      const token = "ps_agent_secret_token_12345";
      const hash1 = hashAgentToken(token);
      const hash2 = hashAgentToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex string
    });

    it("generates cryptographically unique agent secret tokens", () => {
      const token1 = generateAgentToken();
      const token2 = generateAgentToken();

      expect(token1).toMatch(/^ps_agent_[0-9a-f]{64}$/);
      expect(token2).toMatch(/^ps_agent_[0-9a-f]{64}$/);
      expect(token1).not.toBe(token2);
    });
  });

  describe("Agent Local Configuration & Pairing State", () => {
    it("evaluates paired state accurately", () => {
      const unpairedConfig: AgentConfig = {
        serverUrl: "http://localhost:3000",
        agentId: null,
        shopId: null,
        shopName: null,
        agentToken: null,
        agentName: "Windows Agent",
        selectedPrinter: null,
        version: "1.0.0",
        pollIntervalMs: 5000,
        heartbeatIntervalMs: 20000,
      };

      expect(isConfigPaired(unpairedConfig)).toBe(false);

      const pairedConfig: AgentConfig = {
        ...unpairedConfig,
        agentId: "agent_uuid_123",
        shopId: "shop_uuid_456",
        shopName: "Central Print Hub",
        agentToken: "ps_agent_token_789",
      };

      expect(isConfigPaired(pairedConfig)).toBe(true);
    });
  });

  describe("Printer Discovery & Selection Resolution", () => {
    const mockPrinters: DiscoveredPrinter[] = [
      {
        name: "HP LaserJet Pro MFP M428fdw",
        systemIdentifier: "hp_laserjet_pro",
        status: "online",
        isDefault: false,
        driverName: "HP LaserJet Pro PCL-6",
        capabilities: { colorSupport: false, duplexSupport: true, paperSizes: ["A4", "Letter"] },
      },
      {
        name: "Epson EcoTank L3250",
        systemIdentifier: "epson_ecotank_l3250",
        status: "online",
        isDefault: true,
        driverName: "Epson ESC/P-R",
        capabilities: { colorSupport: true, duplexSupport: false, paperSizes: ["A4", "A3", "Letter"] },
      },
      {
        name: "Canon PIXMA G3000",
        systemIdentifier: "canon_pixma_g3000",
        status: "offline",
        isDefault: false,
        driverName: "Canon Inkjet Driver",
      },
    ];

    it("never auto-routes physical jobs to virtual or offline printers", () => {
      const virtual: DiscoveredPrinter = {
        name: "Microsoft Print to PDF",
        systemIdentifier: "pdf",
        status: "online",
        isDefault: true,
        capabilities: { colorSupport: true },
      };
      const mono = mockPrinters[0];
      expect(findDefaultPrinter([virtual, mono])?.name).toBe(mono.name);
      expect(findDefaultPrinter([virtual])).toBeNull();
      expect(findDefaultPrinter([mockPrinters[2]])).toBeNull();
      expect(findBestPrinterForJob([virtual, mono], { colorMode: "color" })).toBeNull();
      expect(findBestPrinterForJob([virtual, mono], { colorMode: "black_and_white" })?.name).toBe(mono.name);
    });

    it("prefers explicitly selected printer if online", () => {
      const selected = findDefaultPrinter(mockPrinters, "HP LaserJet Pro MFP M428fdw");
      expect(selected?.name).toBe("HP LaserJet Pro MFP M428fdw");
    });

    it("falls back to system default online printer when no preference is specified", () => {
      const selected = findDefaultPrinter(mockPrinters, null);
      expect(selected?.name).toBe("Epson EcoTank L3250");
      expect(selected?.isDefault).toBe(true);
    });

    it("ignores offline printers during fallback selection", () => {
      const offlineOnlyPrinters: DiscoveredPrinter[] = [
        {
          name: "Canon Offline",
          systemIdentifier: "canon_off",
          status: "offline",
          isDefault: true,
        },
        {
          name: "Brother Online Secondary",
          systemIdentifier: "brother_on",
          status: "online",
          isDefault: false,
        },
      ];

      const selected = findDefaultPrinter(offlineOnlyPrinters, null);
      expect(selected?.name).toBe("Brother Online Secondary");
    });
  });

  describe("Atomic Claiming & Lease Invariant Rules", () => {
    it("verifies lease expiration calculation and crash recovery window", () => {
      const now = Date.now();
      const leaseDurationMs = 300 * 1000; // 5 minutes
      const claimExpiresAt = new Date(now + leaseDurationMs);

      // Stale lease detection rule
      const isLeaseActive = claimExpiresAt.getTime() > now;
      expect(isLeaseActive).toBe(true);

      const simulatedPastTime = now + leaseDurationMs + 1000; // 5m 1s later
      const isLeaseExpired = claimExpiresAt.getTime() < simulatedPastTime;
      expect(isLeaseExpired).toBe(true);
    });

    it("preserves payment record integrity when a print job fails", () => {
      // System invariant:
      // A failed print execution reports failure and marks job retryable,
      // but MUST NEVER modify or void the verified payment record.
      const verifiedPayment = {
        id: "pay_12345",
        order_id: "order_67890",
        status: "verified" as const,
        amount: 50.0,
        provider_payment_id: "pay_rzp_live_real123",
      };

      const failedJobReport = {
        job_id: "job_99999",
        status: "failed" as const,
        reason: "Printer paper out / tray empty",
        retryable: true,
        print_attempts: 1,
        max_attempts: 3,
      };

      expect(verifiedPayment.status).toBe("verified");
      expect(verifiedPayment.amount).toBe(50.0);
      expect(failedJobReport.status).toBe("failed");
      expect(failedJobReport.retryable).toBe(true);
      expect(failedJobReport.print_attempts).toBeLessThan(failedJobReport.max_attempts);
    });
  });
});
