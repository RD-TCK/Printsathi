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
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import { loadConfig, getConfigDirectory } from "./config";
import { logger } from "./logger";

export interface WhatsAppEvent {
  id: string;
  timestamp: string;
  senderPhone: string;
  senderName: string;
  filename: string;
  pageCount: number;
  configUrl: string;
  status: "success" | "error";
  errorMessage?: string;
}

export interface WhatsAppStatus {
  state: "disconnected" | "connecting" | "qr_ready" | "connected";
  connectedPhone: string | null;
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
  timer: NodeJS.Timeout;
  lastMessage: WAMessage;
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

  // Multi-document batching: group rapid consecutive photos/PDFs from the same sender into ONE order
  private pendingBatches: Map<string, PendingSenderBatch> = new Map();

  // Anti-ban safety: track timestamps of replies to prevent rapid multi-burst spam
  private lastReplyTimeBySender: Map<string, number> = new Map();
  private processedMessageIds: Set<string> = new Set();

  private customAuthDir?: string;

  constructor(customAuthDir?: string) {
    this.customAuthDir = customAuthDir;
  }

  private getAuthDirectory(): string {
    const dir = this.customAuthDir || path.join(getConfigDirectory(), "whatsapp_auth");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public getStatus(): WhatsAppStatus {
    return {
      state: this.state,
      connectedPhone: this.connectedPhone,
      qrCodeDataUrl: this.qrCodeDataUrl,
      lastError: this.lastError,
      recentEvents: this.recentEvents.slice(0, 20),
    };
  }

  public async start(onlyIfSavedSession = false): Promise<void> {
    const authDir = this.getAuthDirectory();
    const credsFile = path.join(authDir, "creds.json");
    const hasExistingSession = fs.existsSync(credsFile);

    if (onlyIfSavedSession && !hasExistingSession) {
      logger.info("WhatsApp background start skipped: No paired session exists yet.");
      this.state = "disconnected";
      return;
    }

    if (this.state === "connecting" || this.state === "connected") {
      return;
    }

    this.isIntentionalStop = false;
    this.state = "connecting";
    this.lastError = null;
    this.qrCodeDataUrl = null;

    try {
      // Baileys multi-file auth helper is not a React hook
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);
      const { version } = await fetchLatestBaileysVersion();

      // Standard WhatsApp Web browser signature for flawless mobile QR pairing
      const sock = makeWASocket({
        version,
        auth: authState,
        printQRInTerminal: false,
        browser: ["Printiva Desktop", "Chrome", "1.7.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        generateHighQualityLinkPreview: false,
      });

      this.socket = sock;

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update) => {
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

          const userJid = sock.user?.id || "";
          const phone = userJid.split(":")[0]?.replace("@s.whatsapp.net", "") || userJid;
          this.connectedPhone = phone;
          logger.info(`WhatsApp agent connected successfully as ${this.connectedPhone}`);
        }

        if (connection === "close") {
          const errObj = lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
          const statusCode = errObj?.output?.statusCode;
          const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

          logger.warn(`WhatsApp connection closed (statusCode=${statusCode}, isRestartRequired=${isRestartRequired}, isLoggedOut=${isLoggedOut})`);

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
            setTimeout(() => {
              if (!this.isIntentionalStop) {
                void this.start(false);
              }
            }, 800);
            return;
          }

          if (!this.isIntentionalStop) {
            this.state = "disconnected";
            this.reconnectAttempts += 1;
            const backoffMs = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30000);
            logger.info(`Reconnecting WhatsApp in ${Math.round(backoffMs / 1000)}s (attempt ${this.reconnectAttempts})...`);
            setTimeout(() => {
              if (!this.isIntentionalStop) {
                void this.start(true);
              }
            }, backoffMs);
          }
        }
      });

      sock.ev.on("messages.upsert", async ({ messages, type }) => {
        logger.debug(`WhatsApp messages.upsert event: ${messages.length} message(s), type=${type}`);
        for (const msg of messages) {
          await this.handleIncomingMessage(msg);
        }
      });
    } catch (error) {
      this.state = "disconnected";
      this.lastError = error instanceof Error ? error.message : "Failed to start WhatsApp connector";
      logger.error("Error starting WhatsApp client:", { error: this.lastError });
    }
  }

  public async disconnect(): Promise<void> {
    this.isIntentionalStop = true;

    // Clear any pending batch timers
    for (const batch of this.pendingBatches.values()) {
      clearTimeout(batch.timer);
    }
    this.pendingBatches.clear();

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
    await this.clearSession();
    this.state = "disconnected";
    this.connectedPhone = null;
    this.qrCodeDataUrl = null;
    this.reconnectAttempts = 0;
    this.lastReplyTimeBySender.clear();
    this.processedMessageIds.clear();
    logger.info("WhatsApp agent disconnected and session cleared.");
  }

  private async clearSession(): Promise<void> {
    const authDir = this.getAuthDirectory();
    try {
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
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
    const isBroadcast = isJidBroadcast(remoteJid) || isJidStatusBroadcast(remoteJid) || remoteJid.endsWith("@broadcast");
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

    const documentMsg = (
      getNested(normalizedContent, "documentMessage") ||
      getNested(normalizedContent, "documentWithCaptionMessage", "message", "documentMessage") ||
      getNested(rawMsg, "documentMessage") ||
      getNested(rawMsg, "documentWithCaptionMessage", "message", "documentMessage") ||
      getNested(currentContainer, "documentMessage")
    ) as { fileName?: string; mimetype?: string } | undefined;

    const imageMsg = (
      getNested(normalizedContent, "imageMessage") ||
      getNested(normalizedContent, "viewOnceMessage", "message", "imageMessage") ||
      getNested(normalizedContent, "viewOnceMessageV2", "message", "imageMessage") ||
      getNested(rawMsg, "imageMessage") ||
      getNested(rawMsg, "viewOnceMessage", "message", "imageMessage") ||
      getNested(rawMsg, "viewOnceMessageV2", "message", "imageMessage") ||
      getNested(currentContainer, "imageMessage")
    ) as { mimetype?: string } | undefined;

    if (!documentMsg && !imageMsg) {
      logger.debug(`Skipping WhatsApp message ${msgId}: not a document or image`);
      return;
    }

    // Mark as processed so we never duplicate
    this.processedMessageIds.add(msgId);
    if (this.processedMessageIds.size > 1000) {
      const firstEntries = Array.from(this.processedMessageIds).slice(0, 300);
      for (const id of firstEntries) {
        this.processedMessageIds.delete(id);
      }
    }

    let senderPhone = "";
    if (msg.key.participant && (msg.key.participant.endsWith("@s.whatsapp.net") || msg.key.participant.endsWith("@c.us"))) {
      senderPhone = msg.key.participant.split("@")[0].split(":")[0];
    } else if (remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@c.us")) {
      senderPhone = remoteJid.split("@")[0].split(":")[0];
    } else {
      senderPhone = remoteJid.split("@")[0].split(":")[0];
    }

    const senderName = msg.pushName || "Customer";
    const rawFilename =
      documentMsg?.fileName || (imageMsg ? `photo_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg` : "document.pdf");
    const filename = rawFilename.replace(/[/\\?%*:|"<>]/g, "_");

    logger.info(
      `Received WhatsApp ${documentMsg ? "document" : "image"} from ${senderName} (+${senderPhone}): "${filename}"`
    );

    // Anti-ban measure 4: Simulate human read receipt (mark message as read)
    if (this.socket) {
      try {
        await this.socket.readMessages([msg.key]);
      } catch {
        // ignore
      }
    }

    // Anti-ban measure 5: Simulate realistic typing presence ("typing...")
    if (this.socket) {
      try {
        await this.socket.sendPresenceUpdate("composing", remoteJid);
      } catch {
        // ignore
      }
    }

    const config = loadConfig();
    if (!config.agentToken || !config.serverUrl) {
      logger.warn("Cannot upload WhatsApp document: Windows Agent is not paired with Printiva server.");
      return;
    }

    try {
      // 1. Download media stream from WhatsApp message
      let mediaBuffer: Buffer;
      try {
        mediaBuffer = (await downloadMediaMessage(msg, "buffer", {})) as Buffer;
      } catch (dlErr) {
        logger.debug("Primary downloadMediaMessage failed, trying with normalized message container...", { error: dlErr });
        mediaBuffer = (await downloadMediaMessage(
          { ...msg, message: normalizedContent },
          "buffer",
          {}
        )) as Buffer;
      }

      if (!mediaBuffer || mediaBuffer.length === 0) {
        throw new Error("Empty media attachment.");
      }

      const mimetype = documentMsg?.mimetype || imageMsg?.mimetype || "application/octet-stream";

      // 2. Queue into sender batch with debounce window (1.2s) to bundle multiple images/PDFs into ONE order
      const existingBatch = this.pendingBatches.get(remoteJid);
      if (existingBatch) {
        clearTimeout(existingBatch.timer);
        existingBatch.attachments.push({ msg, mediaBuffer, filename, mimetype });
        existingBatch.lastMessage = msg;
        existingBatch.senderName = senderName;
        existingBatch.senderPhone = senderPhone;
        existingBatch.timer = setTimeout(() => {
          void this.flushBatch(remoteJid);
        }, 1200);
        logger.info(`Added "${filename}" to pending batch for +${senderPhone} (${existingBatch.attachments.length} files queued).`);
      } else {
        const newBatch: PendingSenderBatch = {
          senderPhone,
          senderName,
          remoteJid,
          attachments: [{ msg, mediaBuffer, filename, mimetype }],
          lastMessage: msg,
          timer: setTimeout(() => {
            void this.flushBatch(remoteJid);
          }, 1200),
        };
        this.pendingBatches.set(remoteJid, newBatch);
        logger.info(`Started new batch for +${senderPhone} with "${filename}". Waiting 1.2s for consecutive files...`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Media download failed";
      logger.error(`Failed to download WhatsApp attachment from +${senderPhone}:`, { error: errorMsg });
    }
  }

  /**
   * Flushes the batched documents for a sender: uploads all files (split in chunks of up to 5)
   * and sends clear configuration link(s).
   */
  private async flushBatch(remoteJid: string): Promise<void> {
    const batch = this.pendingBatches.get(remoteJid);
    if (!batch || batch.attachments.length === 0) return;
    this.pendingBatches.delete(remoteJid);

    const config = loadConfig();
    if (!config.agentToken || !config.serverUrl) return;

    const { senderPhone, senderName, attachments, lastMessage } = batch;

    try {
      const serverUrl = config.serverUrl.replace(/\/+$/, "");
      const uploadUrl = `${serverUrl}/api/agent/whatsapp-upload`;

      // Split files into chunks of maximum 10 files per draft order to ensure optimal upload limits
      const CHUNK_SIZE = 10;
      const chunks: PendingWhatsAppAttachment[][] = [];
      for (let i = 0; i < attachments.length; i += CHUNK_SIZE) {
        chunks.push(attachments.slice(i, i + CHUNK_SIZE));
      }

      logger.info(
        `Uploading batch of ${attachments.length} document(s) for +${senderPhone} in ${chunks.length} chunk(s) (max ${CHUNK_SIZE}/order)...`
      );

      const chunkResults: Array<{
        configUrl: string;
        documents: Array<{ id: string; filename: string; pageCount: number }>;
      }> = [];

      let globalDocNumber = 1;

      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk = chunks[chunkIdx];
        const formData = new FormData();
        for (const att of chunk) {
          const blob = new Blob([att.mediaBuffer as unknown as BlobPart], { type: att.mimetype });
          formData.append("files", blob, att.filename);
        }
        formData.append("customerPhone", senderPhone);
        formData.append("customerName", senderName);

        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "x-agent-token": config.agentToken,
          },
          body: formData,
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error || `Server returned HTTP ${response.status}`);
        }

        const result = await response.json();
        const configUrl = result.configUrl;
        const docs: Array<{ id: string; filename: string; pageCount: number }> =
          result.documents || (result.document ? [result.document] : []);

        chunkResults.push({ configUrl, documents: docs });

        for (const d of docs) {
          this.recentEvents.unshift({
            id: crypto.randomUUID(),
            timestamp: new Date().toLocaleTimeString(),
            senderPhone: `+${senderPhone}`,
            senderName,
            filename: d.filename,
            pageCount: d.pageCount,
            configUrl,
            status: "success",
          });
        }
      }

      // Stop typing presence
      if (this.socket) {
        try {
          await this.socket.sendPresenceUpdate("paused", remoteJid);
        } catch {
          // ignore
        }
      }

      // Build customer WhatsApp reply text
      let replyText = "";
      if (chunkResults.length === 1) {
        const { configUrl, documents: docs } = chunkResults[0];
        const totalPages = docs.reduce((sum, d) => sum + (d.pageCount || 1), 0);

        if (docs.length === 1) {
          replyText =
            `🖨️ *Printiva — Document Received!*\n\n` +
            `📄 *File:* ${docs[0].filename}\n` +
            `📑 *Pages:* ${docs[0].pageCount} page(s)\n\n` +
            `👉 *Click here to configure copies, color & print:*\n` +
            `${configUrl}\n\n` +
            `_Select B&W/Color, single/both sides, copies, and pay or collect your token directly from your phone._`;
        } else {
          const fileList = docs.map((d, i) => `📄 ${i + 1}. *${d.filename}* (${d.pageCount} pg)`).join("\n");
          replyText =
            `🖨️ *Printiva — ${docs.length} Documents Received!*\n\n` +
            `${fileList}\n\n` +
            `📑 *Total:* ${totalPages} page(s) across ${docs.length} file(s)\n\n` +
            `👉 *Click here to configure copies, color & print all files:*\n` +
            `${configUrl}\n\n` +
            `_Select B&W/Color, single/both sides, copies, and pay or collect your token directly from your phone._`;
        }
      } else {
        // Multi-chunk message (e.g. 10 files -> 2 orders of 5)
        const totalDocsCount = chunkResults.reduce((sum, c) => sum + c.documents.length, 0);
        const totalPagesCount = chunkResults.reduce(
          (sum, c) => sum + c.documents.reduce((dSum, d) => dSum + (d.pageCount || 1), 0),
          0
        );

        let bodySections = "";
        globalDocNumber = 1;

        for (let i = 0; i < chunkResults.length; i++) {
          const chunkRes = chunkResults[i];
          const chunkDocs = chunkRes.documents;
          const chunkPages = chunkDocs.reduce((sum, d) => sum + (d.pageCount || 1), 0);
          const chunkFilesList = chunkDocs
            .map((d) => `📄 ${globalDocNumber++}. *${d.filename}* (${d.pageCount} pg)`)
            .join("\n");

          bodySections +=
            `📦 *Order ${i + 1} of ${chunkResults.length} (${chunkDocs.length} files, ${chunkPages} pages):*\n` +
            `${chunkFilesList}\n` +
            `👉 *Configure Order ${i + 1}:* ${chunkRes.configUrl}\n\n`;
        }

        replyText =
          `🖨️ *Printiva — ${totalDocsCount} Documents Received!*\n` +
          `_Your files have been organized into ${chunkResults.length} quick print orders (${totalPagesCount} total pages):_\n\n` +
          bodySections.trim() +
          `\n\n_Tap each link to customize copies/color and collect your tokens._`;
      }

      if (this.socket) {
        try {
          await this.socket.sendMessage(remoteJid, { text: replyText }, { quoted: lastMessage });
          logger.info(`Sent Printiva unified batch config link to +${senderPhone} (quoted)`);
        } catch (sendErr) {
          logger.warn(`Quoted reply failed, trying direct reply to ${remoteJid}:`, { error: sendErr });
          await this.socket.sendMessage(remoteJid, { text: replyText });
          logger.info(`Sent Printiva unified batch config link to +${senderPhone} (direct)`);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Upload processing failed";
      logger.error(`Failed to process WhatsApp batch from +${senderPhone}:`, { error: errorMsg });

      for (const att of attachments) {
        this.recentEvents.unshift({
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

      if (this.socket) {
        try {
          await this.socket.sendMessage(
            remoteJid,
            {
              text: `⚠️ *Printiva Notice:* We received your file(s), but could not process them (${errorMsg}). Please send PDF, Word documents, or clear images.`,
            },
            { quoted: lastMessage }
          );
        } catch {
          // ignore
        }
      }
    }
  }
}

export const whatsAppAgent = new WhatsAppAgentService();
