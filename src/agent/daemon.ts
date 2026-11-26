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
  getAllPrinterQueueCounts,
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

  // Multi-printer tracking, load-balancing, and duplex reservation maps
  private activePrintingPrinters: Set<string> = new Set();
  private activeDispatches: Map<
    string,
    {
      orderId: string;
      jobId: string;
      filename: string;
      printerName: string;
      totalPages: number;
      isColorPrinter?: boolean;
    }
  > = new Map();
  private jobPrinterHistory: Map<
    string,
    {
      jobId: string;
      orderId: string;
      documentId: string;
      printerName: string;
      printerNames: string[];
      isColorPrinter: boolean;
      status: "printing" | "completed" | "failed";
      rangeAssignments?: Array<{
        startPage: number;
        endPage: number;
        colorMode: string;
        printerName: string;
        isColorPrinter: boolean;
      }>;
      updatedAt: number;
    }
  > = new Map();
  private printerLastUsedOrder: Map<string, number> = new Map();
  private printerDispatchSeq = 0;
  private activeOrderDispatches = 0;
  private routingLock: Promise<void> = Promise.resolve();
  private reservedDuplexPrinters: Map<
    string,
    { orderId: string; jobId: string; printerName: string; reservedAt: number }
  > = new Map();
  private orderToReservedPrinter: Map<string, string> = new Map();

  private discoveryTimer: NodeJS.Timeout | null = null;
  private discovering = false;
  private pendingForcedDiscovery = false;
  private heartbeatBusy = false;
  private pendingForcedHeartbeat = false;
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
          color: Boolean(p.capabilities?.colorSupport),
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
    if (this.discovering) {
      if (force) this.pendingForcedDiscovery = true;
      return;
    }
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
      if (this.pendingForcedDiscovery) {
        this.pendingForcedDiscovery = false;
        void this.refreshPrinters(true);
      }
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

  private async sendHeartbeat(forceSync = false): Promise<void> {
    if (this.heartbeatBusy) {
      if (forceSync) this.pendingForcedHeartbeat = true;
      return;
    }
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
      if (this.pendingForcedHeartbeat) {
        this.pendingForcedHeartbeat = false;
        void this.sendHeartbeat(true);
      }
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

  private withRoutingLock<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.routingLock;
    let resolveNext!: () => void;
    this.routingLock = new Promise<void>((resolve) => {
      resolveNext = resolve;
    });
    return previous
      .catch(() => {})
      .then(() => task())
      .finally(() => {
        resolveNext();
      });
  }

  private async getEffectivePrinterQueueCounts(): Promise<Record<string, number>> {
    let liveCounts: Record<string, number> = {};
    if (typeof getAllPrinterQueueCounts === "function") {
      try {
        liveCounts = (await getAllPrinterQueueCounts()) || {};
      } catch {
        liveCounts = {};
      }
    }
    const counts: Record<string, number> = { ...liveCounts };
    for (const printerKey of this.activePrintingPrinters) {
      counts[printerKey] = Math.max(counts[printerKey] || 0, 1);
    }
    return counts;
  }

  private recordPrinterDispatched(printerName: string): void {
    this.printerLastUsedOrder.set(printerName.toLowerCase(), ++this.printerDispatchSeq);
  }

  private recordJobPrinterAssignment(entry: {
    jobId: string;
    orderId: string;
    documentId: string;
    printerName: string;
    printerNames?: string[];
    isColorPrinter: boolean;
    status: "printing" | "completed" | "failed";
    rangeAssignments?: Array<{
      startPage: number;
      endPage: number;
      colorMode: string;
      printerName: string;
      isColorPrinter: boolean;
    }>;
  }): void {
    const names = entry.printerNames?.length ? Array.from(new Set(entry.printerNames)) : [entry.printerName];
    if (this.jobPrinterHistory.has(entry.jobId)) {
      this.jobPrinterHistory.delete(entry.jobId);
    }
    this.jobPrinterHistory.set(entry.jobId, {
      jobId: entry.jobId,
      orderId: entry.orderId,
      documentId: entry.documentId,
      printerName: entry.printerName,
      printerNames: names,
      isColorPrinter: entry.isColorPrinter,
      status: entry.status,
      rangeAssignments: entry.rangeAssignments,
      updatedAt: Date.now(),
    });
    while (this.jobPrinterHistory.size > 1000) {
      const oldestKey = this.jobPrinterHistory.keys().next().value;
      if (!oldestKey) break;
      this.jobPrinterHistory.delete(oldestKey);
    }
  }

  private updateJobPrinterStatus(jobId: string, status: "printing" | "completed" | "failed"): void {
    const existing = this.jobPrinterHistory.get(jobId);
    if (existing) {
      existing.status = status;
      existing.updatedAt = Date.now();
    }
  }

  private getMatchingPreferredPrinter(reqColor: boolean, fallbackDefault?: string | null): string | undefined {
    const selected = this.config.selectedPrinter;
    if (selected) {
      const selectedObj = this.discoveredPrinters.find(
        (p) => p.name.toLowerCase() === selected.toLowerCase(),
      );
      if (selectedObj) {
        const matchesMode = reqColor
          ? selectedObj.capabilities?.colorSupport === true
          : !selectedObj.capabilities?.colorSupport;
        if (!matchesMode) return undefined;
      }
      return selected;
    }
    if (fallbackDefault) {
      const defObj = this.discoveredPrinters.find(
        (p) => p.name.toLowerCase() === fallbackDefault.toLowerCase(),
      );
      if (defObj) {
        const matchesMode = reqColor
          ? defObj.capabilities?.colorSupport === true
          : !defObj.capabilities?.colorSupport;
        if (!matchesMode) return undefined;
      }
      return fallbackDefault;
    }
    return undefined;
  }

  private getOnlinePhysicalPrinters(): DiscoveredPrinter[] {
    return this.discoveredPrinters.filter(
      (p) => !p.isDisabled && p.status !== "offline" && isPhysicalPrinter(p),
    );
  }

  private hasIdlePhysicalPrinter(): boolean {
    const busy = new Set([...this.activePrintingPrinters, ...this.reservedDuplexPrinters.keys()]);
    return this.getOnlinePhysicalPrinters().some((p) => !busy.has(p.name.toLowerCase()));
  }

  public getHardwareConcurrencyLimit(): number {
    const cpuCount = os.cpus()?.length || 2;
    const totalMemGb = os.totalmem() / (1024 * 1024 * 1024);
    if (cpuCount <= 4 || totalMemGb < 6) {
      return 2;
    }
    if (cpuCount <= 8 || totalMemGb < 12) {
      return 4;
    }
    return 8;
  }

  private getMaxConcurrentPrecaches(): number {
    return this.getHardwareConcurrencyLimit() <= 2 ? 2 : 5;
  }

  private getMaxConcurrentPreslices(): number {
    return this.getHardwareConcurrencyLimit() <= 2 ? 1 : 2;
  }

  private async runAdaptivePollCycle(): Promise<void> {
    if (!this.isRunning || !isConfigPaired(this.config)) return;
    if (this.isPollRunning) {
      this.hasPendingWakeup = true;
      return;
    }
    const hardwareCap = this.getHardwareConcurrencyLimit();
    const maxConcurrentOrders = Math.min(hardwareCap, Math.max(1, this.getOnlinePhysicalPrinters().length));
    if (this.activeOrderDispatches >= maxConcurrentOrders || (this.activeOrderDispatches > 0 && !this.hasIdlePhysicalPrinter())) {
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
      if (this.discoveredPrinters.length === 0) {
        await this.refreshPrinters();
      }
      await this.flushPendingCompletions();

      const defaultPrinter = findDefaultPrinter(this.discoveredPrinters, this.config.selectedPrinter, false);
      if (defaultPrinter && defaultPrinter.status !== "offline") {
        const onlineCount = this.getOnlinePhysicalPrinters().length;
        if (onlineCount <= 1) {
          didProcessJob = await this.pollAndProcessNextJob();
        } else {
          const maxBurst = Math.min(hardwareCap, onlineCount);
          const backgroundDispatches: Array<Promise<boolean>> = [];
          while (this.isRunning && this.activeOrderDispatches < maxBurst && this.hasIdlePhysicalPrinter()) {
            const job = await this.client.claimNextJob(45);
            this.isConnected = true;
            if (!job) break;

            didProcessJob = true;
            // Start execution and await the brief routing step so activePrintingPrinters reflects this order
            // before claiming another order for the remaining idle physical printers.
            let notifyRouted!: () => void;
            const routedPromise = new Promise<void>((resolve) => {
              notifyRouted = resolve;
            });
            const execPromise = this.executeClaimedJob(job, notifyRouted);
            backgroundDispatches.push(execPromise);
            await Promise.race([routedPromise, execPromise]);
          }
          if (backgroundDispatches.length > 0) {
            const results = await Promise.all(backgroundDispatches);
            didProcessJob = results.some(Boolean);
            // If all dispatched workers succeeded at full burst capacity, check immediately for remaining queued orders
            if (backgroundDispatches.length >= maxBurst && results.every(Boolean)) {
              this.hasPendingWakeup = true;
            }
          }
        }
      }
      if (!didProcessJob) {
        void this.precachePendingCounterDocuments();
      }
    } catch (err) {
      if (err instanceof Error && err.message === "AGENT_UNAUTHORIZED_OR_REVOKED") {
        this.unpair();
      } else {
        logger.warn("Error during adaptive poll cycle:", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
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

  public async executeClaimedJob(job: ClaimedJob, onRouted?: () => void): Promise<boolean> {
    this.activeOrderDispatches += 1;
    this.isProcessingJob = true;
    let routedNotified = false;
    const signalRouted = () => {
      if (!routedNotified) {
        routedNotified = true;
        onRouted?.();
      }
    };
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

      const hasHardwareDuplexInShop = this.discoveredPrinters.some(
        (p) => !p.isDisabled && p.status !== "offline" && isPhysicalPrinter(p) && p.capabilities?.duplexSupport === true,
      );

      const isForcePrinted = this.forcedOrderIds.has(job.orderId);
      // Strictly require Color printer for Color jobs unless explicitly forced or permitted
      const allowMonoFallbackForColor = job.allowMonoFallback === true || isForcePrinted;

      // 1. If we have multiple sibling jobs for the same order, route each job strictly by hardware capability!
      //    Keep B&W docs in the same order together on the same chosen B&W printer (and Color docs on the same Color printer)
      //    while load-balancing DIFFERENT orders across all connected B&W and Color printers.
      if (batchJobs.length > 1) {
        const routedJobs: Array<{
          job: ClaimedJob;
          printer: DiscoveredPrinter | null;
          requiresColor: boolean;
        }> = [];
        const assignedPrinterKeys = new Set<string>();

        await this.withRoutingLock(async () => {
          const queueCounts = await this.getEffectivePrinterQueueCounts();
          const lockBusy = new Set([...this.activePrintingPrinters, ...this.reservedDuplexPrinters.keys()]);
          if (isDuplexEvenStep && reservedPrinterForJob) {
            lockBusy.delete(reservedPrinterForJob.toLowerCase());
          }
          const poolSticky: { mono: DiscoveredPrinter | null; color: DiscoveredPrinter | null } = {
            mono: null,
            color: null,
          };

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
            const reqPaper = bJobConfigs[0]?.paperSize || "a4";
            const reqDuplex = bJobDoubleSided && hasHardwareDuplexInShop && !isDuplexEvenStep;

            // Reuse this order's already-selected pool printer so multi-file customer batches stay together cleanly,
            // as long as that printer supports the paper size & duplex requirement.
            const stickyCandidate = reqColor ? poolSticky.color : poolSticky.mono;
            const stickySupportsPaper =
              !stickyCandidate ||
              !reqPaper ||
              Boolean(
                stickyCandidate.capabilities?.paperSizes?.some((s: string) =>
                  s.toLowerCase().includes(reqPaper.toLowerCase()),
                ),
              );
            const stickySupportsDuplex = !reqDuplex || Boolean(stickyCandidate?.capabilities?.duplexSupport);

            let printer: DiscoveredPrinter | null =
              stickyCandidate && stickySupportsPaper && stickySupportsDuplex && !isDuplexEvenStep
                ? stickyCandidate
                : null;

            if (!printer) {
              const preferredName = this.getMatchingPreferredPrinter(reqColor, bJob.defaultPrinter);
              printer = findBestPrinterForJob(this.discoveredPrinters, {
                colorMode: reqColor ? "color" : "black_and_white",
                paperSize: reqPaper,
                preferredName,
                requiredPrinterName: isDuplexEvenStep ? reservedPrinterForJob : null,
                requiresDuplex: reqDuplex,
                busyPrinters: lockBusy,
                allowColorFallbackForMono: false,
                allowMonoFallbackForColor,
                allowOffline: false,
                queueCounts,
                lastUsedOrder: this.printerLastUsedOrder,
                loadBalancePools: true,
              });
            }

            if (printer) {
              const pKey = printer.name.toLowerCase();
              this.activePrintingPrinters.add(pKey);
              lockBusy.add(pKey);
              if (!assignedPrinterKeys.has(pKey)) {
                assignedPrinterKeys.add(pKey);
                this.recordPrinterDispatched(printer.name);
              }
              if (reqColor && !poolSticky.color) poolSticky.color = printer;
              if (!reqColor && !printer.capabilities?.colorSupport && !poolSticky.mono) poolSticky.mono = printer;
            }

            if (allowMonoFallbackForColor) {
              bJob.allowMonoFallback = true;
            }

            routedJobs.push({
              job: bJob,
              printer: printer || null,
              requiresColor: isColor,
            });
          }
        });

        signalRouted();

        const readyJobs = routedJobs.filter((r) => r.printer !== null);
        const heldJobs = routedJobs.filter((r) => r.printer === null);

        // Report held status for any jobs that lack compatible hardware (e.g. Color page with no Color printer)
        for (const held of heldJobs) {
          const hJob = held.job;
          this.processedJobIds.delete(`${hJob.id}:${hJob.duplexStep || "standard"}`);
          const reason = held.requiresColor
            ? "No free compatible Color printer is available. Connect a Color printer or click Force Print to print in Black & White."
            : "No free physical Black & White printer is available. Request stays on hold.";
          logger.warn(`Job #${hJob.id.slice(0, 8)} held: ${reason}`);
          await this.client.reportFailure(hJob.id, reason, true);
          this.stats.jobsFailed += 1;
        }

        if (readyJobs.length === 0) {
          return false;
        }

        // Group ready jobs by assigned printer and dispatch across B&W & Color printers concurrently
        const printerGroups = new Map<string, Array<{ job: ClaimedJob; printer: DiscoveredPrinter }>>();
        for (const item of readyJobs) {
          const pName = item.printer!.name;
          const list = printerGroups.get(pName) || [];
          list.push({ job: item.job, printer: item.printer! });
          printerGroups.set(pName, list);
        }

        const groupResults = await Promise.all(
          Array.from(printerGroups.entries()).map(async ([targetPrinterName, items]) => {
            const targetPrinter = items[0].printer;
            const printerJobs = items.map((i) => i.job);

            this.activePrintingPrinters.add(targetPrinterName.toLowerCase());
            const resolvedItems: Array<{ sourcePath: string; job: ClaimedJob; isLocalCacheHit: boolean }> = [];
            let batchSubmissionStarted = false;

            for (const pJob of printerJobs) {
              const isColorP = Boolean(targetPrinter.capabilities?.colorSupport);
              this.recordJobPrinterAssignment({
                jobId: pJob.id,
                orderId: pJob.orderId,
                documentId: pJob.documentId,
                printerName: targetPrinterName,
                isColorPrinter: isColorP,
                status: "printing",
              });
              this.activeDispatches.set(pJob.id, {
                orderId: pJob.orderId,
                jobId: pJob.id,
                filename: pJob.document?.originalFilename || "Document",
                printerName: targetPrinterName,
                totalPages: pJob.totalPages || pJob.document?.pageCount || 1,
                isColorPrinter: isColorP,
              });
            }

            try {
              for (const pJob of printerJobs) {
                const resolved = await this.resolveJobDocumentPath(pJob);
                resolvedItems.push({ sourcePath: resolved.filePath, job: pJob, isLocalCacheHit: resolved.isLocalCacheHit });
              }

              await Promise.all(
                printerJobs.map((pJob) => {
                  return this.client.reportSubmit(pJob.id, targetPrinterName, pJob.duplexStep);
                }),
              );

              batchSubmissionStarted = true;
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
                  this.updateJobPrinterStatus(pJob.id, "completed");
                  logger.info(`Job #${pJob.id.slice(0, 8)} reported as physically COMPLETED to server.`);
                } catch (compErr) {
                  this.pendingCompletionJobIds.add(pJob.id);
                  this.updateJobPrinterStatus(pJob.id, "completed");
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
              return true;
            } catch (batchErr) {
              const errorMsg = batchErr instanceof Error ? batchErr.message : "Print execution error";
              logger.error(`Print failed for Order #${job.orderId.slice(0, 8)} on "${targetPrinterName}": ${errorMsg}`);
              for (const pJob of printerJobs) {
                if (!batchSubmissionStarted) {
                  this.processedJobIds.delete(`${pJob.id}:${pJob.duplexStep || "standard"}`);
                }
                this.updateJobPrinterStatus(pJob.id, "failed");
                await this.client.reportFailure(pJob.id, errorMsg.slice(0, 500), !batchSubmissionStarted);
              }
              this.stats.jobsFailed += printerJobs.length;
              return false;
            } finally {
              this.activePrintingPrinters.delete(targetPrinterName.toLowerCase());
              for (const pJob of printerJobs) {
                this.activeDispatches.delete(pJob.id);
              }
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
          }),
        );

        return groupResults.some(Boolean);
      }

      // Single-document / single-job execution: Plan page-ranges under routing lock
      const plan = await this.withRoutingLock(async () => {
        const queueCounts = await this.getEffectivePrinterQueueCounts();
        const lockBusy = new Set([...this.activePrintingPrinters, ...this.reservedDuplexPrinters.keys()]);
        if (isDuplexEvenStep && reservedPrinterForJob) {
          lockBusy.delete(reservedPrinterForJob.toLowerCase());
        }
        const assignedInJob = new Set<string>();

        const mapped = groups.map((ranges) => {
          const thisRangeRequiresColor = ranges[0].colorMode === "color";
          const reqColor = thisRangeRequiresColor && !allowMonoFallbackForColor;
          const preferredName = this.getMatchingPreferredPrinter(reqColor, job.defaultPrinter);

          const printer = findBestPrinterForJob(this.discoveredPrinters, {
            colorMode: reqColor ? "color" : "black_and_white",
            paperSize: ranges[0].paperSize,
            preferredName,
            requiredPrinterName: isDuplexEvenStep ? reservedPrinterForJob : null,
            requiresDuplex: isDoubleSided && hasHardwareDuplexInShop && !isDuplexEvenStep,
            busyPrinters: lockBusy,
            allowColorFallbackForMono: false,
            allowMonoFallbackForColor,
            allowOffline: false,
            queueCounts,
            lastUsedOrder: this.printerLastUsedOrder,
            loadBalancePools: true,
          });

          if (printer) {
            const pKey = printer.name.toLowerCase();
            this.activePrintingPrinters.add(pKey);
            if (!assignedInJob.has(pKey)) {
              assignedInJob.add(pKey);
              this.recordPrinterDispatched(printer.name);
            }
          }

          return { ranges, printer };
        });
        return mapped;
      });

      signalRouted();

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
                : `No free physical Black & White printer is available. Request stays on hold.`;

        logger.warn(`Job #${job.id.slice(0, 8)} held: ${reason}`);
        await this.client.reportFailure(job.id, reason, true);
        this.stats.jobsFailed += 1;
        return false;
      }

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

      // Mark the selected printer(s) as actively printing and record live job -> printer assignment
      const assignedPartPrinters: string[] = [];
      const rangeAssignments: Array<{
        startPage: number;
        endPage: number;
        colorMode: string;
        printerName: string;
        isColorPrinter: boolean;
      }> = [];
      for (const part of printableParts) {
        if (part.printer) {
          this.activePrintingPrinters.add(part.printer.name.toLowerCase());
          assignedPartPrinters.push(part.printer.name);
          const isColorP = Boolean(part.printer.capabilities?.colorSupport);
          for (const rng of part.ranges) {
            rangeAssignments.push({
              startPage: rng.startPage,
              endPage: rng.endPage,
              colorMode: rng.colorMode,
              printerName: part.printer.name,
              isColorPrinter: isColorP,
            });
          }
        }
      }
      if (printableParts[0]?.printer) {
        const uniquePrinterNames = Array.from(new Set(assignedPartPrinters));
        const primaryPrinter = printableParts[0].printer;
        const isColorPrimary = Boolean(primaryPrinter.capabilities?.colorSupport);
        this.recordJobPrinterAssignment({
          jobId: job.id,
          orderId: job.orderId,
          documentId: job.documentId,
          printerName: uniquePrinterNames.join(", "),
          printerNames: uniquePrinterNames,
          isColorPrinter: isColorPrimary,
          status: "printing",
          rangeAssignments,
        });
        this.activeDispatches.set(job.id, {
          orderId: job.orderId,
          jobId: job.id,
          filename: job.document?.originalFilename || "Document",
          printerName: uniquePrinterNames.join(", "),
          totalPages: job.totalPages || job.document?.pageCount || 1,
          isColorPrinter: isColorPrimary,
        });
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
              this.updateJobPrinterStatus(job.id, "completed");
              logger.info(`Job #${job.id.slice(0, 8)} reported as physically COMPLETED to server.`);
            } catch (compErr) {
              this.pendingCompletionJobIds.add(job.id);
              this.updateJobPrinterStatus(job.id, "completed");
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
        this.updateJobPrinterStatus(job.id, "failed");
        await this.client.reportFailure(job.id, errorMsg.slice(0, 500), !submissionStarted);
        this.stats.jobsFailed += 1;
        return false;
      } finally {
        this.activeDispatches.delete(job.id);
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
      signalRouted();
      this.activeOrderDispatches = Math.max(0, this.activeOrderDispatches - 1);
      this.isProcessingJob = this.activeOrderDispatches > 0;
      if (this.activeOrderDispatches === 0) {
        this.currentJob = null;
      }
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

  private preslicingJobKeys: Set<string> = new Set();
  private presliceQueue: Array<{
    targetPath: string;
    jobId: string;
    pagesConfig: ClaimedJob["pagesConfig"];
    duplexStep?: "odd" | "even" | "all" | "none";
  }> = [];
  private activePresliceCount = 0;

  private enqueuePreslice(
    targetPath: string,
    matchingJob: { id?: string; pagesConfig?: ClaimedJob["pagesConfig"]; duplexStep?: "odd" | "even" | "all" | "none" } | null,
  ): void {
    if (!matchingJob?.id || !matchingJob?.pagesConfig?.length) return;
    const key = `${matchingJob.id}:${matchingJob.duplexStep || "none"}`;
    if (this.preslicingJobKeys.has(key) || this.presliceQueue.length >= 60) return;

    const preslicedPath = getPreslicedSpoolPath(matchingJob.id, matchingJob.duplexStep);
    if (fs.existsSync(preslicedPath) && fs.statSync(preslicedPath).size > 0) return;

    this.preslicingJobKeys.add(key);
    this.presliceQueue.push({
      targetPath,
      jobId: matchingJob.id,
      pagesConfig: matchingJob.pagesConfig,
      duplexStep: matchingJob.duplexStep,
    });
    this.drainPresliceQueue();
  }

  private drainPresliceQueue(): void {
    const maxPreslices = this.getMaxConcurrentPreslices();
    while (this.activePresliceCount < maxPreslices && this.presliceQueue.length > 0) {
      const item = this.presliceQueue.shift();
      if (!item) break;
      this.activePresliceCount++;
      const key = `${item.jobId}:${item.duplexStep || "none"}`;

      void presliceJobDocument(item.targetPath, item.jobId, item.pagesConfig, {
        duplexStep: item.duplexStep,
      })
        .catch(() => {})
        .finally(() => {
          this.preslicingJobKeys.delete(key);
          this.activePresliceCount--;
          this.drainPresliceQueue();
        });
    }
  }

  private drainPrecacheQueue(): void {
    const maxConcurrentPrecaches = this.getMaxConcurrentPrecaches();
    while (
      this.activePrecacheCount < maxConcurrentPrecaches &&
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

          // Bounded background pre-slice (max 1 on low-end i3, max 2 otherwise)
          this.enqueuePreslice(targetPath, matchingJob);
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
            this.enqueuePreslice(targetPath, matchingJob);
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
    if (this.isRunning && isConfigPaired(this.config)) {
      this.hasPendingWakeup = false;
      this.scheduleNextPoll(0);
    }
    void this.refreshPrinters(true).then(() => {
      if (isConfigPaired(this.config)) void this.sendHeartbeat(true);
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
      activeDispatches: Array.from(this.activeDispatches.values()),
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
    if (data?.queue && Array.isArray(data.queue)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.queue = data.queue.map((item: any) => {
        const isPrecached = !cacheDir || !item.documents?.length || item.documents.every((d: { id: string }) => {
          const p = path.join(cacheDir, `doc_${d.id}.pdf`);
          return fs.existsSync(p) && fs.statSync(p).size > 0;
        });

        const assignedPrinterSet = new Set<string>();
        const enrichedJobs = Array.isArray(item.jobs)
          ? item.jobs.map((j: { id: string; documentId?: string; printerName?: string | null; status?: string }) => {
              const live = this.jobPrinterHistory.get(j.id);
              const printerName = live?.printerName || j.printerName || null;
              const printerNames = live?.printerNames?.length
                ? live.printerNames
                : printerName
                  ? [printerName]
                  : [];
              for (const pn of printerNames) assignedPrinterSet.add(pn);
              return {
                ...j,
                printerName,
                printerNames,
                isColorPrinter: live?.isColorPrinter ?? null,
                liveRoutingStatus: live?.status || null,
                rangeAssignments: live?.rangeAssignments || null,
              };
            })
          : [];

        const enrichedDocuments = Array.isArray(item.documents)
          ? item.documents.map((d: { id?: string; filename?: string; pageCount?: number }) => {
              const matchingJobs = enrichedJobs.filter(
                (j: { documentId?: string }) => j.documentId && d.id && j.documentId === d.id,
              );
              const docPrinters: string[] = [];
              let rangeAssignments: Array<{
                startPage: number;
                endPage: number;
                colorMode: string;
                printerName: string;
                isColorPrinter: boolean;
              }> = [];
              let jobStatus: string | null = null;
              for (const mj of matchingJobs) {
                for (const pn of mj.printerNames || []) {
                  if (pn && !docPrinters.includes(pn)) docPrinters.push(pn);
                }
                if (Array.isArray(mj.rangeAssignments)) {
                  rangeAssignments = rangeAssignments.concat(mj.rangeAssignments);
                }
                jobStatus = mj.liveRoutingStatus || mj.status || jobStatus;
              }
              return {
                ...d,
                printerName: docPrinters[0] || null,
                printerNames: docPrinters,
                rangeAssignments: rangeAssignments.length > 0 ? rangeAssignments : null,
                jobStatus,
              };
            })
          : [];

        return {
          ...item,
          isPrecached,
          jobs: enrichedJobs,
          documents: enrichedDocuments,
          assignedPrinters: Array.from(assignedPrinterSet),
        };
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
