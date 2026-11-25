import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import type { AgentConfig, AgentStatusSnapshot, ClaimedJob, DiscoveredPrinter } from "./types";
import { clearConfig, isConfigPaired, loadConfig, saveConfig, getDocumentCacheDirectory, cleanDocumentCache } from "./config";
import { AgentApiClient } from "./client";
import { discoverWindowsPrinters, findBestPrinterForJob, findDefaultPrinter, isPhysicalPrinter } from "./printer-discovery";
import {
  cleanSpoolDirectory,
  getPreslicedSpoolPath,
  prepareAndPrintBatch,
  prepareAndPrintDocument,
  presliceJobDocument,
  proactiveWarmupPrinter,
  waitForPhysicalPrintCompletion,
} from "./print-executor";
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
  private lastFullPrinterSyncAt = 0;
  private precacheDebounceTimer: NodeJS.Timeout | null = null;
  private processedJobIds: Set<string> = new Set();
  private pendingCompletionJobIds: Set<string> = new Set();
  private pendingCompletionRetries: Map<string, number> = new Map();
  private forcedOrderIds: Set<string> = new Set();
  private approvingOrderIds: Set<string> = new Set();

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
    cleanSpoolDirectory();

    this.discoveryTimer = setInterval(async () => {
      if (this.discovering) return;
      cleanDocumentCache();
      cleanSpoolDirectory();

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
    this.forcedOrderIds.clear();
    this.instanceLock?.close();
    this.instanceLock = null;
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.precacheDebounceTimer) {
      clearTimeout(this.precacheDebounceTimer);
      this.precacheDebounceTimer = null;
    }
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

    // Trigger immediate heartbeat and ensure loops are active if agent was started before pairing
    await this.sendHeartbeat();
    if (this.isRunning) {
      if (!this.heartbeatTimer) this.startHeartbeatLoop();
      if (!this.pollTimeout) this.startJobPollingLoop();
    }

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

    // Trigger immediate printer discovery, heartbeat, and ensure background loops run
    try {
      this.discoveredPrinters = await discoverWindowsPrinters();
      await this.sendHeartbeat();
    } catch (err) {
      logger.warn("Post-login heartbeat error:", { err });
    }
    if (this.isRunning) {
      if (!this.heartbeatTimer) this.startHeartbeatLoop();
      if (!this.pollTimeout) this.startJobPollingLoop();
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
    // Clear existing credentials if already paired so tokens are never sent to a different server URL
    if (this.config.agentToken) {
      this.unpair();
    }
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

  private applyLocalPrinterOverrides(printers: DiscoveredPrinter[]): DiscoveredPrinter[] {
    const disabledSet = new Set((this.config.disabledPrinters || []).map((s) => s.trim().toLowerCase()));
    const colorOverrides = new Map<string, boolean>();
    for (const [key, val] of Object.entries(this.config.printerColorOverrides || {})) {
      colorOverrides.set(key.trim().toLowerCase(), Boolean(val));
    }
    return printers.map((p) => {
      const lower = p.name.trim().toLowerCase();
      const isDisabled = disabledSet.has(lower);
      const hasColorOverride = colorOverrides.has(lower);
      const colorSupport = hasColorOverride
        ? Boolean(colorOverrides.get(lower))
        : Boolean(p.capabilities?.colorSupport);
      return {
        ...p,
        isDisabled,
        status: isDisabled ? "offline" : p.status,
        isColorUserOverride: hasColorOverride || p.isColorUserOverride,
        capabilities: {
          duplexSupport: Boolean(p.capabilities?.duplexSupport),
          paperSizes: p.capabilities?.paperSizes || ["A4", "Letter"],
          ...p.capabilities,
          colorSupport,
        },
      };
    });
  }

  private async refreshPrinters(force = false): Promise<void> {
    if (this.discovering) return;
    const now = Date.now();
    if (!force && now - this.lastPrinterDiscoveryTime < 15000 && this.discoveredPrinters.length > 0) {
      return;
    }
    this.discovering = true;
    try {
      const discovered = await discoverWindowsPrinters(force);
      if (discovered.length > 0 || this.discoveredPrinters.length === 0) {
        this.discoveredPrinters = this.applyLocalPrinterOverrides(discovered);
      }
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
    } catch (err) {
      logger.debug("Printer refresh failed; keeping last known printer list:", { err });
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
          color: Boolean(p.capabilities?.colorSupport),
        })),
      );

      // Send full printer inventory on startup, when signature changes, or at least every 10 minutes
      const nowMs = Date.now();
      const shouldIncludePrinters =
        !this.lastSentPrintersSignature ||
        this.lastSentPrintersSignature !== currentSignature ||
        nowMs - this.lastFullPrinterSyncAt >= 10 * 60 * 1000;

      const result = await this.client.sendHeartbeat({
        ...(shouldIncludePrinters ? { printers: this.discoveredPrinters } : {}),
        currentJobId: this.currentJob?.id || null,
        version: this.config.version,
        machineInfo,
      });

      if (shouldIncludePrinters) {
        this.lastSentPrintersSignature = currentSignature;
        this.lastFullPrinterSyncAt = nowMs;
      }
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
            logger.info("⚡ Realtime event: new print job created. Pre-caching documents, warming up printers & checking queue...");
            this.schedulePrecacheRefresh();
            void this.warmupTargetPrinters();
            void this.triggerPoll();
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'print_jobs', filter: `shop_id=eq.${this.config.shopId}` },
          (payload) => {
            const status = payload.new ? (payload.new as { status?: string }).status : undefined;
            this.schedulePrecacheRefresh();
            void this.warmupTargetPrinters();
            if (!status || status === 'queued' || status === 'paid') {
              logger.info(`⚡ Realtime event: print job status updated${status ? ` to "${status}"` : ""}. Waking up agent immediately...`);
              void this.triggerPoll();
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'documents', filter: `shop_id=eq.${this.config.shopId}` },
          () => {
            logger.info("⚡ Realtime event: new document uploaded by customer. Pre-caching early in background...");
            this.schedulePrecacheRefresh();
            void this.warmupTargetPrinters();
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'orders', filter: `shop_id=eq.${this.config.shopId}` },
          () => {
            logger.info("⚡ Realtime event: new customer order initiated. Pre-caching early in background...");
            this.schedulePrecacheRefresh();
            void this.warmupTargetPrinters();
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
      // WebSocket pushes immediately upon any new job; keep conservative 20s safety-net poll.
      if (this.idlePollCount === 1) return 2000;
      if (this.idlePollCount === 2) return 5000;
      return 20000;
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
      didProcessJob = await this.pollAndProcessNextJob();
      if (!didProcessJob) {
        void this.precachePendingCounterDocuments();
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
        const originalExt = path.extname(job.document.originalFilename || "").toLowerCase();
        const candidateNames = [
          `doc_${job.document.id}.pdf`,
          `${job.document.id}.pdf`,
          rawId ? `doc_${rawId}.pdf` : "",
          rawId ? `${rawId}.pdf` : "",
          originalExt && originalExt !== ".pdf" ? `doc_${job.document.id}${originalExt}` : "",
          originalExt && originalExt !== ".pdf" ? `${job.document.id}${originalExt}` : "",
          rawId && originalExt && originalExt !== ".pdf" ? `doc_${rawId}${originalExt}` : "",
          rawId && originalExt && originalExt !== ".pdf" ? `${rawId}${originalExt}` : "",
          job.document.originalFilename,
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

  private async flushPendingCompletions(): Promise<void> {
    if (this.pendingCompletionJobIds.size === 0) return;
    while (this.pendingCompletionJobIds.size > 200) {
      const oldestId = this.pendingCompletionJobIds.values().next().value;
      if (!oldestId) break;
      this.pendingCompletionJobIds.delete(oldestId);
      this.pendingCompletionRetries.delete(oldestId);
    }
    for (const jobId of Array.from(this.pendingCompletionJobIds)) {
      try {
        await this.client.reportComplete(jobId);
        this.pendingCompletionJobIds.delete(jobId);
        this.pendingCompletionRetries.delete(jobId);
        logger.info(`Previously pending Job #${jobId.slice(0, 8)} successfully reported as COMPLETED to server.`);
      } catch (err) {
        const status = (err as Error & { status?: number })?.status;
        const attempts = (this.pendingCompletionRetries.get(jobId) || 0) + 1;
        this.pendingCompletionRetries.set(jobId, attempts);
        if (
          attempts >= 20 ||
          (status && status >= 400 && status < 500 && status !== 401 && status !== 403 && status !== 408 && status !== 429)
        ) {
          this.pendingCompletionJobIds.delete(jobId);
          this.pendingCompletionRetries.delete(jobId);
          logger.warn(`Dropping pending completion for Job #${jobId.slice(0, 8)} (${status ? `HTTP ${status}` : `after ${attempts} attempts`}).`);
        }
      }
    }
  }

  private async pollAndProcessNextJob(): Promise<boolean> {
    try {
      if (this.discoveredPrinters.length === 0) {
        await this.refreshPrinters();
      }
      // Retry any completions that previously encountered temporary network gaps
      await this.flushPendingCompletions();

      const defaultPrinter = findDefaultPrinter(this.discoveredPrinters, this.config.selectedPrinter, false);
      if (!defaultPrinter || defaultPrinter.status === "offline") {
        return false;
      }
      const job = await this.client.claimNextJob(45); // 45 second fast-recovery lease
      this.isConnected = true;
      if (!job) {
        return false;
      }
      return await this.executeClaimedJob(job);
    } catch (error) {
      if (error instanceof Error && error.message === "AGENT_UNAUTHORIZED_OR_REVOKED") {
        this.unpair();
      } else {
        logger.error("Error during job claim cycle:", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return false;
    }
  }

  public async executeClaimedJob(job: ClaimedJob): Promise<boolean> {
    this.isProcessingJob = true;
    try {
      if (this.discoveredPrinters.length === 0) {
        await this.refreshPrinters();
      }
      await this.flushPendingCompletions();

      const jobKey = `${job.id}:${job.duplexStep || "standard"}`;
      const batchJobs: ClaimedJob[] = [job, ...(job.siblingJobs || [])];
      for (const j of batchJobs) {
        const jKey = `${j.id}:${j.duplexStep || "standard"}`;
        this.processedJobIds.add(jKey);
        if (j.orderId) {
          this.processedJobIds.add(`${j.orderId}:${j.id}:${j.duplexStep || "standard"}`);
        }
      }
      while (this.processedJobIds.size > 500) {
        const firstKey = this.processedJobIds.values().next().value;
        if (!firstKey) break;
        this.processedJobIds.delete(firstKey);
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

      // Clean up stale duplex reservations (> 3 minutes) to avoid locking printers if an order is abandoned
      const DUPLEX_RESERVATION_TTL_MS = 3 * 60 * 1000;
      const now = Date.now();
      for (const [key, res] of this.reservedDuplexPrinters.entries()) {
        if (now - res.reservedAt > DUPLEX_RESERVATION_TTL_MS) {
          logger.warn(
            `Duplex reservation for printer "${res.printerName}" (Order #${res.orderId.slice(0, 8)}) expired after 3m. Releasing printer.`,
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
        (p) => !p.isDisabled && p.status !== "offline" && isPhysicalPrinter(p) && p.capabilities?.duplexSupport === true,
      );
      const hasColorPrinterInShop = this.discoveredPrinters.some(
        (p) => isPhysicalPrinter(p) && p.capabilities?.colorSupport === true,
      );

      const anyJobInBatchRequiresColor = batchJobs.some((b) =>
        (b.pagesConfig || []).some((c) => c.colorMode === "color"),
      );

      const isForcePrinted = this.forcedOrderIds.has(job.orderId);
      // Strictly require Color printer for Color jobs unless explicitly forced or permitted
      const allowMonoFallbackForColor = job.allowMonoFallback === true || isForcePrinted;

      // 1. If we have multiple sibling jobs for the same order, route each job independently by hardware capability!
      if (batchJobs.length > 1) {
        const routedJobs: Array<{
          job: ClaimedJob;
          printer: DiscoveredPrinter | null;
          requiresColor: boolean;
        }> = [];

        for (const bJob of batchJobs) {
          const bJobConfigs = bJob.pagesConfig?.length
            ? bJob.pagesConfig
            : [
                {
                  startPage: 1,
                  endPage: bJob.document.pageCount || 1,
                  colorMode: "black_and_white" as const,
                  paperSize: "a4" as const,
                },
              ];

          const isColor = bJobConfigs.some((c) => c.colorMode === "color");
          const bJobDoubleSided = bJobConfigs.some((c) => c.sideMode === "double_sided");
          const reqColor = isColor && !allowMonoFallbackForColor;

          const selectedPrinterObj = this.discoveredPrinters.find(
            (p) => p.name.toLowerCase() === (this.config.selectedPrinter || "").toLowerCase(),
          );
          const preferredName =
            reqColor && selectedPrinterObj && !selectedPrinterObj.capabilities?.colorSupport
              ? undefined
              : this.config.selectedPrinter || bJob.defaultPrinter;

          const printer = findBestPrinterForJob(this.discoveredPrinters, {
            colorMode: reqColor ? "color" : "black_and_white",
            paperSize: bJobConfigs[0]?.paperSize || "a4",
            preferredName,
            requiredPrinterName: isDuplexEvenStep ? reservedPrinterForJob : null,
            requiresDuplex: bJobDoubleSided && hasHardwareDuplexInShop && !isDuplexEvenStep,
            busyPrinters,
            allowColorFallbackForMono: true,
            allowMonoFallbackForColor,
            allowOffline: false,
          });

          bJob.allowColorFallback = true;
          if (allowMonoFallbackForColor) {
            bJob.allowMonoFallback = true;
          }

          routedJobs.push({
            job: bJob,
            printer: printer || null,
            requiresColor: isColor,
          });
        }

        const readyJobs = routedJobs.filter((r) => r.printer !== null);
        const heldJobs = routedJobs.filter((r) => r.printer === null);

        // Report held status for any jobs that lack compatible hardware (e.g. Color page with no Color printer)
        for (const held of heldJobs) {
          const hJob = held.job;
          this.processedJobIds.delete(`${hJob.id}:${hJob.duplexStep || "standard"}`);
          const reason = held.requiresColor
            ? "No free compatible Color printer is available. Connect a Color printer or click Force Print to print in Black & White."
            : "No free physical printer is available for Black & White printing. Request stays on hold.";
          logger.warn(`Job #${hJob.id.slice(0, 8)} held: ${reason}`);
          await this.client.reportFailure(hJob.id, reason, true);
          this.stats.jobsFailed += 1;
        }

        if (readyJobs.length === 0) {
          this.currentJob = null;
          return false;
        }

        // Group ready jobs by assigned printer
        const printerGroups = new Map<string, Array<{ job: ClaimedJob; printer: DiscoveredPrinter }>>();
        for (const item of readyJobs) {
          const pName = item.printer!.name;
          const list = printerGroups.get(pName) || [];
          list.push({ job: item.job, printer: item.printer! });
          printerGroups.set(pName, list);
        }

        let anySubmitted = false;

        for (const [targetPrinterName, items] of printerGroups.entries()) {
          const targetPrinter = items[0].printer;
          const printerJobs = items.map((i) => i.job);

          // Mark printer busy
          this.activePrintingPrinters.add(targetPrinterName.toLowerCase());
          const resolvedItems: Array<{ sourcePath: string; job: ClaimedJob; isLocalCacheHit: boolean }> = [];
          let batchSubmissionStarted = false;

          try {
            for (const pJob of printerJobs) {
              const resolved = await this.resolveJobDocumentPath(pJob);
              resolvedItems.push({ sourcePath: resolved.filePath, job: pJob, isLocalCacheHit: resolved.isLocalCacheHit });
            }

            // Parallelize reportSubmit across all items for this printer
            await Promise.all(
              printerJobs.map((pJob) => {
                return this.client.reportSubmit(pJob.id, targetPrinterName, pJob.duplexStep);
              }),
            );

            batchSubmissionStarted = true;
            anySubmitted = true;
            const shouldIncludeSeparator = this.config.enableSeparatorPage !== false;
            const needsManualDuplexIndividually = printerJobs.some(
              (pJob) =>
                pJob.duplexStep === "even" ||
                pJob.duplexStep === "odd" ||
                ((pJob.pagesConfig || []).some((c) => c.sideMode === "double_sided") &&
                  targetPrinter.capabilities?.duplexSupport !== true),
            );

            let batchPagesSubmitted = 0;
            if (needsManualDuplexIndividually) {
              for (let idx = 0; idx < resolvedItems.length; idx++) {
                const rItem = resolvedItems[idx];
                const rDoubleSided = (rItem.job.pagesConfig || []).some((c) => c.sideMode === "double_sided");
                if (rDoubleSided && targetPrinter.capabilities?.duplexSupport !== true && (!rItem.job.duplexStep || rItem.job.duplexStep === "none")) {
                  rItem.job.duplexStep = "odd";
                }
                const singleRes = await prepareAndPrintDocument(rItem.sourcePath, rItem.job, targetPrinterName, undefined, {
                  includeSeparatorPage: shouldIncludeSeparator && idx === resolvedItems.length - 1,
                  discoveredPrinter: targetPrinter,
                });
                if (!singleRes.success) {
                  throw new Error(singleRes.errorMessage || "Print submission failed.");
                }
                batchPagesSubmitted += singleRes.pagesSubmitted;
              }
            } else {
              const batchResult = await prepareAndPrintBatch(
                resolvedItems.map((item) => ({ sourcePath: item.sourcePath, job: item.job })),
                targetPrinterName,
                {
                  includeSeparatorPage: shouldIncludeSeparator,
                  discoveredPrinter: targetPrinter,
                },
              );

              if (!batchResult.success) {
                throw new Error(batchResult.errorMessage || "Print submission failed.");
              }
              batchPagesSubmitted = batchResult.pagesSubmitted;
            }

            if (process.platform === "win32" || os.platform() === "win32") {
              logger.info(
                `Continuous print (${printerJobs.length} docs) spooled to "${targetPrinterName}". Monitoring queue in background...`,
              );
              void (async () => {
                try {
                  await waitForPhysicalPrintCompletion(targetPrinterName, 60000);
                } catch (bgErr) {
                  logger.warn(`Spooler queue background wait notice:`, {
                    error: bgErr instanceof Error ? bgErr.message : String(bgErr),
                  });
                }
              })();
            }

            for (const pJob of printerJobs) {
              if (pJob.duplexStep === "odd") continue;
              try {
                await this.client.reportComplete(pJob.id);
                this.pendingCompletionJobIds.delete(pJob.id);
                logger.info(`Job #${pJob.id.slice(0, 8)} reported as physically COMPLETED to server.`);
              } catch (compErr) {
                this.pendingCompletionJobIds.add(pJob.id);
                logger.warn(`Could not report job #${pJob.id.slice(0, 8)} completed (queued for auto-retry):`, {
                  error: compErr instanceof Error ? compErr.message : String(compErr),
                });
              }
            }

            this.stats.jobsSubmitted += printerJobs.length;
            this.stats.totalPagesSubmitted += batchPagesSubmitted;
            if (heldJobs.length === 0) {
              this.forcedOrderIds.delete(job.orderId);
            }
            logger.info(
              `✅ Order #${job.orderId.slice(0, 8)}: ${printerJobs.length} document(s) (${batchPagesSubmitted} pages) physically spooled to "${targetPrinterName}".`,
            );
          } catch (batchErr) {
            const errorMsg = batchErr instanceof Error ? batchErr.message : "Print execution error";
            logger.error(`Print failed for Order #${job.orderId.slice(0, 8)} on "${targetPrinterName}": ${errorMsg}`);
            for (const pJob of printerJobs) {
              if (!batchSubmissionStarted) {
                this.processedJobIds.delete(`${pJob.id}:${pJob.duplexStep || "standard"}`);
              }
              await this.client.reportFailure(pJob.id, errorMsg.slice(0, 500), !batchSubmissionStarted);
            }
            this.stats.jobsFailed += printerJobs.length;
          } finally {
            this.activePrintingPrinters.delete(targetPrinterName.toLowerCase());
            for (const item of resolvedItems) {
              if (!item.isLocalCacheHit && fs.existsSync(item.sourcePath)) {
                const toClean = item.sourcePath;
                setTimeout(() => {
                  try {
                    if (fs.existsSync(toClean)) fs.unlinkSync(toClean);
                  } catch {}
                }, 60000);
              }
            }
          }
        }

        return anySubmitted;
      }

      // Single-document / single-job execution: Plan page-ranges
      const plan = groups.map((ranges) => {
        const thisRangeRequiresColor = ranges[0].colorMode === "color";
        const reqColor = thisRangeRequiresColor && !allowMonoFallbackForColor;

        const selectedPrinterObj = this.discoveredPrinters.find(
          (p) => p.name.toLowerCase() === (this.config.selectedPrinter || "").toLowerCase(),
        );
        const preferredName =
          reqColor && selectedPrinterObj && !selectedPrinterObj.capabilities?.colorSupport
            ? undefined
            : this.config.selectedPrinter || job.defaultPrinter;

        let printer = findBestPrinterForJob(this.discoveredPrinters, {
          colorMode: reqColor ? "color" : "black_and_white",
          paperSize: ranges[0].paperSize,
          preferredName,
          requiredPrinterName: isDuplexEvenStep ? reservedPrinterForJob : null,
          requiresDuplex: isDoubleSided && hasHardwareDuplexInShop && !isDuplexEvenStep,
          busyPrinters,
          allowColorFallbackForMono: true,
          allowMonoFallbackForColor,
          allowOffline: false,
        });

        return { ranges, printer };
      });

      const printableParts = plan.filter((part) => part.printer !== null);
      const heldParts = plan.filter((part) => part.printer === null);

      if (printableParts.length === 0) {
        this.processedJobIds.delete(jobKey);

        const reason = isDuplexEvenStep
          ? `Reserved printer "${reservedPrinterForJob}" is currently offline or busy. Order will remain on hold for this printer.`
          : isDoubleSided && !hasHardwareDuplexInShop
            ? `No compatible printer connected for double-sided request. Request stays on hold.`
            : isDoubleSided && hasHardwareDuplexInShop
              ? `Hardware Duplex printer is currently busy printing. Double-sided request is held to print automatically on the duplex printer.`
              : heldParts.some((p) => p.ranges[0]?.colorMode === "color")
                ? `No free compatible Color printer is available. Connect a Color printer or click Force Print to print in Black & White.`
                : `No free physical printer is available for Black & White printing. Request stays on hold.`;

        logger.warn(`Job #${job.id.slice(0, 8)} held: ${reason}`);
        await this.client.reportFailure(job.id, reason, true);
        this.stats.jobsFailed += 1;
        this.currentJob = null;
        return false;
      }

      // Allow B&W jobs to print on color printer when needed
      job.allowColorFallback = true;
      if (allowMonoFallbackForColor) {
        job.allowMonoFallback = true;
      }

      // Resolve final duplex execution step based on selected printer hardware capability
      const firstPrinter = printableParts[0]?.printer;
      const printerSupportsHardwareDuplex = Boolean(firstPrinter?.capabilities?.duplexSupport);
      if (isDoubleSided) {
        if (isDuplexEvenStep) {
          job.duplexStep = "even";
        } else if (printerSupportsHardwareDuplex) {
          job.duplexStep = "all";
        } else {
          job.duplexStep = "odd";
          logger.info(
            `Simplex printer "${firstPrinter?.name}" detected for double-sided Job #${job.id.slice(0, 8)}; routing to manual duplex (Step 1: odd pages).`,
          );
        }
      }

      // Mark the selected printer(s) as actively printing
      for (const part of printableParts) {
        if (part.printer) {
          this.activePrintingPrinters.add(part.printer.name.toLowerCase());
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

        const firstPrinterName = printableParts[0]?.printer?.name;
        submissionStarted = true;
        await this.client.reportSubmit(job.id, firstPrinterName, job.duplexStep);

        let pagesSubmitted = 0;
        for (let i = 0; i < printableParts.length; i++) {
          const part = printableParts[i];
          const printerName = part.printer!.name;
          const isLastPartForThisPrinter = !printableParts.slice(i + 1).some(
            (p) => p.printer?.name.toLowerCase() === printerName.toLowerCase(),
          );
          const shouldIncludeSeparator =
            this.config.enableSeparatorPage !== false &&
            job.isLastJobForOrder !== false &&
            isLastPartForThisPrinter &&
            heldParts.length === 0;
          logger.info(
            `Submitting to printer "${printerName}" for Job #${job.id.slice(0, 8)} (${job.duplexStep || "full"}, separator: ${shouldIncludeSeparator})...`,
          );
          const result = await prepareAndPrintDocument(printFilePath, job, printerName, part.ranges, {
            includeSeparatorPage: shouldIncludeSeparator,
            discoveredPrinter: part.printer,
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

        // Monitor physical printer in background so daemon and UI unblock immediately!
        const lastPrinterName = printableParts[printableParts.length - 1]?.printer?.name || firstPrinterName;
        if (lastPrinterName && (process.platform === "win32" || os.platform() === "win32")) {
          if (job.isLastJobForOrder !== false) {
            logger.info(`Dispatched to "${lastPrinterName}". Monitoring physical printing in background...`);
            void (async () => {
              try {
                await waitForPhysicalPrintCompletion(lastPrinterName, 60000);
              } catch (bgErr) {
                logger.warn(`Spooler queue background wait notice:`, {
                  error: bgErr instanceof Error ? bgErr.message : String(bgErr),
                });
              }
            })();
          } else {
            logger.info(
              `Job #${job.id.slice(0, 8)} is an intermediate job in order batch; skipping spooler queue wait to maintain continuous printing.`,
            );
          }
        }

        // Now report job physically completed to server (unless manual duplex odd step or held parts remain)!
        if (job.duplexStep !== "odd") {
          if (heldParts.length === 0) {
            try {
              await this.client.reportComplete(job.id);
              this.pendingCompletionJobIds.delete(job.id);
              logger.info(`Job #${job.id.slice(0, 8)} reported as physically COMPLETED to server.`);
            } catch (compErr) {
              this.pendingCompletionJobIds.add(job.id);
              logger.warn(`Could not report job #${job.id.slice(0, 8)} completed to server (queued for auto-retry):`, {
                error: compErr instanceof Error ? compErr.message : String(compErr),
              });
            }
            this.forcedOrderIds.delete(job.orderId);
          } else {
            // Held parts remain (e.g. Color page on mono shop)
            this.processedJobIds.delete(jobKey);
            const heldReason = heldParts.some((p) => p.ranges[0]?.colorMode === "color")
              ? "Black & White page(s) printed. Color page(s) held: No compatible Color printer is available. Connect a Color printer or click Force Print to print in Black & White."
              : "Some page(s) printed, but others held: No compatible printer available.";
            logger.warn(`Job #${job.id.slice(0, 8)} partially printed: ${heldReason}`);
            await this.client.reportFailure(job.id, heldReason, true);
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
        for (const part of printableParts) {
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

  private precachingDocIds: Set<string> = new Set();
  private precacheQueue: Array<{
    order: any;
    doc: any;
    targetPath: string;
    matchingJob: any;
  }> = [];
  private activePrecacheCount = 0;
  private static readonly MAX_CONCURRENT_PRECACHES = 5;

  private drainPrecacheQueue(): void {
    while (
      this.activePrecacheCount < AgentDaemon.MAX_CONCURRENT_PRECACHES &&
      this.precacheQueue.length > 0
    ) {
      const item = this.precacheQueue.shift();
      if (!item) break;
      this.activePrecacheCount++;

      void (async () => {
        const { order, doc, targetPath, matchingJob } = item;
        const tmpPath = `${targetPath}.${Date.now()}.tmp`;
        try {
          if (!fs.existsSync(targetPath) || fs.statSync(targetPath).size === 0) {
            logger.info(`⚡ Pre-caching document "${doc.filename}" for Token #${order.tokenNumber ?? order.publicId}...`);
            const jobIdToUse = matchingJob?.id;
            await this.client.downloadDocument(doc.id, jobIdToUse, tmpPath);
            if (fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 0) {
              fs.renameSync(tmpPath, targetPath);
            }
            logger.info(`✅ Successfully pre-cached "${doc.filename}" in local SSD cache (0s latency on print).`);
          }
          await this.client.reportPrecacheComplete(doc.id, order.id);

          // Optimization: Pre-slice custom page ranges immediately after download
          if (matchingJob?.id && matchingJob?.pagesConfig?.length) {
            const preslicedPath = getPreslicedSpoolPath(matchingJob.id, matchingJob.duplexStep);
            if (!fs.existsSync(preslicedPath) || fs.statSync(preslicedPath).size === 0) {
              void presliceJobDocument(targetPath, matchingJob.id, matchingJob.pagesConfig, {
                duplexStep: matchingJob.duplexStep,
              }).catch(() => {});
            }
          }
        } catch (err) {
          logger.debug(`Background pre-cache skipped or failed for doc ${doc.id}:`, {
            err: err instanceof Error ? err.message : String(err),
          });
        } finally {
          try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          } catch {
            // ignore temp file cleanup error
          }
          this.precachingDocIds.delete(doc.id);
          this.activePrecacheCount--;
          this.drainPrecacheQueue();
        }
      })();
    }
  }

  private schedulePrecacheRefresh(): void {
    if (!this.isRunning || !isConfigPaired(this.config)) return;
    if (this.precacheDebounceTimer) {
      clearTimeout(this.precacheDebounceTimer);
    }
    this.precacheDebounceTimer = setTimeout(() => {
      this.precacheDebounceTimer = null;
      void this.precachePendingCounterDocuments();
    }, 600);
  }

  async precachePendingCounterDocuments(): Promise<void> {
    if (!this.isRunning || !isConfigPaired(this.config)) return;
    try {
      const data = await this.client.getCounterQueue();
      const queue = data?.queue || [];
      if (queue.length === 0) return;

      const cacheDir = getDocumentCacheDirectory();
      if (!cacheDir) return;

      const pendingOrders = queue.filter(
        (o) =>
          (o.status === "awaiting_payment" || o.status === "paid" || o.status === "partially_printed") &&
          !o.isExpired,
      );

      if (pendingOrders.length > 0) {
        void this.warmupTargetPrinters();
      }

      for (const order of pendingOrders) {
        for (const doc of order.documents || []) {
          if (!doc.id || this.precachingDocIds.has(doc.id)) continue;

          const targetPath = path.join(cacheDir, `doc_${doc.id}.pdf`);
          const matchingJob =
            ((order.jobs || []) as any[]).find((j: any) => j.documentId === doc.id) || null;

          if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
            void this.client.reportPrecacheComplete(doc.id, order.id);
            // Optimization: Pre-slice custom page ranges in background if not already pre-sliced
            if (matchingJob?.id && matchingJob?.pagesConfig?.length) {
              const preslicedPath = getPreslicedSpoolPath(matchingJob.id, matchingJob.duplexStep);
              if (!fs.existsSync(preslicedPath) || fs.statSync(preslicedPath).size === 0) {
                void presliceJobDocument(targetPath, matchingJob.id, matchingJob.pagesConfig, {
                  duplexStep: matchingJob.duplexStep,
                }).catch(() => {});
              }
            }
            continue;
          }

          this.precachingDocIds.add(doc.id);
          this.precacheQueue.push({ order, doc, targetPath, matchingJob });
        }
      }
      this.drainPrecacheQueue();
    } catch {
      // Non-fatal
    }
  }

  toggleDisablePrinter(printerName: string): boolean {
    const disabled = new Set((this.config.disabledPrinters || []).map((p) => p.toLowerCase()));
    let isDisabledNow = false;
    const lowerName = printerName.toLowerCase();
    if (disabled.has(lowerName)) {
      disabled.delete(lowerName);
      isDisabledNow = false;
      logger.info(`Printer "${printerName}" re-enabled for agent use.`);
    } else {
      disabled.add(lowerName);
      isDisabledNow = true;
      logger.info(`Printer "${printerName}" marked as disabled (Do Not Use).`);
      if (this.config.selectedPrinter?.toLowerCase() === lowerName) {
        this.config = saveConfig({ selectedPrinter: undefined });
      }
    }
    this.config = saveConfig({ disabledPrinters: Array.from(disabled) });
    this.discoveredPrinters = this.applyLocalPrinterOverrides(this.discoveredPrinters);
    void this.refreshPrinters(true).then(() => {
      if (isConfigPaired(this.config)) void this.sendHeartbeat();
    });
    return isDisabledNow;
  }

  setPrinterColorOverride(printerName: string, isColor: boolean): void {
    const lowerName = printerName.trim().toLowerCase();
    const overrides: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(this.config.printerColorOverrides || {})) {
      const kLower = k.trim().toLowerCase();
      if (kLower !== lowerName) {
        overrides[kLower] = Boolean(v);
      }
    }
    overrides[lowerName] = isColor;
    this.config = saveConfig({ printerColorOverrides: overrides });
    this.discoveredPrinters = this.applyLocalPrinterOverrides(this.discoveredPrinters);
    logger.info(`Printer "${printerName}" color mode override set to: ${isColor ? "Color" : "Black & White"}`);
    void this.refreshPrinters(true).then(() => {
      if (isConfigPaired(this.config)) void this.sendHeartbeat();
    });
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
      disabledPrinters: this.config.disabledPrinters || [],
      printerColorOverrides: this.config.printerColorOverrides || {},
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
    const data = await this.client.getCounterQueue();
    void this.precachePendingCounterDocuments();
    const cacheDir = getDocumentCacheDirectory();
    if (data?.queue && Array.isArray(data.queue) && cacheDir) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.queue = data.queue.map((item: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isPrecached = !item.documents?.length || item.documents.every((d: any) => {
          const p = path.join(cacheDir, `doc_${d.id}.pdf`);
          return fs.existsSync(p) && fs.statSync(p).size > 0;
        });
        return { ...item, isPrecached };
      });
    }
    return data;
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

  async warmupTargetPrinters(specificPrinterName?: string): Promise<void> {
    if (!this.isRunning || process.env.NODE_ENV === "test") return;
    try {
      if (specificPrinterName) {
        void proactiveWarmupPrinter(specificPrinterName);
        return;
      }
      if (this.discoveredPrinters.length === 0) {
        await this.refreshPrinters();
      }
      const target = findDefaultPrinter(this.discoveredPrinters, this.config.selectedPrinter, false);
      if (target && isPhysicalPrinter(target)) {
        void proactiveWarmupPrinter(target.name);
      }
      const colorPrinter = this.discoveredPrinters.find(
        (p) => isPhysicalPrinter(p) && p.capabilities?.colorSupport === true && p.name !== target?.name,
      );
      if (colorPrinter) {
        void proactiveWarmupPrinter(colorPrinter.name);
      }
    } catch {
      // non-fatal
    }
  }

  async approveCounterOrder(orderId: string, duplexStep?: "odd" | "even" | "all") {
    if (this.approvingOrderIds.has(orderId)) {
      throw new Error("Order approval is already in progress.");
    }
    this.approvingOrderIds.add(orderId);
    try {
      // Clear processed keys for this order so re-approving or printing next side can claim and print fresh
      this.clearProcessedJob(orderId);
      this.forcedOrderIds.add(orderId);
      while (this.forcedOrderIds.size > 200) {
        const oldestOrder = this.forcedOrderIds.values().next().value;
        if (!oldestOrder) break;
        this.forcedOrderIds.delete(oldestOrder);
      }
      // Unstick agent if it was marked as processing without an active job
      if (this.isProcessingJob && !this.currentJob) {
        this.isProcessingJob = false;
      }
      // 1. Proactively ensure target printers are warm & awake
      void this.warmupTargetPrinters();
      // 2. Dispatch cloud approval request (which atomically claims the job on server)
      const result = await this.client.approveCounterOrder(orderId, duplexStep);
      // 3. Fast-path: If the server returned the claimed job directly, execute it immediately!
      if (result && (result as any).claimedJob) {
        logger.info(
          `⚡ Instant Fast-Path: Order #${orderId.slice(0, 8)} claimed atomically during approval. Initiating 0ms local dispatch...`,
        );
        await this.executeClaimedJob((result as any).claimedJob as ClaimedJob);
        return result;
      }
      // 4. Fallback safety net: Force immediate poll without idle backoff
      this.hasPendingWakeup = false;
      this.scheduleNextPoll(0);
      return result;
    } finally {
      this.approvingOrderIds.delete(orderId);
    }
  }

  async cancelCounterOrder(orderId: string) {
    this.clearProcessedJob(orderId);
    this.forcedOrderIds.delete(orderId);
    const reservedName = this.orderToReservedPrinter.get(orderId);
    if (reservedName) {
      this.reservedDuplexPrinters.delete(reservedName);
      this.orderToReservedPrinter.delete(orderId);
    }
    return await this.client.cancelCounterOrder(orderId);
  }

  async completeCounterOrder(orderId: string) {
    this.clearProcessedJob(orderId);
    this.forcedOrderIds.delete(orderId);
    return await this.client.completeCounterOrder(orderId);
  }

  async precacheOrder(orderId?: string): Promise<boolean> {
    void this.precachePendingCounterDocuments();
    return true;
  }
}

export const agentDaemon = new AgentDaemon();
