import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  downloadMediaMessage,
  isJidGroup,
  isJidBroadcast,
  isJidStatusBroadcast,
  isJidNewsletter,
  isJidBot,
  isPnUser,
  isLidUser,
  normalizeMessageContent,
  Browsers,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import { loadConfig, getConfigDirectory } from "./config";
import { logger } from "./logger";
import { processAndCacheDocument, type ProcessedLocalDocument } from "./local-doc-processor";
import {
  buildWhatsAppBatchFailureReply,
  buildWhatsAppBatchSuccessReply,
  buildWhatsAppDownloadErrorReply,
  buildWhatsAppFallbackErrorReply,
  buildWhatsAppFileRejectReply,
  buildWhatsAppMediaRejectReply,
  buildWhatsAppTextReply,
} from "./whatsapp-replies";

export interface WhatsAppEvent {
  id: string;
  timestamp: string;
  senderPhone: string;
  senderName: string;
  filename: string;
  pageCount: number;
  configUrl: string;
  status: "success" | "error" | "retrying";
  errorMessage?: string;
}

export interface WhatsAppStatus {
  state: "disconnected" | "connecting" | "qr_ready" | "connected";
  connectedPhone: string | null;
  isSavedSession: boolean;
  qrCodeDataUrl: string | null;
  lastError: string | null;
  recentEvents: WhatsAppEvent[];
}

interface PendingWhatsAppAttachment {
  msg: WAMessage;
  mediaBuffer: Buffer;
  filename: string;
  mimetype: string;
}

interface PendingSenderBatch {
  senderPhone: string;
  senderName: string;
  remoteJid: string;
  attachments: PendingWhatsAppAttachment[];
  timer?: NodeJS.Timeout;
  lastMessage: WAMessage;
  firstQueuedAt: number;
  retryCount?: number;
  nextRetryAt?: number;
}

interface PendingReply {
  remoteJid: string;
  senderPhone: string;
  replyText: string;
  lastMessage?: WAMessage;
}

function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const code = (err as { code?: string })?.code?.toLowerCase() || "";
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
  const causeMsg = (cause?.message || "").toLowerCase();
  const causeCode = (cause?.code || "").toLowerCase();

  return (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("enotfound") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("ehostunreach") ||
    msg.includes("socket hang up") ||
    msg.includes("und_err_connect_timeout") ||
    msg.includes("timeout") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    code === "enotfound" ||
    code === "econnreset" ||
    code === "econnrefused" ||
    code === "etimedout" ||
    causeMsg.includes("enotfound") ||
    causeMsg.includes("econnrefused") ||
    causeCode === "enotfound"
  );
}

