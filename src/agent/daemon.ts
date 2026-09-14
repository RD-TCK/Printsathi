import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AgentConfig, AgentStatusSnapshot, ClaimedJob, DiscoveredPrinter } from "./types";
import { clearConfig, isConfigPaired, loadConfig, saveConfig } from "./config";
import { AgentApiClient } from "./client";
import { discoverWindowsPrinters, findBestPrinterForJob, findDefaultPrinter } from "./printer-discovery";
import { prepareAndPrintDocument } from "./print-executor";
import { logger } from "./logger";

export class AgentDaemon {
  private config: AgentConfig;
  private client: AgentApiClient;
  private isRunning: boolean = false;
  private isProcessingJob: boolean = false;
  private currentJob: ClaimedJob | null = null;
  private discoveredPrinters: DiscoveredPrinter[] = [];
  private lastHeartbeatTime: string | null = null;
  private isConnected: boolean = false;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  private stats = {
    jobsProcessed: 0,
    jobsCompleted: 0,
    jobsFailed: 0,
    totalPagesPrinted: 0,
  };

  constructor() {
    this.config = loadConfig();
    this.client = new AgentApiClient(this.config.serverUrl, this.config.agentToken);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`Starting PrintSathi Windows Desktop Agent v${this.config.version}...`);

    // Initial printer discovery
    try {
      this.discoveredPrinters = await discoverWindowsPrinters();
    } catch (err) {
      logger.warn("Initial printer discovery failed:", { err });
    }

