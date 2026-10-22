import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import type { AgentConfig, AgentStatusSnapshot, ClaimedJob, DiscoveredPrinter } from "./types";
import { clearConfig, isConfigPaired, loadConfig, saveConfig, getDocumentCacheDirectory, cleanDocumentCache } from "./config";
import { AgentApiClient } from "./client";
import { discoverWindowsPrinters, findBestPrinterForJob, findDefaultPrinter, isPhysicalPrinter } from "./printer-discovery";
import { prepareAndPrintBatch, prepareAndPrintDocument, waitForPhysicalPrintCompletion } from "./print-executor";
import { logger } from "./logger";
import { whatsAppAgent } from "./whatsapp";
import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

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
  private supabaseClient: SupabaseClient | null = null;
  private jobsChannel: RealtimeChannel | null = null;

  // Multi-printer tracking and duplex reservation maps
  private activePrintingPrinters: Set<string> = new Set();
  private reservedDuplexPrinters: Map<
    string,
    { orderId: string; jobId: string; printerName: string; reservedAt: number }
  > = new Map();
  private orderToReservedPrinter: Map<string, string> = new Map();

  private discoveryTimer: NodeJS.Timeout | null = null;
  private discovering = false;
  private heartbeatBusy = false;
  private lastSentPrintersSignature: string | null = null;
  private processedJobIds: Set<string> = new Set();

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pollTimeout: NodeJS.Timeout | null = null;
  private isRealtimeConnected: boolean = false;
  private isSubscribingRealtime: boolean = false;
  private idlePollCount: number = 0;
  private hasPendingWakeup: boolean = false;
  private isPollRunning: boolean = false;
  private lastPollTimestamp: number = 0;

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
      const server = net.createServer((socket) => socket.end());
      server.once("error", () =>
        reject(new Error("Another Printiva agent is already running. Close it before starting this agent.")),
      );
      server.listen(4320, "127.0.0.1", () => {
        this.instanceLock = server;
        resolve();
      });
    });
    this.isRunning = true;
    logger.info(`Starting Printiva Windows Desktop Agent v${this.config.version}...`);

    // Initial printer discovery
    try {
      this.discoveredPrinters = await discoverWindowsPrinters();
    } catch (err) {
      logger.warn("Initial printer discovery failed:", { err });
    }

    cleanDocumentCache();

    this.discoveryTimer = setInterval(async () => {
      if (this.discovering) return;
      cleanDocumentCache();

      await this.refreshPrinters();
      const currentSignature = JSON.stringify(
        this.discoveredPrinters.map((p) => ({
          name: p.name,
          status: p.status,
          isDefault: p.isDefault,
          driver: p.driverName,
        })),
      );

      if (this.lastSentPrintersSignature && this.lastSentPrintersSignature !== currentSignature && this.isConnected) {
        logger.info("Printer state change detected locally. Triggering immediate heartbeat.");
        void this.sendHeartbeat();
      }
    }, 30000);
    // Start background intervals
    this.startHeartbeatLoop();
    this.startJobPollingLoop();

    // Auto-resume WhatsApp connector if existing session saved
    void whatsAppAgent.start(true);
  }

  stop(): void {
    this.isRunning = false;
    this.instanceLock?.close();
    this.instanceLock = null;
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    this.isRealtimeConnected = false;
    if (this.jobsChannel && this.supabaseClient) {
      void this.supabaseClient.removeChannel(this.jobsChannel);
      this.jobsChannel = null;
    }
    whatsAppAgent.stop();
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

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    this.isRealtimeConnected = false;

    if (this.jobsChannel && this.supabaseClient) {
      void this.supabaseClient.removeChannel(this.jobsChannel);
      this.jobsChannel = null;
    }
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

  private lastPrinterDiscoveryTime = 0;

  private async refreshPrinters(force = false): Promise<void> {
    if (this.discovering) return;
    const now = Date.now();
    if (!force && now - this.lastPrinterDiscoveryTime < 15000 && this.discoveredPrinters.length > 0) {
      return;
    }
    this.discovering = true;
    try {
      this.discoveredPrinters = await discoverWindowsPrinters();
      this.lastPrinterDiscoveryTime = Date.now();

      // Zero-Touch Auto-Selection: If no printer is selected, or if the currently selected printer is offline,
      // automatically select the connected online physical printer so the user never has to configure it manually.
      const physicalPrinters = this.discoveredPrinters.filter(isPhysicalPrinter);
      const onlinePhysical = physicalPrinters.filter((p) => p.status === "online" || p.status === "printing");
      const currentSelected = this.config.selectedPrinter;
      const isCurrentOnline =
        currentSelected && onlinePhysical.some((p) => p.name.toLowerCase() === currentSelected.toLowerCase());

      if (!isCurrentOnline && onlinePhysical.length > 0) {
        const bestOnline = onlinePhysical.find((p) => p.isDefault) || onlinePhysical[0];
        if (bestOnline && bestOnline.name !== this.config?.selectedPrinter) {
          logger.info(`⚡ Zero-Touch: Automatically active on connected online printer "${bestOnline.name}".`);
          this.config = { ...this.config, selectedPrinter: bestOnline.name };
          try {
            saveConfig({ selectedPrinter: bestOnline.name });
          } catch {
            // non-fatal
          }
        }
      }
    } catch {
      this.discoveredPrinters = [];
    } finally {
      this.discovering = false;
    }
  }

  private startHeartbeatLoop(): void {
    const runHeartbeat = async () => {
      if (!this.isRunning || !isConfigPaired(this.config)) return;
      await this.sendHeartbeat();
      this.scheduleNextHeartbeat();
    };

    void runHeartbeat();
  }

  private scheduleNextHeartbeat(): void {
    if (!this.isRunning) return;
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    const baseInterval = this.config.heartbeatIntervalMs || 45000;
    const jitter = (Math.random() - 0.5) * 10000; // ±5s jitter
    const delay = Math.max(20000, baseInterval + jitter);
    this.heartbeatTimer = setTimeout(async () => {
      if (this.isRunning && isConfigPaired(this.config)) {
        await this.sendHeartbeat();
      }
      this.scheduleNextHeartbeat();
    }, delay);
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

      const currentSignature = JSON.stringify(
        this.discoveredPrinters.map((p) => ({
          name: p.name,
          status: p.status,
          isDefault: p.isDefault,
          driver: p.driverName,
        })),
      );

      // Only send full printer inventory when changed or on initial pulse
      const printersToSend =
        this.lastSentPrintersSignature !== currentSignature ? this.discoveredPrinters : undefined;

      const result = await this.client.sendHeartbeat({
        printers: printersToSend,
        currentJobId: this.currentJob?.id || null,
        version: this.config.version,
        machineInfo,
      });

      this.lastSentPrintersSignature = currentSignature;
      this.lastHeartbeatTime = result.timestamp;
      this.isConnected = true;
      logger.debug("Heartbeat acknowledged by server.", { timestamp: result.timestamp });

      if (!this.pollTimeout && !this.isProcessingJob && !this.isPollRunning) {
        this.scheduleNextPoll(0);
      }

      if (!this.supabaseClient || !this.isRealtimeConnected || !this.jobsChannel) {
        void this.setupRealtimeSubscription();
      }
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
    } finally {
      this.heartbeatBusy = false;
    }
  }

  private async setupRealtimeSubscription() {
    if (!this.isRunning || !isConfigPaired(this.config) || this.isSubscribingRealtime) return;
    this.isSubscribingRealtime = true;

    try {
      if (!this.supabaseClient) {
        const { supabaseUrl, supabaseAnonKey } = await this.client.getRealtimeConfig();
        const cleanUrl = (supabaseUrl || "").trim();
        const cleanKey = (supabaseAnonKey || "").trim();
        if (!cleanUrl || !cleanKey) {
          logger.warn("Supabase Realtime not configured on server.");
          return;
        }
        this.supabaseClient = createClient(cleanUrl, cleanKey);
      }

      if (this.jobsChannel) {
        await this.supabaseClient.removeChannel(this.jobsChannel);
        this.jobsChannel = null;
      }

      logger.info(`Subscribing to realtime job events for shop ${this.config.shopId}`);
      this.jobsChannel = this.supabaseClient.channel(`jobs-${this.config.shopId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'print_jobs', filter: `shop_id=eq.${this.config.shopId}` },
          () => {
            logger.info("⚡ Realtime event: new print job created. Waking up agent immediately...");
            void this.triggerPoll();
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'print_jobs', filter: `shop_id=eq.${this.config.shopId}` },
          (payload) => {
            const status = payload.new ? (payload.new as { status?: string }).status : undefined;
            if (!status || status === 'queued' || status === 'paid') {
              logger.info(`⚡ Realtime event: print job status updated${status ? ` to "${status}"` : ""}. Waking up agent immediately...`);
              void this.triggerPoll();
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.isRealtimeConnected = true;
            logger.info("Supabase Realtime subscription active for print jobs. Adaptive polling sleeping (fallback: 20s).");
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            this.isRealtimeConnected = false;
            logger.warn(`Supabase Realtime subscription status: ${status}. Active polling safety net engaged.`);
            void this.triggerPoll();
          }
        });

    } catch (err) {
      this.isRealtimeConnected = false;
      logger.error("Failed to setup realtime subscription:", { error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.isSubscribingRealtime = false;
    }
  }

  private getNextPollDelay(): number {
    if (this.isProcessingJob || this.hasPendingWakeup) {
      return 1000;
    }
    if (this.idlePollCount === 0) {
      return 1000;
    }
    if (this.isRealtimeConnected) {
      // Realtime is connected and active:
      // WebSocket pushes immediately upon any new job.
      // Fast fallback poll safety net (max 8s).
      if (this.idlePollCount === 1) return 2000;
      if (this.idlePollCount === 2) return 4000;
      return 8000;
    } else {
      // Realtime is offline / degraded network / polling mode:
      if (this.idlePollCount === 1) return 1500;
      if (this.idlePollCount === 2) return 2500;
      return 3500;
    }
  }

  private scheduleNextPoll(overrideDelayMs?: number): void {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    if (!this.isRunning || !isConfigPaired(this.config)) return;

    const delay = overrideDelayMs !== undefined ? overrideDelayMs : this.getNextPollDelay();
    this.pollTimeout = setTimeout(() => {
      void this.runAdaptivePollCycle();
    }, delay);
  }

  private startJobPollingLoop(): void {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    this.idlePollCount = 0;
    this.scheduleNextPoll(0);
  }

  private async runAdaptivePollCycle(): Promise<void> {
    if (!this.isRunning || !isConfigPaired(this.config)) return;
    if (this.isProcessingJob || this.isPollRunning) {
      this.hasPendingWakeup = true;
      return;
    }

    const now = Date.now();
    if (this.lastPollTimestamp && now - this.lastPollTimestamp > 40000) {
      logger.info("System wake-from-sleep or network gap detected. Re-syncing printers and checking queue...");
      void this.refreshPrinters();
      if (!this.isRealtimeConnected) {
        void this.setupRealtimeSubscription();
      }
    }
    this.lastPollTimestamp = now;

    this.isPollRunning = true;
    let didProcessJob = false;

    try {
      if (this.isConnected) {
        didProcessJob = await this.pollAndProcessNextJob();
      }
    } catch (err) {
      logger.warn("Error during adaptive poll cycle:", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.isPollRunning = false;
      if (didProcessJob) {
        this.idlePollCount = 0;
      } else {
        this.idlePollCount++;
      }

      if (this.hasPendingWakeup) {
        this.hasPendingWakeup = false;
        this.scheduleNextPoll(0);
      } else {
        this.scheduleNextPoll();
      }
    }
  }

  private async resolveJobDocumentPath(job: ClaimedJob): Promise<{ filePath: string; isLocalCacheHit: boolean }> {
    let printFilePath = "";
    let isLocalCacheHit = false;

    try {
      const localCacheDir = typeof getDocumentCacheDirectory === "function" ? getDocumentCacheDirectory() : "";
      if (localCacheDir) {
        const rawId = (job.document.storagePath || "")
          .replace(/^local:\/\//, "")
          .replace(/\.pdf$/i, "")
          .replace(/^doc_/, "");
        const candidateNames = [
          `doc_${job.document.id}.pdf`,
          `${job.document.id}.pdf`,
          rawId ? `doc_${rawId}.pdf` : "",
          rawId ? `${rawId}.pdf` : "",
        ].filter(Boolean);

        for (const cand of candidateNames) {
          const candPath = path.join(localCacheDir, cand);
          if (fs.existsSync(candPath) && fs.statSync(candPath).size > 0) {
            printFilePath = candPath;
            isLocalCacheHit = true;
            break;
          }
        }
      }
    } catch {
      isLocalCacheHit = false;
    }

    if (!isLocalCacheHit) {
      const tempDir = path.join(os.tmpdir(), "printsaathi_downloads");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      printFilePath = path.join(tempDir, `doc_${job.document.id}_${Date.now()}.pdf`);
      logger.info(`Downloading document "${job.document.originalFilename}" (${job.document.pageCount} pages)...`);
      await this.client.downloadDocument(job.document.id, job.id, printFilePath);
    } else {
      logger.info(
        `⚡ Instant Local Hit: Using cached document for "${job.document.originalFilename}" (${job.document.pageCount} pages, 0s download).`,
      );
    }

    return { filePath: printFilePath, isLocalCacheHit };
  }

  private async pollAndProcessNextJob(): Promise<boolean> {
    this.isProcessingJob = true;
    try {
      if (this.discoveredPrinters.length === 0) {
        await this.refreshPrinters();
      }
      const defaultPrinter = findDefaultPrinter(this.discoveredPrinters, this.config.selectedPrinter, false);
      if (!defaultPrinter || defaultPrinter.status === "offline") {
        return false;
      }
      const job = await this.client.claimNextJob(45); // 45 second fast-recovery lease
      if (!job) {
        return false;
      }

      const jobKey = `${job.id}:${job.duplexStep || "standard"}`;
      const batchJobs: ClaimedJob[] = [job, ...(job.siblingJobs || [])];
      for (const j of batchJobs) {
        const jKey = `${j.id}:${j.duplexStep || "standard"}`;
        this.processedJobIds.add(jKey);
        if (j.orderId) {
          this.processedJobIds.add(`${j.orderId}:${j.id}:${j.duplexStep || "standard"}`);
        }
      }
      if (this.processedJobIds.size > 500) {
        const firstKey = this.processedJobIds.values().next().value;
        if (firstKey) this.processedJobIds.delete(firstKey);
      }

      this.currentJob = job;
      this.stats.jobsProcessed += batchJobs.length;
      logger.info(
        `Atomically claimed Job #${job.id.slice(0, 8)} (Order #${job.orderId.slice(0, 8)}, Step: ${job.duplexStep || "standard"}, Batch: ${batchJobs.length} doc(s))`,
      );

      // Determine configurations
      const configs = job.pagesConfig.length
        ? job.pagesConfig
        : [
          {
            startPage: 1,
            endPage: job.document.pageCount,
            colorMode: "black_and_white" as const,
            paperSize: "a4" as const,
          },
        ];

      // Separate changes of paper size or color mode
      const groups: ClaimedJob["pagesConfig"][] = [];
      for (const range of configs) {
        const previous = groups[groups.length - 1];
        if (previous && previous[0].colorMode === range.colorMode && previous[0].paperSize === range.paperSize)
          previous.push(range);
        else groups.push([range]);
      }

      // Ensure double-sided jobs are handled with duplex state tracking
      const isDoubleSided = configs.some((c) => c.sideMode === "double_sided");
      // Check if this is Step 2 of a manual duplex job (Print Next Side)
      const isDuplexEvenStep = job.duplexStep === "even";

      // Server-persisted printer name takes precedence over the in-memory map.
      // This ensures the even side goes to the same printer even after an agent restart.
      const reservedPrinterForJob =
        job.requiredPrinterName ||
        this.orderToReservedPrinter.get(job.orderId) ||
        this.orderToReservedPrinter.get(job.id);
      if (job.requiredPrinterName) {
        logger.info(
          `Job #${job.id.slice(0, 8)}: Using server-persisted printer "${job.requiredPrinterName}" for even (back) side.`,
        );
      }

      // Clean up stale duplex reservations (> 30 minutes) to avoid locking printers if an order is abandoned
      const DUPLEX_RESERVATION_TTL_MS = 30 * 60 * 1000;
      const now = Date.now();
      for (const [key, res] of this.reservedDuplexPrinters.entries()) {
        if (now - res.reservedAt > DUPLEX_RESERVATION_TTL_MS) {
          logger.warn(
            `Duplex reservation for printer "${res.printerName}" (Order #${res.orderId.slice(0, 8)}) expired after 30m. Releasing printer.`,
          );
          this.reservedDuplexPrinters.delete(key);
          this.orderToReservedPrinter.delete(res.orderId);
          this.orderToReservedPrinter.delete(res.jobId);
        }
      }

      // Build busy printers set (all active printing printers + all reserved duplex printers)
      const busyPrinters = new Set([...this.activePrintingPrinters, ...this.reservedDuplexPrinters.keys()]);

      // If this is Step 2 (even pages) for a reserved printer, allow using that reserved printer
      if (isDuplexEvenStep && reservedPrinterForJob) {
        busyPrinters.delete(reservedPrinterForJob.toLowerCase());
      }

      const hasHardwareDuplexInShop = this.discoveredPrinters.some(
        (p) => isPhysicalPrinter(p) && p.capabilities?.duplexSupport === true,
      );
      const hasColorPrinterInShop = this.discoveredPrinters.some(
        (p) => isPhysicalPrinter(p) && p.capabilities?.colorSupport === true,
      );

      const anyJobInBatchRequiresColor = batchJobs.some((b) =>
        (b.pagesConfig || []).some((c) => c.colorMode === "color"),
      );

      const plan = groups.map((ranges) => {
        const reqColor = anyJobInBatchRequiresColor || ranges[0].colorMode === "color";
        const printer = findBestPrinterForJob(this.discoveredPrinters, {
          colorMode: reqColor ? "color" : "black_and_white",
          paperSize: ranges[0].paperSize,
          preferredName: this.config.selectedPrinter || job.defaultPrinter,
          requiredPrinterName: isDuplexEvenStep ? reservedPrinterForJob : null,
          requiresDuplex: isDoubleSided && hasHardwareDuplexInShop && !isDuplexEvenStep,
          busyPrinters,
          allowColorFallbackForMono: true,
          allowOffline: false,
        });
        return { ranges, printer };
      });

      if (plan.some((part) => !part.printer)) {
        this.processedJobIds.delete(jobKey);

        const requiredMode = groups[0]?.[0]?.colorMode || "requested";
        const hasHardwareDuplexInShop = this.discoveredPrinters.some(
          (p) => isPhysicalPrinter(p) && p.capabilities?.duplexSupport === true,
        );

        const reason = isDuplexEvenStep
          ? `Reserved printer "${reservedPrinterForJob}" is currently offline or busy. Order will remain on hold for this printer.`
          : isDoubleSided && !hasHardwareDuplexInShop
            ? `No compatible printer connected for double-sided request. Request stays on hold.`
            : isDoubleSided && hasHardwareDuplexInShop
              ? `Hardware Duplex printer is currently busy printing. Double-sided request is held to print automatically on the duplex printer.`
              : requiredMode === "black_and_white"
                ? `No free physical printer is available for Black & White printing. Request stays on hold.`
                : `No free compatible Color printer is available. Request stays on hold.`;

        logger.warn(`Job #${job.id.slice(0, 8)} held: ${reason}`);
        await this.client.reportFailure(job.id, reason, true);
        this.stats.jobsFailed += 1;
        this.currentJob = null;
        return false;
      }

      // Allow B&W jobs to print on color printer when needed
      job.allowColorFallback = true;

      // Resolve final duplex execution step based on selected printer hardware capability
      const firstPrinter = plan[0]?.printer;
      const printerSupportsHardwareDuplex = Boolean(firstPrinter?.capabilities?.duplexSupport);
      if (isDoubleSided) {
        if (isDuplexEvenStep) {
          job.duplexStep = "even";
        } else if (printerSupportsHardwareDuplex) {
          // Printer has hardware duplex unit: print both sides in a single pass
          job.duplexStep = "all";
        } else {
          // Simplex printer fallback: manual duplex Step 1 (odd pages first)
          job.duplexStep = "odd";
          logger.info(
            `Simplex printer "${firstPrinter?.name}" detected for double-sided Job #${job.id.slice(0, 8)}; routing to manual duplex (Step 1: odd pages).`,
          );
        }
      }

      // Mark the selected printer(s) as actively printing
      for (const part of plan) {
        if (part.printer) {
          this.activePrintingPrinters.add(part.printer.name.toLowerCase());
        }
      }

      // If we have multiple sibling jobs for the same order and a target printer,
      // combine all documents into a single continuous print batch!
      if (batchJobs.length > 1 && plan[0]?.printer?.name && job.duplexStep !== "odd") {
        const targetPrinterName = plan[0].printer.name;
        const resolvedItems: Array<{ sourcePath: string; job: ClaimedJob; isLocalCacheHit: boolean }> = [];
        let batchSubmissionStarted = false;

        try {
          for (const bJob of batchJobs) {
            const resolved = await this.resolveJobDocumentPath(bJob);
            resolvedItems.push({ sourcePath: resolved.filePath, job: bJob, isLocalCacheHit: resolved.isLocalCacheHit });
          }

          batchSubmissionStarted = true;
          for (const bJob of batchJobs) {
            bJob.allowColorFallback = true;
            await this.client.reportSubmit(bJob.id, targetPrinterName, bJob.duplexStep);
          }

          const shouldIncludeSeparator = this.config.enableSeparatorPage !== false;
          const batchResult = await prepareAndPrintBatch(
            resolvedItems.map((item) => ({ sourcePath: item.sourcePath, job: item.job })),
            targetPrinterName,
            { includeSeparatorPage: shouldIncludeSeparator },
          );

          if (!batchResult.success) {
            throw new Error(batchResult.errorMessage || "Batch print submission failed.");
          }

          if (process.platform === "win32" || os.platform() === "win32") {
            logger.info(
              `Monitoring physical printing on "${targetPrinterName}" for continuous batch (${batchJobs.length} documents) until pages are ejected...`,
            );
            await waitForPhysicalPrintCompletion(targetPrinterName);
          }

          for (const bJob of batchJobs) {
            try {
              await this.client.reportComplete(bJob.id);
              logger.info(`Batch Job #${bJob.id.slice(0, 8)} reported as physically COMPLETED to server.`);
            } catch (compErr) {
              logger.warn(`Could not report batch job #${bJob.id.slice(0, 8)} completed:`, { error: compErr });
            }
          }

          this.stats.jobsSubmitted += batchJobs.length;
          this.stats.totalPagesSubmitted += batchResult.pagesSubmitted;
          logger.info(
            `✅ Order #${job.orderId.slice(0, 8)}: Continuous batch of ${batchJobs.length} documents (${batchResult.pagesSubmitted} pages) physically printed successfully.`,
          );
          return true;
        } catch (batchErr) {
          const errorMsg = batchErr instanceof Error ? batchErr.message : "Batch print execution error";
          logger.error(`Continuous batch print failed for Order #${job.orderId.slice(0, 8)}: ${errorMsg}`);
          for (const bJob of batchJobs) {
            if (!batchSubmissionStarted) {
              this.processedJobIds.delete(`${bJob.id}:${bJob.duplexStep || "standard"}`);
            }
            await this.client.reportFailure(bJob.id, errorMsg.slice(0, 500), !batchSubmissionStarted);
          }
          this.stats.jobsFailed += batchJobs.length;
          return false;
        } finally {
          for (const part of plan) {
            if (part.printer) {
              this.activePrintingPrinters.delete(part.printer.name.toLowerCase());
            }
          }
          for (const item of resolvedItems) {
            if (!item.isLocalCacheHit && fs.existsSync(item.sourcePath)) {
              const toClean = item.sourcePath;
              setTimeout(() => {
                try {
                  if (fs.existsSync(toClean)) fs.unlinkSync(toClean);
                } catch { }
              }, 60000);
            }
          }
        }
      }

      // Single-job execution
      let printFilePath = "";
      let isLocalCacheHit = false;
      let submissionStarted = false;
      try {
        const resolved = await this.resolveJobDocumentPath(job);
        printFilePath = resolved.filePath;
        isLocalCacheHit = resolved.isLocalCacheHit;

        // Persist the no-retry boundary BEFORE invoking the renderer.
        // Also tells the server which printer and duplex step is handling this job.
        submissionStarted = true;
        const firstPrinterName = plan[0]?.printer?.name;
        await this.client.reportSubmit(job.id, firstPrinterName, job.duplexStep);

        let pagesSubmitted = 0;
        for (let i = 0; i < plan.length; i++) {
          const part = plan[i];
          const printerName = part.printer!.name;
          const isLastPartForThisPrinter = !plan.slice(i + 1).some(
            (p) => p.printer?.name.toLowerCase() === printerName.toLowerCase(),
          );
          const shouldIncludeSeparator =
            this.config.enableSeparatorPage !== false &&
            job.isLastJobForOrder !== false &&
            isLastPartForThisPrinter;
          logger.info(
            `Submitting to printer "${printerName}" for Job #${job.id.slice(0, 8)} (${job.duplexStep || "full"}, separator: ${shouldIncludeSeparator})...`,
          );
          const result = await prepareAndPrintDocument(printFilePath, job, printerName, part.ranges, {
            includeSeparatorPage: shouldIncludeSeparator,
          });
          if (!result.success)
            throw new Error(
              result.errorMessage || "Windows print submission failed. Check for partial output before retrying.",
            );
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
            logger.info(
              `🖨️ Printer "${printerName}" is now RESERVED for Order #${job.orderId.slice(0, 8)} until "Print Next Side" is clicked.`,
            );
          } else if (job.duplexStep === "even") {
            // Phase 2 (Even Pages) completed -> Release this printer reservation
            const printerKey = printerName.toLowerCase();
            this.reservedDuplexPrinters.delete(printerKey);
            this.orderToReservedPrinter.delete(job.orderId);
            this.orderToReservedPrinter.delete(job.id);
            logger.info(
              `✅ Order #${job.orderId.slice(0, 8)} duplex printing completed. Printer "${printerName}" is now RELEASED for other jobs.`,
            );
          } else if (job.duplexStep === "all") {
            logger.info(
              `✅ Order #${job.orderId.slice(0, 8)} hardware duplex printing completed in a single pass on "${printerName}".`,
            );
          }
        }

        // Wait for physical printer to finish printing all pages before confirming completion!
        const lastPrinterName = plan[plan.length - 1]?.printer?.name || firstPrinterName;
        if (lastPrinterName && (process.platform === "win32" || os.platform() === "win32")) {
          if (job.isLastJobForOrder !== false) {
            logger.info(`Monitoring physical printing on "${lastPrinterName}" until pages are ejected...`);
            await waitForPhysicalPrintCompletion(lastPrinterName);
          } else {
            logger.info(
              `Job #${job.id.slice(0, 8)} is an intermediate job in order batch; skipping spooler queue wait to maintain continuous printing.`,
            );
          }
        }

        // Now report job physically completed to server (unless manual duplex odd step)!
        if (job.duplexStep !== "odd") {
          try {
            await this.client.reportComplete(job.id);
            logger.info(`Job #${job.id.slice(0, 8)} reported as physically COMPLETED to server.`);
          } catch (compErr) {
            logger.warn(`Could not report job #${job.id.slice(0, 8)} completed to server:`, { error: compErr });
          }
        }

        this.stats.jobsSubmitted += 1;
        this.stats.totalPagesSubmitted += pagesSubmitted;
        logger.info(`Job #${job.id.slice(0, 8)} successfully submitted and physically printed.`);
        return true;
      } catch (printErr) {
        const errorMsg = printErr instanceof Error ? printErr.message : "Print execution error";
        logger.error(`Print execution failed for Job #${job.id.slice(0, 8)}: ${errorMsg}`);
        // If submission didn't start (e.g. network/download failure), allow agent to retry cleanly
        if (!submissionStarted) {
          this.processedJobIds.delete(jobKey);
        }
        await this.client.reportFailure(job.id, errorMsg.slice(0, 500), !submissionStarted);
        this.stats.jobsFailed += 1;
        return false;
      } finally {
        // Unmark active printing status
        for (const part of plan) {
          if (part.printer) {
            this.activePrintingPrinters.delete(part.printer.name.toLowerCase());
          }
        }

        // Clean up temporary download file (do NOT delete persistent local cache file!)
        if (!isLocalCacheHit && fs.existsSync(printFilePath)) {
          const downloadToClean = printFilePath;
          setTimeout(() => {
            try {
              if (fs.existsSync(downloadToClean)) {
                fs.unlinkSync(downloadToClean);
              }
            } catch {
              // Ignore cleanup failure
            }
          }, 60000);
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
      return false;
    } finally {
      this.currentJob = null;
      this.isProcessingJob = false;
    }
    return false;
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
      isRealtimeActive: this.isRealtimeConnected,
      lastHeartbeat: this.lastHeartbeatTime,
      version: this.config.version,
      printers: this.discoveredPrinters,
      selectedPrinter: this.config.selectedPrinter,
      currentJob: this.currentJob,
      enableSeparatorPage: this.config.enableSeparatorPage !== false,
      stats: { ...this.stats },
      recentLogs: logger.getRecentLogs(),
    };
  }

  async triggerPoll(): Promise<void> {
    if (!this.isRunning || !isConfigPaired(this.config)) return;
    this.idlePollCount = 0;
    if (this.isProcessingJob || this.isPollRunning) {
      this.hasPendingWakeup = true;
      return;
    }
    this.scheduleNextPoll(0);
  }

  async getCounterQueue() {
    return await this.client.getCounterQueue();
  }

  setSeparatorPage(enabled: boolean) {
    this.config = saveConfig({ enableSeparatorPage: enabled });
    logger.info(`Separator page ${enabled ? "enabled" : "disabled"}`);
  }

  clearProcessedJob(jobIdOrOrderId: string) {
    for (const key of Array.from(this.processedJobIds)) {
      if (key.includes(jobIdOrOrderId)) {
        this.processedJobIds.delete(key);
      }
    }
  }

  async approveCounterOrder(orderId: string, duplexStep?: "odd" | "even" | "all") {
    // Clear processed keys for this order so re-approving or printing next side can claim and print fresh
    this.clearProcessedJob(orderId);
    const result = await this.client.approveCounterOrder(orderId, duplexStep);
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