export function isSupportedWhatsAppPrintFile(filename: string, mimetype?: string): boolean {
  const ext = path.extname(filename || "").toLowerCase();
  const mime = (mimetype || "").toLowerCase();

  // Explicitly block and reject dangerous or web formats (HTML, scripts, executables, archives)
  const forbiddenExts = new Set([
    ".html", ".htm", ".xhtml", ".js", ".mjs", ".ts", ".jsx", ".tsx",
    ".exe", ".bat", ".cmd", ".ps1", ".vbs", ".sh", ".zip", ".rar", ".7z", ".tar", ".gz"
  ]);
  if (forbiddenExts.has(ext) || mime.includes("html") || mime.includes("javascript")) {
    return false;
  }

  const isPdf = ext === ".pdf" || mime.includes("pdf");
  const isImage =
    mime.startsWith("image/") ||
    [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif", ".bmp", ".tif", ".tiff"].includes(ext);
  const isDoc =
    ext === ".doc" ||
    ext === ".docx" ||
    mime.includes("word") ||
    mime.includes("officedocument.wordprocessingml");
  const isPresentation =
    ext === ".ppt" ||
    ext === ".pptx" ||
    ext === ".odp" ||
    mime.includes("presentation") ||
    mime.includes("powerpoint");
  const isSpreadsheet =
    ext === ".xls" ||
    ext === ".xlsx" ||
    ext === ".ods" ||
    mime.includes("spreadsheet") ||
    mime.includes("sheet") ||
    mime.includes("excel");
  const isText = ext === ".txt" || ext === ".csv" || (mime.startsWith("text/plain") && !mime.includes("html"));

  return isPdf || isImage || isDoc || isPresentation || isSpreadsheet || isText;
}

export class WhatsAppAgentService {
  private socket: WASocket | null = null;
  private state: "disconnected" | "connecting" | "qr_ready" | "connected" = "disconnected";
  private connectedPhone: string | null = null;
  private qrCodeDataUrl: string | null = null;
  private lastError: string | null = null;
  private recentEvents: WhatsAppEvent[] = [];
  private isIntentionalStop = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Multi-document batching: group rapid consecutive photos/PDFs from the same sender into ONE order
  private pendingBatches: Map<string, PendingSenderBatch> = new Map();
  private activeFlushes: Set<string> = new Set();

  // Resilient offline retry queue: automatically retries batches when internet or socket reconnects
  private retryBatches: Map<string, PendingSenderBatch> = new Map();
  private retryTimer: NodeJS.Timeout | null = null;
  private pendingRepliesQueue: PendingReply[] = [];
  // Serialized outbound reply queue to pace messages under heavy concurrent load (prevents Meta spam bans)
  private outboundReplyQueue: PendingReply[] = [];
  private isDrainingOutboundQueue = false;

  // Anti-ban safety: track timestamps of replies to prevent rapid multi-burst spam
  private lastReplyTimeBySender: Map<string, number> = new Map();
  private lastTextReplyBySender: Map<string, number> = new Map();
  private processedMessageIds: Set<string> = new Set();
  private inFlightDownloads: Map<string, number> = new Map();
  private isStarting = false;
  private socketGeneration = 0;

  private customAuthDir?: string;

  constructor(customAuthDir?: string) {
    this.customAuthDir = customAuthDir;
    this.loadPendingBatchesFromDisk();
  }

  private pushRecentEvent(event: WhatsAppEvent): void {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > 100) {
      this.recentEvents.length = 100;
    }
  }

  private markMessageProcessed(msgId: string): void {
    this.processedMessageIds.add(msgId);
    if (this.processedMessageIds.size > 2000) {
      const firstEntries = Array.from(this.processedMessageIds).slice(0, 500);
      for (const id of firstEntries) {
        this.processedMessageIds.delete(id);
      }
    }
  }

  private getAuthDirectory(): string {
    const dir = this.customAuthDir || path.join(getConfigDirectory(), "whatsapp_auth");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private getBatchesDirectory(): string {
    const dir = path.join(this.getAuthDirectory(), "pending_retries");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private saveBatchToDisk(batch: PendingSenderBatch): void {
    try {
      const dir = this.getBatchesDirectory();
      const safeId = batch.remoteJid.replace(/[^a-zA-Z0-9_-]/g, "_");
      const batchDir = path.join(dir, safeId);
      if (!fs.existsSync(batchDir)) {
        fs.mkdirSync(batchDir, { recursive: true });
      }

      const meta = {
        senderPhone: batch.senderPhone,
        senderName: batch.senderName,
        remoteJid: batch.remoteJid,
        firstQueuedAt: batch.firstQueuedAt,
        retryCount: batch.retryCount || 0,
        nextRetryAt: batch.nextRetryAt || 0,
        attachments: batch.attachments.map((att, idx) => {
          const bufferFile = `att_${idx}.bin`;
          fs.writeFileSync(path.join(batchDir, bufferFile), att.mediaBuffer);
          return {
            filename: att.filename,
            mimetype: att.mimetype,
            bufferFile,
          };
        }),
      };

      fs.writeFileSync(path.join(batchDir, "meta.json"), JSON.stringify(meta), "utf8");
    } catch (err) {
      logger.warn("Could not save pending batch to disk:", { err });
    }
  }

  private deleteBatchFromDisk(remoteJid: string): void {
    try {
      const dir = this.getBatchesDirectory();
      const safeId = remoteJid.replace(/[^a-zA-Z0-9_-]/g, "_");
      const batchDir = path.join(dir, safeId);
      if (fs.existsSync(batchDir)) {
        fs.rmSync(batchDir, { recursive: true, force: true });
      }
    } catch {
      // non-fatal
    }
  }

  private loadPendingBatchesFromDisk(): void {
    try {
      const dir = this.getBatchesDirectory();
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const batchDir = path.join(dir, entry.name);
        const metaPath = path.join(batchDir, "meta.json");
        if (!fs.existsSync(metaPath)) continue;
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          const attachments: PendingWhatsAppAttachment[] = [];
          for (const att of meta.attachments || []) {
            const bufPath = path.join(batchDir, att.bufferFile);
            if (fs.existsSync(bufPath)) {
              attachments.push({
                msg: {} as WAMessage,
                mediaBuffer: fs.readFileSync(bufPath),
                filename: att.filename,
                mimetype: att.mimetype,
              });
            }
          }
          if (attachments.length > 0 && meta.remoteJid) {
            this.retryBatches.set(meta.remoteJid, {
              senderPhone: meta.senderPhone,
              senderName: meta.senderName,
              remoteJid: meta.remoteJid,
              attachments,
              lastMessage: {} as WAMessage,
              firstQueuedAt: meta.firstQueuedAt || Date.now(),
              retryCount: meta.retryCount || 0,
              nextRetryAt: Date.now() + 2000,
            });
            logger.info(`Loaded pending offline batch for ${meta.remoteJid} from disk.`);
          }
        } catch {
          // ignore corrupted batch
        }
      }
      if (this.retryBatches.size > 0) {
        this.scheduleRetryQueue();
      }
    } catch (err) {
      logger.warn("Could not load pending batches from disk:", { err });
    }
  }

  public hasSavedSession(): boolean {
    const authDir = this.getAuthDirectory();
    const credsFile = path.join(authDir, "creds.json");
    if (!fs.existsSync(credsFile)) return false;
    try {
      const raw = JSON.parse(fs.readFileSync(credsFile, "utf8"));
      return Boolean(raw.registered || raw.me?.id || raw.account);
    } catch {
      try {
        return fs.statSync(credsFile).size > 100;
      } catch {
        return false;
      }
    }
  }

  public getSavedPhone(): string | null {
    if (this.connectedPhone) return this.connectedPhone;
    const authDir = this.getAuthDirectory();
    const credsFile = path.join(authDir, "creds.json");
    if (!fs.existsSync(credsFile)) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(credsFile, "utf8"));
      const userJid = raw.me?.id || "";
      if (userJid) {
        return userJid.split(":")[0]?.replace("@s.whatsapp.net", "") || userJid;
      }
    } catch {
      // ignore
    }
    return null;
  }

  public getStatus(): WhatsAppStatus {
    const isSaved = this.hasSavedSession();
    const phone = this.connectedPhone || (isSaved ? this.getSavedPhone() : null);
    return {
      state: this.state,
      connectedPhone: phone,
      isSavedSession: isSaved,
      qrCodeDataUrl: this.qrCodeDataUrl,
      lastError: this.lastError,
      recentEvents: this.recentEvents.slice(0, 20),
    };
  }

  private scheduleReconnect(delayMs?: number): void {
    if (this.isIntentionalStop) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts += 1;
    const backoff = delayMs ?? Math.min(2000 * Math.pow(1.3, Math.min(this.reconnectAttempts, 10)), 15000);
    logger.info(`Reconnecting WhatsApp in ${Math.round(backoff / 1000)}s (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isIntentionalStop) {
        void this.start(false, true);
      }
    }, backoff);
  }

  public async start(onlyIfSavedSession = false, isRestart = false, forceFresh = false): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const authDir = this.getAuthDirectory();
    const credsFile = path.join(authDir, "creds.json");
    const hasSaved = this.hasSavedSession();

    if (onlyIfSavedSession && !hasSaved) {
      logger.info("WhatsApp background start skipped: No fully paired session exists yet.");
      this.state = "disconnected";
      return;
    }

    // Never disrupt an active connected session
    if (this.state === "connected") {
      logger.debug("WhatsApp start ignored: Already connected.");
      return;
    }

    // Prevent duplicate concurrent connection attempts unless restarting or explicitly forced
    if ((this.state === "connecting" || this.isStarting) && !isRestart && !forceFresh) {
      return;
    }
    this.isStarting = true;

    // Clean up partial/unverified session files ONLY if there is NO saved registered session (or forceFresh without saved session)
    if (!onlyIfSavedSession && !isRestart && !hasSaved && fs.existsSync(credsFile)) {
      logger.info("Cleaning up unverified/partial WhatsApp session before generating fresh QR...");
      await this.clearSession();
    }

    this.isIntentionalStop = false;
    this.state = "connecting";
    this.lastError = null;
    this.qrCodeDataUrl = null;
    const myGen = ++this.socketGeneration;

    // Clean up any existing socket before opening a new connection
    if (this.socket) {
      try {
        this.socket.ev.removeAllListeners("connection.update");
        this.socket.ev.removeAllListeners("creds.update");
        this.socket.ev.removeAllListeners("messages.upsert");
        this.socket.end(undefined);
      } catch {
        // ignore
      }
      this.socket = null;
    }

    try {
      // Baileys multi-file auth helper is not a React hook
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);

      let version: [number, number, number] | undefined;
      try {
        const vResult = await fetchLatestBaileysVersion();
        version = vResult.version;
      } catch (vErr) {
        logger.debug("Baileys version fetch fallback:", { error: vErr });
      }

      // Standard WhatsApp Web browser signature for flawless mobile QR pairing
      const sock = makeWASocket({
        version,
        auth: authState,
        printQRInTerminal: false,
        browser: Browsers.windows("Desktop"),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        generateHighQualityLinkPreview: false,
      });

      this.socket = sock;

      sock.ev.on("creds.update", async () => {
        try {
          await saveCreds();
        } catch (err) {
          logger.error("Error saving WhatsApp credentials:", { error: err });
        }
      });

      sock.ev.on("connection.update", async (update) => {
        if (myGen !== this.socketGeneration) return;
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCodeDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              width: 300,
              color: { dark: "#064e3b", light: "#ffffff" },
            });
            this.state = "qr_ready";
            logger.info("New WhatsApp QR code generated for linking.");
          } catch (err) {
            logger.error("Failed to generate QR data URL:", { error: err });
          }
        }

        if (connection === "open") {
          this.state = "connected";
          this.qrCodeDataUrl = null;
          this.lastError = null;
          this.reconnectAttempts = 0;
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }

          const userJid = sock.user?.id || "";
          const phone = userJid.split(":")[0]?.replace("@s.whatsapp.net", "") || userJid;
          this.connectedPhone = phone;
          logger.info(`WhatsApp agent connected successfully as ${this.connectedPhone}`);

          // Automatically process any offline queued batches or deliver pending replies upon network restoration!
          void this.processRetryQueue(true);
        }

        if (connection === "close") {
          const errObj = lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
          const statusCode = errObj?.output?.statusCode;
          const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

          logger.warn(
            `WhatsApp connection closed (statusCode=${statusCode}, isRestartRequired=${isRestartRequired}, isLoggedOut=${isLoggedOut})`,
          );

          if (isLoggedOut) {
            this.state = "disconnected";
            this.connectedPhone = null;
            this.qrCodeDataUrl = null;
            await this.clearSession();
            logger.warn("WhatsApp session logged out by phone.");
            this.lastError = "WhatsApp unlinked by phone. Click Connect to link again.";
            return;
          }

          if (isRestartRequired) {
            this.state = "connecting";
            logger.info("WhatsApp pairing handshake completed (restartRequired). Starting authenticated session...");
            this.scheduleReconnect(800);
            return;
          }

          if (!this.isIntentionalStop) {
            if (this.hasSavedSession() || this.connectedPhone) {
              this.state = "connecting";
              this.lastError = "Network connection lost. Reconnecting when internet is restored...";
              this.scheduleReconnect();
            } else {
              this.state = "disconnected";
              this.qrCodeDataUrl = null;
              this.reconnectAttempts = 0;
              this.lastError = "Linking session timed out. Click Connect WhatsApp to generate a fresh QR code.";
              logger.info("WhatsApp unauthenticated pairing socket closed. Ready for fresh connection.");
            }
          }
        }
      });

      sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (myGen !== this.socketGeneration) return;
        logger.debug(`WhatsApp messages.upsert event: ${messages.length} message(s), type=${type}`);
        const fifteenMinutesAgoSec = Math.floor(Date.now() / 1000) - 900;
        for (const msg of messages) {
          if (type !== "notify" && (!msg.messageTimestamp || Number(msg.messageTimestamp) < fifteenMinutesAgoSec)) {
            continue;
          }
          await this.handleIncomingMessage(msg);
        }
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Failed to start WhatsApp connector";
      this.lastError = errMsg;
      logger.warn("Error starting WhatsApp client:", { error: errMsg });
      if ((this.hasSavedSession() || this.connectedPhone) && !this.isIntentionalStop) {
        this.state = "connecting";
        this.lastError = "Waiting for internet connection...";
        this.scheduleReconnect();
      } else {
        this.state = "disconnected";
      }
    } finally {
      this.isStarting = false;
    }
  }

  /** Graceful pause / stop on agent shutdown. Keeps session credentials completely safe on disk. */
  public stop(): void {
    this.isIntentionalStop = true;
    this.socketGeneration++;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    for (const batch of this.pendingBatches.values()) {
      clearTimeout(batch.timer);
    }
    this.pendingBatches.clear();

    if (this.socket) {
      try {
        this.socket.ev.removeAllListeners("connection.update");
        this.socket.ev.removeAllListeners("creds.update");
        this.socket.ev.removeAllListeners("messages.upsert");
        this.socket.end(undefined);
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.state = "disconnected";
    logger.info("WhatsApp agent stopped gracefully (session preserved).");
  }

  /** Explicit user unlink or permanent session reset */
  public async disconnect(clearSession = true): Promise<void> {
    this.isIntentionalStop = true;
    this.socketGeneration++;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    // Clear any pending batch timers and queued replies
    for (const batch of this.pendingBatches.values()) {
      clearTimeout(batch.timer);
    }
    this.pendingBatches.clear();
    if (clearSession) {
      this.pendingRepliesQueue = [];
      this.outboundReplyQueue = [];
    }

    if (this.socket) {
      try {
        await this.socket.logout();
      } catch {
        try {
          this.socket.end(new Error("Manual disconnect"));
        } catch {
          // ignore
        }
      }
      this.socket = null;
    }
    if (clearSession) {
      await this.clearSession();
    }
    this.state = "disconnected";
    this.connectedPhone = null;
    this.qrCodeDataUrl = null;
    this.reconnectAttempts = 0;
    this.lastReplyTimeBySender.clear();
    this.processedMessageIds.clear();
    logger.info("WhatsApp agent disconnected and session unlinked.");
  }

  private async clearSession(): Promise<void> {
    const authDir = this.getAuthDirectory();
    try {
      if (fs.existsSync(authDir)) {
        // Delete auth credentials/keys but preserve offline customer retry batches inside pending_retries
        const entries = fs.readdirSync(authDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === "pending_retries") continue;
          fs.rmSync(path.join(authDir, entry.name), { recursive: true, force: true });
        }
      }
    } catch (err) {
      logger.warn("Could not completely remove WhatsApp auth directory:", { error: err });
    }
  }

  private async handleIncomingMessage(msg: WAMessage): Promise<void> {
    const msgId = msg.key?.id;
    if (!msgId) {
      logger.debug("Skipping WhatsApp message: missing message ID");
      return;
    }
    if (this.processedMessageIds.has(msgId)) {
      logger.debug(`Skipping WhatsApp message ${msgId}: already processed`);
      return;
    }

    // Ignore outgoing messages or messages without content
    if (msg.key.fromMe) {
      return; // Silently skip own outgoing messages
    }
    if (!msg.message) {
      logger.debug(`Skipping WhatsApp message ${msgId}: no message content`);
      return;
    }

    const remoteJid = msg.key.remoteJid;
    if (!remoteJid) {
      logger.debug("Skipping WhatsApp message: missing remoteJid");
      return;
    }

    // Anti-ban measure 3: Strictly only handle direct 1-to-1 customer messages (never groups, newsletters, or broadcasts)
    const isGroup = isJidGroup(remoteJid) || remoteJid.endsWith("@g.us");
    const isBroadcast =
      isJidBroadcast(remoteJid) || isJidStatusBroadcast(remoteJid) || remoteJid.endsWith("@broadcast");
    const isNewsletter = isJidNewsletter(remoteJid) || remoteJid.endsWith("@newsletter");
    const isBot = isJidBot(remoteJid) || remoteJid.endsWith("@bot");

    const isDirectUser =
      !isGroup &&
      !isBroadcast &&
      !isNewsletter &&
      !isBot &&
      (remoteJid.endsWith("@s.whatsapp.net") ||
        remoteJid.endsWith("@lid") ||
        remoteJid.endsWith("@c.us") ||
        isPnUser(remoteJid) ||
        isLidUser(remoteJid));

    if (!isDirectUser) {
      logger.debug(`Skipping WhatsApp message ${msgId}: not a 1-to-1 chat (jid=${remoteJid})`);
      return;
    }

    // Ignore old historical messages (e.g. older than 15 minutes)
    const nowSec = Math.floor(Date.now() / 1000);
    const rawTimestamp = msg.messageTimestamp;
    let msgTimestampSec = nowSec;
    if (typeof rawTimestamp === "number") {
      msgTimestampSec = rawTimestamp;
    } else if (typeof rawTimestamp === "bigint") {
      msgTimestampSec = Number(rawTimestamp);
    } else if (rawTimestamp && typeof rawTimestamp === "object") {
      const tsObj = rawTimestamp as { low?: number; toNumber?: () => number };
      if (typeof tsObj.low === "number") {
        msgTimestampSec = tsObj.low;
      } else if (typeof tsObj.toNumber === "function") {
        msgTimestampSec = tsObj.toNumber();
      }
    } else if (typeof rawTimestamp === "string") {
      msgTimestampSec = Number(rawTimestamp) || nowSec;
    }

    if (!Number.isNaN(msgTimestampSec) && nowSec - msgTimestampSec > 900) {
      logger.debug(`Skipping WhatsApp message ${msgId}: too old (${nowSec - msgTimestampSec}s ago)`);
      return;
    }

    // Unpack normalized content (handles forwarded messages, documentWithCaptionMessage, ephemeral messages, etc.)
    let currentContainer: Record<string, unknown> = (msg.message || {}) as Record<string, unknown>;
    for (let i = 0; i < 5; i++) {
      const containerObj = currentContainer as Record<string, { message?: Record<string, unknown> }>;
      if (containerObj.ephemeralMessage?.message) {
        currentContainer = containerObj.ephemeralMessage.message;
      } else if (containerObj.viewOnceMessage?.message) {
        currentContainer = containerObj.viewOnceMessage.message;
      } else if (containerObj.viewOnceMessageV2?.message) {
        currentContainer = containerObj.viewOnceMessageV2.message;
      } else if (containerObj.viewOnceMessageV2Extension?.message) {
        currentContainer = containerObj.viewOnceMessageV2Extension.message;
      } else if (containerObj.documentWithCaptionMessage?.message) {
        currentContainer = containerObj.documentWithCaptionMessage.message;
      } else {
        break;
      }
    }

    const rawMsg = (msg.message || {}) as Record<string, unknown>;
    const normalized = normalizeMessageContent(currentContainer as never);
    const normalizedContent = (normalized || currentContainer) as Record<string, unknown>;

    const getNested = (obj: unknown, ...keys: string[]): Record<string, unknown> | undefined => {
      let curr = obj;
      for (const k of keys) {
        if (!curr || typeof curr !== "object") return undefined;
        curr = (curr as Record<string, unknown>)[k];
      }
      return curr && typeof curr === "object" ? (curr as Record<string, unknown>) : undefined;
    };

    const documentMsg = (getNested(normalizedContent, "documentMessage") ||
      getNested(normalizedContent, "documentWithCaptionMessage", "message", "documentMessage") ||
      getNested(rawMsg, "documentMessage") ||
      getNested(rawMsg, "documentWithCaptionMessage", "message", "documentMessage") ||
      getNested(currentContainer, "documentMessage")) as { fileName?: string; mimetype?: string } | undefined;

    const imageMsg = (getNested(normalizedContent, "imageMessage") ||
      getNested(normalizedContent, "viewOnceMessage", "message", "imageMessage") ||
      getNested(normalizedContent, "viewOnceMessageV2", "message", "imageMessage") ||
      getNested(rawMsg, "imageMessage") ||
      getNested(rawMsg, "viewOnceMessage", "message", "imageMessage") ||
      getNested(rawMsg, "viewOnceMessageV2", "message", "imageMessage") ||
      getNested(currentContainer, "imageMessage")) as { mimetype?: string } | undefined;


    let senderPhone = "";
    if (
      msg.key.participant &&
      (msg.key.participant.endsWith("@s.whatsapp.net") || msg.key.participant.endsWith("@c.us"))
    ) {
      senderPhone = msg.key.participant.split("@")[0].split(":")[0];
    } else if (remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@c.us")) {
      senderPhone = remoteJid.split("@")[0].split(":")[0];
    } else {
      senderPhone = remoteJid.split("@")[0].split(":")[0];
    }

    const senderName = msg.pushName || "Customer";

    const audioMsg = (getNested(normalizedContent, "audioMessage") ||
      getNested(rawMsg, "audioMessage") ||
      getNested(currentContainer, "audioMessage")) as { mimetype?: string } | undefined;

    const videoMsg = (getNested(normalizedContent, "videoMessage") ||
      getNested(rawMsg, "videoMessage") ||
      getNested(currentContainer, "videoMessage")) as { mimetype?: string } | undefined;

    const stickerMsg = (getNested(normalizedContent, "stickerMessage") ||
      getNested(rawMsg, "stickerMessage") ||
      getNested(currentContainer, "stickerMessage")) as { mimetype?: string } | undefined;

    // Reject non-printable media (audio, video, stickers) immediately
    if (audioMsg || videoMsg || stickerMsg) {
      this.markMessageProcessed(msgId);
      logger.info(
        `Rejected non-printable media (${audioMsg ? "audio" : videoMsg ? "video" : "sticker"}) from ${senderName} (+${senderPhone})`,
      );

      const rejectText = buildWhatsAppMediaRejectReply();

      await this.sendOrQueueReply(remoteJid, senderPhone, rejectText, msg);
      return;
    }

    if (!documentMsg && !imageMsg) {
      const textContent = (
        (normalizedContent?.conversation as string) ||
        ((normalizedContent?.extendedTextMessage as { text?: string })?.text) ||
        (rawMsg?.conversation as string) ||
        ((rawMsg?.extendedTextMessage as { text?: string })?.text) ||
        ""
      ).trim();

      if (textContent) {
        this.markMessageProcessed(msgId);
        await this.handleIncomingTextMessage(remoteJid, senderPhone, senderName, textContent, msg);
      } else {
        logger.debug(`Skipping WhatsApp message ${msgId}: not a document, image, or text`);
      }
      return;
    }

    const rawFilename =
      documentMsg?.fileName ||
      (imageMsg ? `photo_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg` : "document.pdf");
    const filename = rawFilename.replace(/[/\\?%*:|"<>]/g, "_");
    const mimetype = documentMsg?.mimetype || imageMsg?.mimetype || "application/octet-stream";

    // Strictly validate that document/image is PDF, Word (.docx/.doc), or Image
    if (!isSupportedWhatsAppPrintFile(filename, mimetype)) {
      this.markMessageProcessed(msgId);
      logger.info(
        `Rejected unsupported file "${filename}" (mime: ${mimetype}) from ${senderName} (+${senderPhone})`,
      );

      this.pushRecentEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        senderPhone: `+${senderPhone}`,
        senderName,
        filename,
        pageCount: 0,
        configUrl: "",
        status: "error",
        errorMessage:
          "Unsupported format. Please send PDF, Word (.docx/.doc), PowerPoint (.pptx), Excel (.xlsx), or Photos (JPG/PNG).",
      });

      const rejectText = buildWhatsAppFileRejectReply(filename);

      await this.sendOrQueueReply(remoteJid, senderPhone, rejectText, msg);
      return;
    }

    // Mark as processed so we never duplicate
    this.markMessageProcessed(msgId);

    logger.info(
      `Received WhatsApp ${documentMsg ? "document" : "image"} from ${senderName} (+${senderPhone}): "${filename}"`,
    );

    // Anti-ban measure: Simulate human read receipt asynchronously without blocking the message queue
    if (this.socket) {
      const socket = this.socket;
      const key = msg.key;
      setTimeout(
        () => {
          socket.readMessages([key]).catch(() => {});
        },
        500 + Math.random() * 1000,
      );
    }

    const config = loadConfig();
    if (!config.agentToken || !config.serverUrl) {
      logger.warn("Cannot upload WhatsApp document: Windows Agent is not paired with Printiva server.");
      return;
    }

    this.inFlightDownloads.set(remoteJid, (this.inFlightDownloads.get(remoteJid) || 0) + 1);
    const activeBatch = this.pendingBatches.get(remoteJid);
    if (activeBatch?.timer) {
      clearTimeout(activeBatch.timer);
      activeBatch.timer = setTimeout(() => {
        void this.flushBatch(remoteJid);
      }, 3000);
    }

    try {
      // 1. Download media stream from WhatsApp message
      let mediaBuffer: Buffer;
      try {
        mediaBuffer = (await downloadMediaMessage(msg, "buffer", {})) as Buffer;
      } catch (dlErr) {
        logger.debug("Primary downloadMediaMessage failed, trying with normalized message container...", {
          error: dlErr,
        });
        mediaBuffer = (await downloadMediaMessage({ ...msg, message: normalizedContent }, "buffer", {})) as Buffer;
      }

      if (!mediaBuffer || mediaBuffer.length === 0) {
        throw new Error("Empty media attachment.");
      }

      const mimetype = documentMsg?.mimetype || imageMsg?.mimetype || "application/octet-stream";

      // 2. Queue into sender batch with debounce window (3.0s) to bundle multiple images/PDFs into ONE order
      const DEBOUNCE_MS = 3000;
      const MAX_BATCH_WAIT_MS = 30000;
      const existingBatch = this.pendingBatches.get(remoteJid) || this.retryBatches.get(remoteJid);
      const now = Date.now();

      // Emit composing presence indicator immediately so customer sees "typing..." right away
      if (this.socket) {
        void this.socket.sendPresenceUpdate("composing", remoteJid).catch(() => {});
      }

      if (existingBatch) {
        if (existingBatch.timer) {
          clearTimeout(existingBatch.timer);
        }
        if (this.retryBatches.has(remoteJid)) {
          this.retryBatches.delete(remoteJid);
          this.deleteBatchFromDisk(remoteJid);
          existingBatch.retryCount = 0;
          existingBatch.nextRetryAt = 0;
        }
        existingBatch.attachments.push({ msg, mediaBuffer, filename, mimetype });
        existingBatch.lastMessage = msg;
        existingBatch.senderName = senderName;
        existingBatch.senderPhone = senderPhone;

        const elapsed = now - (existingBatch.firstQueuedAt || now);
        const remainingMax = Math.max(1000, MAX_BATCH_WAIT_MS - elapsed);
        const delay = Math.min(DEBOUNCE_MS, remainingMax);

        existingBatch.timer = setTimeout(() => {
          void this.flushBatch(remoteJid);
        }, delay);
        this.pendingBatches.set(remoteJid, existingBatch);
        logger.info(
          `Added "${filename}" to pending batch for +${senderPhone} (${existingBatch.attachments.length} files queued, waiting ${delay}ms).`,
        );
      } else {
        const newBatch: PendingSenderBatch = {
          senderPhone,
          senderName,
          remoteJid,
          attachments: [{ msg, mediaBuffer, filename, mimetype }],
          lastMessage: msg,
          firstQueuedAt: now,
          timer: setTimeout(() => {
            void this.flushBatch(remoteJid);
          }, DEBOUNCE_MS),
        };
        this.pendingBatches.set(remoteJid, newBatch);
        logger.info(
          `Started new batch for +${senderPhone} with "${filename}". Waiting ${DEBOUNCE_MS / 1000}s for consecutive files...`,
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Media download failed";
      logger.error(`Failed to download WhatsApp attachment from +${senderPhone}:`, { error: errorMsg });
      this.pushRecentEvent({
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        senderPhone: `+${senderPhone}`,
        senderName,
        filename,
        pageCount: 0,
        configUrl: "",
        status: "error",
        errorMessage: "Could not download file from WhatsApp",
      });
      await this.sendOrQueueReply(
        remoteJid,
        senderPhone,
        buildWhatsAppDownloadErrorReply(filename),
        msg,
      );
    } finally {
      const remaining = (this.inFlightDownloads.get(remoteJid) || 1) - 1;
      if (remaining <= 0) {
        this.inFlightDownloads.delete(remoteJid);
      } else {
        this.inFlightDownloads.set(remoteJid, remaining);
      }
    }
  }

  /**
   * Handles plain text messages (greetings, inquiries, "bhaiya print karna hai").
   * Provides helpful shop instructions and pending links with a 15-minute anti-spam throttle.
   */
  private async handleIncomingTextMessage(
    remoteJid: string,
    senderPhone: string,
    senderName: string,
    _textContent: string,
    msg: WAMessage,
  ): Promise<void> {
    if (
      remoteJid.endsWith("@g.us") ||
      remoteJid.endsWith("@broadcast") ||
      remoteJid === "status@broadcast"
    ) {
      return;
    }

    // Anti-spam safety: limit automatic text replies to once every 15 minutes per customer
    const lastReply = this.lastTextReplyBySender.get(senderPhone) || 0;
    if (Date.now() - lastReply < 15 * 60 * 1000) {
      logger.debug(`Skipping auto text reply for +${senderPhone}: rate limit cooldown active`);
      return;
    }

    const now = Date.now();
    this.lastTextReplyBySender.set(senderPhone, now);
    if (this.lastTextReplyBySender.size > 500) {
      const cutoff = now - 30 * 60 * 1000;
      for (const [phone, ts] of this.lastTextReplyBySender.entries()) {
        if (ts < cutoff) this.lastTextReplyBySender.delete(phone);
      }
      while (this.lastTextReplyBySender.size > 500) {
        const oldest = this.lastTextReplyBySender.keys().next().value;
        if (!oldest) break;
        this.lastTextReplyBySender.delete(oldest);
      }
    }

    // Check if customer has an existing successful upload in recent events
    const recentSuccess = this.recentEvents.find(
      (ev) => ev.senderPhone === `+${senderPhone}` && ev.status === "success" && ev.configUrl,
    );

    const config = loadConfig();
    const replyText = buildWhatsAppTextReply({
      shopName: config.shopName,
      activeConfigUrl: recentSuccess?.configUrl,
    });

    await this.sendOrQueueReply(remoteJid, senderPhone, replyText, msg);
  }

  /**
   * Flushes the batched documents for a sender: uploads all files into ONE draft order
   * and sends a single clean configuration link.
   */
  private async flushBatch(remoteJid: string): Promise<void> {
    if (this.activeFlushes.has(remoteJid) || (this.inFlightDownloads.get(remoteJid) || 0) > 0) {
      // If a flush or download is currently in flight for this sender, reschedule
      const batch = this.pendingBatches.get(remoteJid);
      if (batch) {
        clearTimeout(batch.timer);
        batch.timer = setTimeout(() => void this.flushBatch(remoteJid), 1200);
      }
      return;
    }

    const batch = this.pendingBatches.get(remoteJid);
    if (!batch || batch.attachments.length === 0) return;
    this.pendingBatches.delete(remoteJid);
    this.activeFlushes.add(remoteJid);

    await this.executeBatchUpload(batch);
  }

  /**
   * Executes the upload and registration for a batch.
   * If a transient network outage occurs (e.g. internet down for 1 min),
   * this method queues the batch in `retryBatches` instead of marking it failed.
   */
  private async executeBatchUpload(batch: PendingSenderBatch): Promise<void> {
    const { senderPhone, senderName, remoteJid, attachments, lastMessage } = batch;
    const config = loadConfig();

    if (!config.agentToken || !config.serverUrl) {
      this.activeFlushes.delete(remoteJid);
      logger.warn(`Cannot process WhatsApp batch from +${senderPhone}: Agent is not registered with Printiva server.`);
      return;
    }

    try {
      const serverUrl = config.serverUrl.replace(/\/+$/, "");
      const uploadUrl = `${serverUrl}/api/agent/whatsapp-upload`;

      // Upload batch files in chunks of up to 15 to avoid 4.5MB payload limit on fallback
      const CHUNK_SIZE = 15;
      const chunks: PendingWhatsAppAttachment[][] = [];
      for (let i = 0; i < attachments.length; i += CHUNK_SIZE) {
        chunks.push(attachments.slice(i, i + CHUNK_SIZE));
      }

      logger.info(
        `Uploading batch of ${attachments.length} document(s) for +${senderPhone} in ${chunks.length} chunk(s) (max ${CHUNK_SIZE}/order)...`,
      );

      const chunkResults: Array<{
        configUrl: string;
        documents: Array<{ id: string; filename: string; pageCount: number }>;
      }> = [];

      const skippedFiles: Array<{ filename: string; reason: string }> = [];

      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk = chunks[chunkIdx];
        let chunkResult: {
          configUrl: string;
          documents: Array<{ id: string; filename: string; pageCount: number }>;
        } | null = null;

        // 1. Local-First Processing (Zero Cloud Upload, Instant SSD Print Execution)
        // Bound conversion/rendering concurrency to 2 workers so batch bursts never spike CPU/RAM on shop PCs.
        try {
          const MAX_WA_PROCESS_CONCURRENCY = 2;
          const settledResults: Array<PromiseSettledResult<ProcessedLocalDocument>> = new Array(chunk.length);
          let nextAttIdx = 0;
          await Promise.all(
            Array.from({ length: Math.min(MAX_WA_PROCESS_CONCURRENCY, chunk.length) }, async () => {
              while (nextAttIdx < chunk.length) {
                const idx = nextAttIdx++;
                const att = chunk[idx];
                try {
                  const value = await processAndCacheDocument(att.mediaBuffer, att.filename, att.mimetype);
                  settledResults[idx] = { status: "fulfilled", value };
                } catch (reason) {
                  settledResults[idx] = { status: "rejected", reason };
                }
              }
            }),
          );

          const successfulDocs: ProcessedLocalDocument[] = [];
          settledResults.forEach((res, idx) => {
            if (res.status === "fulfilled") {
              successfulDocs.push(res.value);
            } else {
              const err = res.reason;
              const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
              let reason = "File damaged or format not supported";
              if (msg.includes("password") || msg.includes("encrypted")) {
                reason = "Password-protected (please unlock before sending)";
              } else if (msg.includes("unsupported")) {
                reason = "Unsupported format (send PDF, Word, or photo)";
              } else if (msg.includes("too large") || msg.includes("413")) {
                reason = "File too large";
              }
              skippedFiles.push({ filename: chunk[idx].filename, reason });
              logger.warn(`Skipping unprocessable file "${chunk[idx].filename}": ${reason}`);
            }
          });

          if (successfulDocs.length > 0) {
            const registerUrl = `${serverUrl}/api/agent/whatsapp-upload/register-local`;
            const registerRes = await fetch(registerUrl, {
              method: "POST",
              headers: {
                "x-agent-token": config.agentToken,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                customerPhone: senderPhone,
                customerName: senderName,
                documents: successfulDocs.map((d) => ({
                  id: d.id,
                  filename: d.filename,
                  pageCount: d.pageCount,
                  sizeBytes: d.sizeBytes,
                  previewBase64: d.previewBase64,
                })),
              }),
            });

            if (registerRes.ok) {
              const regData = await registerRes.json();
              chunkResult = {
                configUrl: regData.configUrl,
                documents: regData.documents || [],
              };
              // Release raw incoming media buffers once cached & registered to keep i3 RAM low
              for (const att of chunk) {
                att.mediaBuffer = Buffer.alloc(0);
              }
              logger.info(
                `⚡ Local-First Success: Registered ${successfulDocs.length} file(s) locally. Zero cloud bandwidth used.`,
              );

              // Double-check previews: if any document did not get its preview uploaded in register-local,
              // asynchronously push the preview thumbnail directly to ensure the mobile customer sees it immediately.
              for (const sDoc of successfulDocs) {
                const regDoc = (regData.documents || []).find(
                  (d: { id: string; hasPreview?: boolean }) => d.id === sDoc.id,
                );
                if (sDoc.previewBase64 && (!regDoc || !regDoc.hasPreview)) {
                  void fetch(`${serverUrl}/api/agent/whatsapp-upload/preview-image`, {
                    method: "POST",
                    headers: {
                      "x-agent-token": config.agentToken,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      orderId: regData.orderId,
                      documentId: sDoc.id,
                      previewBase64: sDoc.previewBase64,
                    }),
                  }).catch((err) => {
                    logger.debug(`Background preview-image upload fallback failed for ${sDoc.id}:`, { error: err });
                  });
                }
              }
            } else {
              logger.warn(`register-local returned HTTP ${registerRes.status}, falling back to cloud upload...`);
            }
          }
        } catch (localErr) {
          if (isNetworkError(localErr)) {
            // Rethrow network errors so the batch retry mechanism captures this outage
            throw localErr;
          }
          logger.warn("Local-first processing attempt failed, trying cloud upload fallback:", { error: localErr });
        }

        // 2. Direct Presigned Supabase Storage upload fallback (if local registration failed)
        if (!chunkResult) {
          try {
            const presignUrl = `${serverUrl}/api/agent/whatsapp-upload/presign`;
            const presignRes = await fetch(presignUrl, {
              method: "POST",
              headers: {
                "x-agent-token": config.agentToken,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                customerPhone: senderPhone,
                customerName: senderName,
                files: chunk.map((att) => ({
                  filename: att.filename,
                  sizeBytes: att.mediaBuffer.length,
                  mimetype: att.mimetype,
                })),
              }),
            });

            if (presignRes.ok) {
              const presignData = await presignRes.json();
              const { orderId, guestToken, uploads } = presignData;

              if (Array.isArray(uploads) && uploads.length === chunk.length) {
                // Upload each binary attachment directly to Supabase Storage signed URL in parallel
                await Promise.all(
                  chunk.map(async (att, idx) => {
                    const uploadInfo = uploads[idx];
                    const uploadRes = await fetch(uploadInfo.signedUrl, {
                      method: "PUT",
                      headers: {
                        "Content-Type": att.mimetype || "application/octet-stream",
                      },
                      body: new Uint8Array(att.mediaBuffer),
                    });

                    if (!uploadRes.ok) {
                      throw new Error(`Storage upload failed for ${att.filename} (HTTP ${uploadRes.status})`);
                    }
                  }),
                );

                // Finalize document processing & page counting on server
                const completeUrl = `${serverUrl}/api/agent/whatsapp-upload/complete`;
                const completeRes = await fetch(completeUrl, {
                  method: "POST",
                  headers: {
                    "x-agent-token": config.agentToken,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    orderId,
                    guestToken,
                    customerPhone: senderPhone,
                    customerName: senderName,
                    documents: uploads.map(
                      (u: { documentId: string; filename: string; storagePath: string }, idx: number) => ({
                        id: u.documentId,
                        filename: u.filename,
                        storagePath: u.storagePath,
                        mimetype: chunk[idx]?.mimetype || "application/octet-stream",
                      }),
                    ),
                  }),
                });

                if (!completeRes.ok) {
                  const errBody = await completeRes.json().catch(() => ({}));
                  const err = new Error(errBody.error || `Document finalization failed (HTTP ${completeRes.status})`);
                  if (completeRes.status >= 400 && completeRes.status < 500) {
                    (err as Error & { permanentUploadFailure?: boolean }).permanentUploadFailure = true;
                  }
                  throw err;
                }
                const compData = await completeRes.json();
                chunkResult = {
                  configUrl: compData.configUrl,
                  documents: compData.documents || [],
                };
              }
            }
          } catch (presignErr) {
            if (isNetworkError(presignErr) || (presignErr as Error & { permanentUploadFailure?: boolean })?.permanentUploadFailure) {
              throw presignErr;
            }
            logger.warn("Presigned direct storage upload attempt failed, trying multipart fallback:", {
              error: presignErr,
            });
          }
        }

        // 3. Fallback to standard multipart upload if presign was not available
        if (!chunkResult) {
          const formData = new FormData();
          for (const att of chunk) {
            const blob = new Blob([att.mediaBuffer as unknown as BlobPart], { type: att.mimetype });
            formData.append("files", blob, att.filename);
          }
          formData.append("customerPhone", senderPhone);
          formData.append("customerName", senderName);

          const tmpRes = new Response(formData);
          const bodyBuffer = await tmpRes.arrayBuffer();
          const contentType = tmpRes.headers.get("Content-Type") || "multipart/form-data";

          const response = await fetch(uploadUrl, {
            method: "POST",
            headers: {
              "x-agent-token": config.agentToken,
              "Content-Type": contentType,
              "Content-Length": bodyBuffer.byteLength.toString(),
            },
            body: bodyBuffer,
          });

          if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error || `Server returned HTTP ${response.status}`);
          }

          const result = await response.json();
          chunkResult = {
            configUrl: result.configUrl,
            documents: result.documents || (result.document ? [result.document] : []),
          };
        }

        chunkResults.push(chunkResult);

        for (const d of chunkResult.documents) {
          // If this sender had a 'retrying' event in recentEvents, update it in place to 'success'
          const existingEvent = this.recentEvents.find(
            (ev) =>
              ev.senderPhone === `+${senderPhone}` &&
              (ev.filename === d.filename || ev.status === "retrying"),
          );
          if (existingEvent) {
            existingEvent.status = "success";
            existingEvent.configUrl = chunkResult.configUrl;
            existingEvent.pageCount = d.pageCount;
            existingEvent.filename = d.filename;
            existingEvent.timestamp = new Date().toLocaleTimeString();
            existingEvent.errorMessage = undefined;
          } else {
            this.pushRecentEvent({
              id: crypto.randomUUID(),
              timestamp: new Date().toLocaleTimeString(),
              senderPhone: `+${senderPhone}`,
              senderName,
              filename: d.filename,
              pageCount: d.pageCount,
              configUrl: chunkResult.configUrl,
              status: "success",
            });
          }
        }

        // Clean up any remaining stale "retrying" events for this sender that were superseded by this successful batch
        for (const ev of this.recentEvents) {
          if (ev.senderPhone === `+${senderPhone}` && ev.status === "retrying") {
            ev.status = "success";
            ev.configUrl = chunkResult.configUrl;
            ev.errorMessage = undefined;
          }
        }
      }

      // If none of the files in any chunk succeeded:
      if (chunkResults.length === 0) {
        const failureText = buildWhatsAppBatchFailureReply(skippedFiles);
        this.retryBatches.delete(remoteJid);
        this.deleteBatchFromDisk(remoteJid);

        for (const f of skippedFiles) {
          this.pushRecentEvent({
            id: crypto.randomUUID(),
            timestamp: new Date().toLocaleTimeString(),
            senderPhone: `+${senderPhone}`,
            senderName,
            filename: f.filename,
            pageCount: 0,
            configUrl: "",
            status: "error",
            errorMessage: f.reason,
          });
        }

        await this.sendOrQueueReply(remoteJid, senderPhone, failureText, lastMessage);
        return;
      }

      // Successful batch processing - remove from retryBatches and disk
      this.retryBatches.delete(remoteJid);
      this.deleteBatchFromDisk(remoteJid);

      for (const f of skippedFiles) {
        this.pushRecentEvent({
          id: crypto.randomUUID(),
          timestamp: new Date().toLocaleTimeString(),
          senderPhone: `+${senderPhone}`,
          senderName,
          filename: f.filename,
          pageCount: 0,
          configUrl: "",
          status: "error",
          errorMessage: f.reason,
        });
      }

      const replyText = buildWhatsAppBatchSuccessReply({
        shopName: config.shopName,
        chunks: chunkResults,
        skippedFiles,
      });

      // Dispatch reply or queue it if socket is momentarily disconnected
      await this.sendOrQueueReply(remoteJid, senderPhone, replyText, lastMessage);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Upload processing failed";
      const isTransientNetwork = isNetworkError(err);

      if (isTransientNetwork) {
        batch.retryCount = (batch.retryCount || 0) + 1;
        const maxRetries = 15;

        if (batch.retryCount <= maxRetries) {
          const backoffDelay = Math.min(3000 * Math.pow(1.4, batch.retryCount), 30000);
          batch.nextRetryAt = Date.now() + backoffDelay;
          this.retryBatches.set(remoteJid, batch);
          this.saveBatchToDisk(batch);

          // Update recentEvents to show "Retrying (Offline)"
          for (const att of attachments) {
            const existingEvent = this.recentEvents.find(
              (ev) => ev.senderPhone === `+${senderPhone}` && ev.filename === att.filename,
            );
            if (existingEvent) {
              existingEvent.status = "retrying";
              existingEvent.errorMessage = "Internet connection dropped. Auto-retrying when back online...";
            } else {
              this.pushRecentEvent({
                id: crypto.randomUUID(),
                timestamp: new Date().toLocaleTimeString(),
                senderPhone: `+${senderPhone}`,
                senderName,
                filename: att.filename,
                pageCount: 0,
                configUrl: "",
                status: "retrying",
                errorMessage: "Internet connection dropped. Auto-retrying when back online...",
              });
            }
          }

          logger.warn(
            `Temporary network drop while registering files for +${senderPhone}. Batch saved locally on SSD. Will retry in ${Math.round(backoffDelay / 1000)}s (attempt ${batch.retryCount}/${maxRetries}).`,
          );

          this.scheduleRetryQueue();
          return;
        }

        logger.error(`Max network retries (${maxRetries}) reached for +${senderPhone}. Marking batch as failed.`);
      } else {
        logger.error(`Failed to process WhatsApp batch from +${senderPhone} (permanent error):`, { error: errorMsg });
      }

      // Permanent failure or max retries exceeded
      this.retryBatches.delete(remoteJid);
      this.deleteBatchFromDisk(remoteJid);

      for (const att of attachments) {
        const existingEvent = this.recentEvents.find(
          (ev) => ev.senderPhone === `+${senderPhone}` && ev.filename === att.filename,
        );
        if (existingEvent) {
          existingEvent.status = "error";
          existingEvent.errorMessage = errorMsg;
        } else {
          this.pushRecentEvent({
            id: crypto.randomUUID(),
            timestamp: new Date().toLocaleTimeString(),
            senderPhone: `+${senderPhone}`,
            senderName,
            filename: att.filename,
            pageCount: 0,
            configUrl: "",
            status: "error",
            errorMessage: errorMsg,
          });
        }
      }

      const fallbackText = buildWhatsAppFallbackErrorReply(errorMsg, isTransientNetwork);

      await this.sendOrQueueReply(remoteJid, senderPhone, fallbackText, lastMessage);
    } finally {
      this.activeFlushes.delete(remoteJid);
      // If new attachments arrived while uploading, schedule flush
      if (this.pendingBatches.has(remoteJid)) {
        const remainingBatch = this.pendingBatches.get(remoteJid);
        if (remainingBatch) {
          clearTimeout(remainingBatch.timer);
          remainingBatch.timer = setTimeout(() => void this.flushBatch(remoteJid), 1200);
        }
      }
    }
  }

  /**
   * Enqueues a reply into the serialized outbound queue to ensure safe delivery,
   * natural typing presence, and adaptive pacing under high concurrent load (prevents Meta bans).
   */
  private async sendOrQueueReply(
    remoteJid: string,
    senderPhone: string,
    replyText: string,
    lastMessage?: WAMessage,
  ): Promise<void> {
    if (this.outboundReplyQueue.length >= 200) {
      this.outboundReplyQueue.shift();
    }
    this.outboundReplyQueue.push({ remoteJid, senderPhone, replyText, lastMessage });
    void this.drainOutboundReplyQueue();
  }

  private async drainOutboundReplyQueue(): Promise<void> {
    if (this.isDrainingOutboundQueue) return;
    this.isDrainingOutboundQueue = true;

    try {
      while (this.outboundReplyQueue.length > 0) {
        if (!this.socket || this.state !== "connected") {
          logger.info(
            `WhatsApp socket offline; queued ${this.outboundReplyQueue.length} reply(ies) for reconnect delivery.`,
          );
          this.pendingRepliesQueue.push(...this.outboundReplyQueue.splice(0, this.outboundReplyQueue.length));
          if (this.pendingRepliesQueue.length > 200) {
            this.pendingRepliesQueue.splice(0, this.pendingRepliesQueue.length - 200);
          }
          this.scheduleRetryQueue();
          break;
        }

        const item = this.outboundReplyQueue.shift();
        if (!item) break;

        const { remoteJid, senderPhone, replyText, lastMessage } = item;

        try {
          // Anti-ban protections:
          // 1. Send blue tick read-receipt so Meta telemetry sees message was opened
          if (lastMessage?.key?.id) {
            try {
              await this.socket.readMessages([lastMessage.key]);
            } catch {
              // ignore
            }
          }

          // 2. Natural typing presence update (200ms - 350ms)
          try {
            await this.socket.sendPresenceUpdate("composing", remoteJid);
            const humanDelay = Math.floor(Math.random() * 150) + 200;
            await new Promise((resolve) => setTimeout(resolve, humanDelay));
            await this.socket.sendPresenceUpdate("paused", remoteJid);
          } catch {
            // ignore
          }

          // 3. Dispatch message
          const quotedOption = lastMessage?.key?.id ? { quoted: lastMessage } : undefined;
          try {
            await this.socket.sendMessage(remoteJid, { text: replyText }, quotedOption);
            logger.info(`Sent Printiva reply to +${senderPhone}${quotedOption ? " (quoted)" : " (direct)"}`);
          } catch (sendErr) {
            logger.warn(`Quoted reply failed, trying direct reply to ${remoteJid}:`, { error: sendErr });
            await this.socket.sendMessage(remoteJid, { text: replyText });
            logger.info(`Sent Printiva reply to +${senderPhone} (direct fallback)`);
          }

          // 4. Adaptive pacing delay between different recipients
          if (this.outboundReplyQueue.length > 0) {
            // Under heavy queue backlog (> 10 items), pace briskly at 250ms so users get links quickly.
            // Under normal load, pace gently at 500ms.
            const interDelay = this.outboundReplyQueue.length > 10 ? 250 : 500;
            await new Promise((resolve) => setTimeout(resolve, interDelay));
          }
        } catch (socketErr) {
          logger.warn(`Failed to dispatch WhatsApp message to +${senderPhone} (socket drop); queued for reconnect retry:`, {
            error: socketErr,
          });
          this.pendingRepliesQueue.push(item);
          this.scheduleRetryQueue();
        }
      }
    } finally {
      this.isDrainingOutboundQueue = false;
    }
  }

  /**
   * Schedules the next run of processRetryQueue based on earliest nextRetryAt
   * or pending outbound replies that need draining.
   */
  private scheduleRetryQueue(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.retryBatches.size === 0 && this.pendingRepliesQueue.length === 0) return;

    let earliest = Infinity;
    if (this.pendingRepliesQueue.length > 0) {
      // If there are pending replies queued, recheck and drain briskly
      earliest = Date.now() + 2000;
    }

    for (const batch of this.retryBatches.values()) {
      if (batch.nextRetryAt && batch.nextRetryAt < earliest) {
        earliest = batch.nextRetryAt;
      }
    }

    const waitMs = Math.max(1000, earliest - Date.now());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.processRetryQueue();
    }, waitMs);
  }

  /**
   * Drains the pending reply queue and retries any offline batches.
   * Called on timer or immediately when WhatsApp / network connects ('connection === open').
   */
  public async processRetryQueue(forceNow = false): Promise<void> {
    // 1. Drain pending replies if socket is ready
    if (this.socket && this.state === "connected" && this.pendingRepliesQueue.length > 0) {
      logger.info(`Delivering ${this.pendingRepliesQueue.length} queued offline WhatsApp reply message(s)...`);
      const queuedReplies = [...this.pendingRepliesQueue];
      this.pendingRepliesQueue = [];

      for (const item of queuedReplies) {
        try {
          await this.sendOrQueueReply(item.remoteJid, item.senderPhone, item.replyText, item.lastMessage);
        } catch {
          // sendOrQueueReply handles re-queueing if socket dropped again
        }
      }
    }

    // 2. Process retryBatches
    if (this.retryBatches.size === 0) return;

    const now = Date.now();
    const batchesToRun: PendingSenderBatch[] = [];

    for (const [remoteJid, batch] of Array.from(this.retryBatches.entries())) {
      if (this.activeFlushes.has(remoteJid)) continue;
      if (forceNow || !batch.nextRetryAt || now >= batch.nextRetryAt) {
        batchesToRun.push(batch);
      }
    }

    for (const batch of batchesToRun) {
      if (this.activeFlushes.has(batch.remoteJid)) continue;
      this.activeFlushes.add(batch.remoteJid);
      logger.info(
        `Retrying offline batch for +${batch.senderPhone} (${batch.attachments.length} files, attempt #${batch.retryCount || 1})...`,
      );
      void this.executeBatchUpload(batch);
    }

    this.scheduleRetryQueue();
  }
}

export const whatsAppAgent = new WhatsAppAgentService();