    // Start background intervals
    this.startHeartbeatLoop();
    this.startJobPollingLoop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    logger.info("PrintSathi Windows Desktop Agent stopped.");
  }

  async pair(pairingCode: string, customAgentName?: string): Promise<{ success: boolean; shopName: string }> {
    const agentName = customAgentName || this.config.agentName;
    const machineInfo = {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      totalMemoryGb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    };

    logger.info(`Attempting to pair with code ${pairingCode.toUpperCase()}...`);
    const result = await this.client.pairWithCode({
      pairingCode: pairingCode.trim().toUpperCase(),
      agentName,
      version: this.config.version,
      machineInfo,
    });

    this.config = saveConfig({
      agentId: result.agentId,
      shopId: result.shopId,
      shopName: result.shopName,
      agentToken: result.agentToken,
      agentName,
    });

    this.client.setToken(result.agentToken);
    this.isConnected = true;

    logger.info(`Successfully paired with shop: "${result.shopName}" (Shop ID: ${result.shopId})`);

    // Trigger immediate heartbeat
    await this.sendHeartbeat();

    return { success: true, shopName: result.shopName };
  }

  async login(email: string, password: string, customAgentName?: string): Promise<{ success: boolean; shopName: string }> {
    const agentName = customAgentName || this.config.agentName;
    const machineInfo = {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      totalMemoryGb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    };

    logger.info(`Attempting direct agent login for ${email}...`);
    const result = await this.client.loginWithCredentials({
      email,
      password,
      agentName,
      version: this.config.version,
      machineInfo,
    });

    this.config = saveConfig({
      agentId: result.agentId,
      shopId: result.shopId,
      shopName: result.shopName,
      agentToken: result.agentToken,
      agentName,
    });

    this.client.setToken(result.agentToken);
    this.isConnected = true;

    logger.info(`Successfully logged in and linked to shop: "${result.shopName}" (Shop ID: ${result.shopId})`);

    // Trigger immediate printer discovery and heartbeat
    try {
      this.discoveredPrinters = await discoverWindowsPrinters();
      await this.sendHeartbeat();
    } catch (err) {
      logger.warn("Post-login heartbeat error:", { err });
    }

    return { success: true, shopName: result.shopName };
  }

  unpair(): void {
    logger.info("Unpairing agent and clearing local credentials.");
    this.config = clearConfig();
    this.client.setToken(null);
    this.isConnected = false;
    this.currentJob = null;
  }

  selectPrinter(printerName: string): void {
    this.config = saveConfig({ selectedPrinter: printerName });
    logger.info(`Selected default printer: "${printerName}"`);
  }

  private startHeartbeatLoop(): void {
    const runHeartbeat = async () => {
      if (!this.isRunning || !isConfigPaired(this.config)) return;
      await this.sendHeartbeat();
    };

    runHeartbeat();
    this.heartbeatTimer = setInterval(runHeartbeat, this.config.heartbeatIntervalMs);
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      this.discoveredPrinters = await discoverWindowsPrinters();

      const machineInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        uptimeSec: os.uptime(),
      };

      const result = await this.client.sendHeartbeat({
        printers: this.discoveredPrinters,
        currentJobId: this.currentJob?.id || null,
        version: this.config.version,
        machineInfo,
      });

      this.lastHeartbeatTime = result.timestamp;
      this.isConnected = true;
      logger.debug("Heartbeat acknowledged by server.", { timestamp: result.timestamp });
    } catch (error) {
      if (error instanceof Error && error.message === "AGENT_UNAUTHORIZED_OR_REVOKED") {
        logger.error("Agent token has been revoked by shop or server. Clearing pairing state.");
        this.unpair();
      } else {
        this.isConnected = false;
        logger.warn("Heartbeat failed to reach server:", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private startJobPollingLoop(): void {
    const runPoll = async () => {
      if (!this.isRunning || !isConfigPaired(this.config) || !this.isConnected || this.isProcessingJob) return;
      await this.pollAndProcessNextJob();
    };

    this.pollTimer = setInterval(runPoll, this.config.pollIntervalMs);
  }

  private async pollAndProcessNextJob(): Promise<void> {
    this.isProcessingJob = true;
    try {
      const job = await this.client.claimNextJob(300); // 5 minute lease
      if (!job) {
        return;
      }

      this.currentJob = job;
      this.stats.jobsProcessed += 1;
      logger.info(`Atomically claimed Job #${job.id.slice(0, 8)} (Order #${job.orderId.slice(0, 8)})`);

      // Determine target printer
      const targetPrinter = findDefaultPrinter(
        this.discoveredPrinters,
        this.config.selectedPrinter || job.defaultPrinter,
      );

      if (!targetPrinter) {
        logger.error(`No online printer available for Job #${job.id.slice(0, 8)}`);
        await this.client.reportFailure(job.id, "No online printer available on Windows Agent", true);
        this.stats.jobsFailed += 1;
        this.currentJob = null;
        return;
      }

      // Download document
      const tempDir = path.join(os.tmpdir(), "printsaathi_downloads");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFilePath = path.join(tempDir, `doc_${job.document.id}_${Date.now()}.pdf`);

      try {
        logger.info(`Downloading document "${job.document.originalFilename}" (${job.document.pageCount} pages)...`);
        await this.client.downloadDocument(job.document.id, job.id, tempFilePath);

        // Partition pages by color mode for multi-printer automatic switching
        const pagesConfig = job.pagesConfig || [];
        const colorPages = pagesConfig.filter((p) => p.colorMode === "color");
        const bwPages = pagesConfig.filter((p) => p.colorMode === "black_and_white");

        const hasMixedModes = colorPages.length > 0 && bwPages.length > 0;

        if (hasMixedModes) {
          logger.info(
            `Mixed job detected: ${colorPages.length} color range(s), ${bwPages.length} B&W range(s). Auto-switching between printers...`,
          );

          const colorPrinter = findBestPrinterForJob(this.discoveredPrinters, {
            colorMode: "color",
            preferredName: this.config.selectedPrinter,
          });
          const bwPrinter = findBestPrinterForJob(this.discoveredPrinters, {
            colorMode: "black_and_white",
            preferredName: this.config.selectedPrinter,
          });

          if (!colorPrinter && !bwPrinter) {
            throw new Error("No online printer available on Windows Agent");
          }

          // Execute color pages on color printer (or fallback to bw printer if user only has one)
          const targetColorPrinter = colorPrinter || bwPrinter!;
          logger.info(`Routing ${colorPages.length} color range(s) to "${targetColorPrinter.name}"`);
          const colorResult = await prepareAndPrintDocument(tempFilePath, job, targetColorPrinter.name, colorPages);
          if (!colorResult.success) {
            throw new Error(colorResult.errorMessage || `Failed printing color pages on ${targetColorPrinter.name}`);
          }

          // Execute B&W pages on B&W printer (or fallback)
          const targetBwPrinter = bwPrinter || colorPrinter!;
          logger.info(`Routing ${bwPages.length} B&W range(s) to "${targetBwPrinter.name}"`);
          const bwResult = await prepareAndPrintDocument(tempFilePath, job, targetBwPrinter.name, bwPages);
          if (!bwResult.success) {
            throw new Error(bwResult.errorMessage || `Failed printing B&W pages on ${targetBwPrinter.name}`);
          }

          logger.info(
            `Windows Print Spooler accepted both parts of Job #${job.id.slice(0, 8)}; recording submission...`,
          );
          await this.client.reportSubmit(job.id);
          this.stats.jobsCompleted += 1;
          this.stats.totalPagesPrinted += job.totalPages;
          await this.client.reportComplete(job.id);
        } else {
          // Single mode job (either all Color, all B&W, or unspecified)
          const isColorJob = colorPages.length > 0;
          const targetPrinter =
            findBestPrinterForJob(this.discoveredPrinters, {
              colorMode: isColorJob ? "color" : "black_and_white",
              preferredName: this.config.selectedPrinter || job.defaultPrinter,
            }) || findDefaultPrinter(this.discoveredPrinters, this.config.selectedPrinter || job.defaultPrinter);

          if (!targetPrinter) {
            logger.error(`No online printer available for Job #${job.id.slice(0, 8)}`);
            await this.client.reportFailure(job.id, "No online printer available on Windows Agent", true);
            this.stats.jobsFailed += 1;
            this.currentJob = null;
            return;
          }

          logger.info(`Auto-selected "${targetPrinter.name}" (Color mode: ${isColorJob ? "Color" : "B&W"})`);
          const printResult = await prepareAndPrintDocument(tempFilePath, job, targetPrinter.name);

          if (printResult.success) {
            logger.info(`Windows Print Spooler accepted Job #${job.id.slice(0, 8)}; recording submission...`);
            await this.client.reportSubmit(job.id);
            this.stats.jobsCompleted += 1;
            this.stats.totalPagesPrinted += job.totalPages;
            logger.info(`Job #${job.id.slice(0, 8)} completed (submitted to printer).`);
            await this.client.reportComplete(job.id);
          } else {
            logger.error(`Print execution failed for Job #${job.id.slice(0, 8)}: ${printResult.errorMessage}`);
            await this.client.reportFailure(
              job.id,
              printResult.errorMessage || "Windows print submission failed",
              true,
            );
            this.stats.jobsFailed += 1;
          }
        }
      } catch (printErr) {
        const errorMsg = printErr instanceof Error ? printErr.message : "Print execution error";
        logger.error(`Print execution failed for Job #${job.id.slice(0, 8)}: ${errorMsg}`);
        await this.client.reportFailure(job.id, errorMsg, true);
        this.stats.jobsFailed += 1;
      } finally {
        // Clean up download file
        if (fs.existsSync(tempFilePath)) {
          try {
            fs.unlinkSync(tempFilePath);
          } catch {
            // Ignore cleanup failure
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === "AGENT_UNAUTHORIZED_OR_REVOKED") {
        this.unpair();
      } else {
        logger.error("Error during job processing cycle:", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      this.currentJob = null;
      this.isProcessingJob = false;
    }
  }

  getStatus(): AgentStatusSnapshot {
    return {
      agentName: this.config.agentName,
      agentId: this.config.agentId,
      shopId: this.config.shopId,
      shopName: this.config.shopName,
      serverUrl: this.config.serverUrl,
      isPaired: isConfigPaired(this.config),
      isConnected: this.isConnected,
      lastHeartbeat: this.lastHeartbeatTime,
      version: this.config.version,
      printers: this.discoveredPrinters,
      selectedPrinter: this.config.selectedPrinter,
      currentJob: this.currentJob,
      stats: { ...this.stats },
      recentLogs: logger.getRecentLogs(),
    };
  }
}

export const agentDaemon = new AgentDaemon();
