import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import type { AgentConfig, AgentStatusSnapshot, ClaimedJob, DiscoveredPrinter } from "./types";
import { clearConfig, isConfigPaired, loadConfig, saveConfig } from "./config";
import { AgentApiClient } from "./client";
import { discoverWindowsPrinters, findBestPrinterForJob, findDefaultPrinter } from "./printer-discovery";
import { prepareAndPrintDocument } from "./print-executor";
import { logger } from "./logger";

export class AgentDaemon {
  private instanceLock: net.Server | null = null;
  private config: AgentConfig;
  private client: AgentApiClient;
  private isRunning: boolean = false;
  private isProcessingJob: boolean = false;
  private currentJob: ClaimedJob | null = null;
  private discoveredPrinters: DiscoveredPrinter[] = [];
  private lastHeartbeatTime: string | null = null;
  private isConnected: boolean = false;

  // Multi-printer tracking and duplex reservation maps
  private activePrintingPrinters: Set<string> = new Set();
  private reservedDuplexPrinters: Map<string, { orderId: string; jobId: string; printerName: string; reservedAt: number }> = new Map();
  private orderToReservedPrinter: Map<string, string> = new Map();

  private discoveryTimer: NodeJS.Timeout | null = null;
  private discovering = false;
  private heartbeatBusy = false;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  private stats = {
    jobsProcessed: 0,
    jobsSubmitted: 0,
    jobsFailed: 0,
    totalPagesSubmitted: 0,
  };

  constructor() {
    this.config = loadConfig();
    this.client = new AgentApiClient(this.config.serverUrl, this.config.agentToken);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    await new Promise<void>((resolve, reject) => {
      const server = net.createServer(socket => socket.end());
      server.once("error", () => reject(new Error("Another Printiva agent is already running. Close it before starting this agent.")));
      server.listen(4320, "127.0.0.1", () => { this.instanceLock = server; resolve(); });
    });
    this.isRunning = true;
    logger.info(`Starting Printiva Windows Desktop Agent v${this.config.version}...`);

    // Initial printer discovery
    try {
      this.discoveredPrinters = await discoverWindowsPrinters();
    } catch (err) {
      logger.warn("Initial printer discovery failed:", { err });
    }

    this.discoveryTimer = setInterval(() => { void this.refreshPrinters(); }, 5000);
    // Start background intervals
    this.startHeartbeatLoop();
    this.startJobPollingLoop();
  }

  stop(): void {
    this.isRunning = false;
    this.instanceLock?.close();
    this.instanceLock = null;
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    logger.info("Printiva Windows Desktop Agent stopped.");
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

    logger.info("Attempting to pair agent...");
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

  async login(
    email: string,
    password: string,
    customAgentName?: string,
  ): Promise<{ success: boolean; shopName: string }> {
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
    this.activePrintingPrinters.clear();
    this.reservedDuplexPrinters.clear();
    this.orderToReservedPrinter.clear();
  }

  setServerUrl(value: string): void {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error("Enter the website address, for example http://localhost:3000.");
    const serverUrl = url.href.replace(/\/+$/, "");
    if (serverUrl === this.config.serverUrl) return;
    this.config = saveConfig({ serverUrl });
    this.client.setServerUrl(serverUrl);
    this.isConnected = false;
    logger.info(`Agent server URL changed to: ${serverUrl}`);
  }

  selectPrinter(printerName: string): void {
    this.config = saveConfig({ selectedPrinter: printerName });
    logger.info(`Selected default printer: "${printerName}"`);
  }

  private async refreshPrinters(): Promise<void> {
    if (this.discovering) return;
    this.discovering = true;
    try { this.discoveredPrinters = await discoverWindowsPrinters(); }
    catch { this.discoveredPrinters = []; }
    finally { this.discovering = false; }
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
    if (this.heartbeatBusy) return;
    this.heartbeatBusy = true;
    try {
      await this.refreshPrinters();

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
    } finally { this.heartbeatBusy = false; }
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
      await this.refreshPrinters();
      if (!findDefaultPrinter(this.discoveredPrinters, this.config.selectedPrinter)) return;
      const job = await this.client.claimNextJob(300); // 5 minute lease
      if (!job) {
        return;
      }

      this.currentJob = job;
      this.stats.jobsProcessed += 1;
      logger.info(`Atomically claimed Job #${job.id.slice(0, 8)} (Order #${job.orderId.slice(0, 8)}, Step: ${job.duplexStep || "standard"})`);

      // Determine configurations
      const configs = job.pagesConfig.length
        ? job.pagesConfig
        : [{ startPage: 1, endPage: job.document.pageCount, colorMode: "black_and_white" as const, paperSize: "a4" as const }];

      // Separate changes of paper size or color mode
      const groups: ClaimedJob["pagesConfig"][] = [];
      for (const range of configs) {
        const previous = groups[groups.length - 1];
        if (previous && previous[0].colorMode === range.colorMode && previous[0].paperSize === range.paperSize) previous.push(range);
        else groups.push([range]);
      }

      // Check if this is Step 2 of a duplex job (Print Next Side)
      const isDuplexEvenStep = job.duplexStep === "even";
      const reservedPrinterForJob = this.orderToReservedPrinter.get(job.orderId) || this.orderToReservedPrinter.get(job.id);

      // Build busy printers set (all active printing printers + all reserved duplex printers)
      const busyPrinters = new Set([
        ...this.activePrintingPrinters,
        ...this.reservedDuplexPrinters.keys(),
      ]);

      // If this is Step 2 (even pages) for a reserved printer, allow using that reserved printer
      if (isDuplexEvenStep && reservedPrinterForJob) {
        busyPrinters.delete(reservedPrinterForJob.toLowerCase());
      }

      const plan = groups.map(ranges => {
        const printer = findBestPrinterForJob(this.discoveredPrinters, {
          colorMode: ranges[0].colorMode,
          paperSize: ranges[0].paperSize,
          preferredName: this.config.selectedPrinter || job.defaultPrinter,
          requiredPrinterName: isDuplexEvenStep ? reservedPrinterForJob : null,
          busyPrinters,
        });
        return { ranges, printer };
      });

      if (plan.some(part => !part.printer)) {
        const requiredMode = groups[0]?.[0]?.colorMode || "requested";
        const reason = isDuplexEvenStep
          ? `Reserved printer "${reservedPrinterForJob}" is currently offline or busy. Order will remain on hold for this printer.`
          : `No free compatible ${requiredMode === "color" ? "Color" : "Black & White"} printer is available (printers busy/reserved). Request stays on hold.`;
        logger.warn(`Job #${job.id.slice(0, 8)} held: ${reason}`);
        await this.client.reportFailure(job.id, reason, true);
        this.stats.jobsFailed += 1;
        this.currentJob = null;
        return;
      }

      // Mark the selected printer(s) as actively printing
      for (const part of plan) {
        if (part.printer) {
          this.activePrintingPrinters.add(part.printer.name.toLowerCase());
        }
      }

      // Download document
      const tempDir = path.join(os.tmpdir(), "printsaathi_downloads");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFilePath = path.join(tempDir, `doc_${job.document.id}_${Date.now()}.pdf`);

      let submissionStarted = false;
      try {
        logger.info(`Downloading document "${job.document.originalFilename}" (${job.document.pageCount} pages)...`);
        await this.client.downloadDocument(job.document.id, job.id, tempFilePath);

        // Persist the no-retry boundary BEFORE invoking the renderer
        submissionStarted = true;
        await this.client.reportSubmit(job.id);

        let pagesSubmitted = 0;
        for (const part of plan) {
          const printerName = part.printer!.name;
          logger.info(`Submitting to printer "${printerName}" for Job #${job.id.slice(0, 8)} (${job.duplexStep || "full"})...`);
          const result = await prepareAndPrintDocument(tempFilePath, job, printerName, part.ranges);
          if (!result.success) throw new Error(result.errorMessage || "Windows print submission failed. Check for partial output before retrying.");
          pagesSubmitted += result.pagesSubmitted;

          // Duplex State Management:
          if (job.duplexStep === "odd") {
            // Phase 1 (Odd Pages) completed -> Reserve this exact printer for Phase 2 (Even Pages)
            const printerKey = printerName.toLowerCase();
            this.reservedDuplexPrinters.set(printerKey, {
              orderId: job.orderId,
              jobId: job.id,
              printerName,
              reservedAt: Date.now(),
            });
            this.orderToReservedPrinter.set(job.orderId, printerKey);
            this.orderToReservedPrinter.set(job.id, printerKey);
            logger.info(`🖨️ Printer "${printerName}" is now RESERVED for Order #${job.orderId.slice(0, 8)} until "Print Next Side" is clicked.`);
          } else if (job.duplexStep === "even") {
            // Phase 2 (Even Pages) completed -> Release this printer reservation
            const printerKey = printerName.toLowerCase();
            this.reservedDuplexPrinters.delete(printerKey);
            this.orderToReservedPrinter.delete(job.orderId);
            this.orderToReservedPrinter.delete(job.id);
            logger.info(`✅ Order #${job.orderId.slice(0, 8)} duplex printing completed. Printer "${printerName}" is now RELEASED for other jobs.`);
          }
        }

        this.stats.jobsSubmitted += 1;
        this.stats.totalPagesSubmitted += pagesSubmitted;
        logger.info(`Job #${job.id.slice(0, 8)} successfully submitted.`);
      } catch (printErr) {
        const errorMsg = printErr instanceof Error ? printErr.message : "Print execution error";
        logger.error(`Print execution failed for Job #${job.id.slice(0, 8)}: ${errorMsg}`);
        await this.client.reportFailure(job.id, errorMsg.slice(0, 500), !submissionStarted);
        this.stats.jobsFailed += 1;
      } finally {
        // Unmark active printing status
        for (const part of plan) {
          if (part.printer) {
            this.activePrintingPrinters.delete(part.printer.name.toLowerCase());
          }
        }

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

  async triggerPoll(): Promise<void> {
    if (!this.isRunning || !isConfigPaired(this.config) || !this.isConnected || this.isProcessingJob) return;
    await this.pollAndProcessNextJob();
  }

  async getCounterQueue() {
    return await this.client.getCounterQueue();
  }

  async approveCounterOrder(orderId: string) {
    const result = await this.client.approveCounterOrder(orderId);
    // Immediately claim and print the newly approved job via agent
    void this.triggerPoll();
    return result;
  }

  async cancelCounterOrder(orderId: string) {
    const reservedName = this.orderToReservedPrinter.get(orderId);
    if (reservedName) {
      this.reservedDuplexPrinters.delete(reservedName);
      this.orderToReservedPrinter.delete(orderId);
    }
    return await this.client.cancelCounterOrder(orderId);
  }
}

export const agentDaemon = new AgentDaemon();
