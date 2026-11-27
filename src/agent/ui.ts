import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { agentDaemon } from "./daemon";
import { logger } from "./logger";
import { whatsAppAgent } from "./whatsapp";
import { DEFAULT_CONFIG, getDocumentCacheDirectory } from "./config";
import { wakeWindowsPrinter } from "./print-executor";

export class AgentWebServer {
  private server: http.Server | null = null;
  private port: number;

  constructor(port: number = 4321) {
    this.port = port;
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          logger.warn(`Port ${this.port} is in use, trying port ${this.port + 1}...`);
          this.port += 1;
          this.server?.listen(this.port, "127.0.0.1");
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, "127.0.0.1", () => {
        logger.info(`Printiva Desktop Agent local dashboard running at http://127.0.0.1:${this.port}`);
        resolve(this.port);
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", `http://127.0.0.1:${this.port}`);

    // CORS headers for local loopback and web dashboard
    const origin = req.headers.origin;
    const isAllowedOrigin =
      !origin ||
      /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin) ||
      /^https:\/\/([a-z0-9-]+\.)?printiva\.(in|co\.in)$/.test(origin) ||
      /^https:\/\/([a-z0-9-]+\.)?printsathi\.(com|in|co\.in)$/.test(origin) ||
      (process.env.NEXT_PUBLIC_APP_URL && origin === process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, ""));
    if (!isAllowedOrigin) {
      res.writeHead(403);
      res.end("Origin not allowed");
      return;
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-agent-token");
    // Chrome Private Network Access (PNA) support for public HTTPS origins calling loopback 127.0.0.1
    res.setHeader("Access-Control-Allow-Private-Network", "true");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/api/status" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(agentDaemon.getStatus()));
      return;
    }

    if (url.pathname === "/api/trigger-poll" && req.method === "POST") {
      void agentDaemon.triggerPoll();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Poll triggered" }));
      return;
    }

    if (url.pathname === "/api/precache-order" && req.method === "POST") {
      const body = await this.readJsonBody(req);
      const orderId = body?.orderId ? String(body.orderId) : undefined;
      void agentDaemon.precacheOrder(orderId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Precache triggered" }));
      return;
    }

    if (url.pathname === "/api/set-server-url" && req.method === "POST") {
      const body = await this.readJsonBody(req);
      const serverUrl = String(body?.serverUrl || "").trim();
      if (!serverUrl) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing serverUrl" }));
        return;
      }
      try {
        agentDaemon.setServerUrl(serverUrl);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, serverUrl: agentDaemon.getStatus().serverUrl }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Invalid URL" }));
      }
      return;
    }

    if (url.pathname === "/api/login" && req.method === "POST") {
      const body = await this.readJsonBody(req);
      const email = String(body?.email || "").trim();
      const password = String(body?.password || "");
      const name = body?.agentName ? String(body.agentName) : undefined;

      if (!email || !password) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Please provide both email and password." }));
        return;
      }

      try {
        if (body?.serverUrl) agentDaemon.setServerUrl(String(body.serverUrl));
        const result = await agentDaemon.login(email, password, name);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Sign in failed" }));
      }
      return;
    }

    if (url.pathname === "/api/pair" && req.method === "POST") {
      const body = await this.readJsonBody(req);
      const code = String(body?.pairingCode || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
      const name = body?.agentName ? String(body.agentName) : undefined;

      if (!code) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Please provide a valid pairing code." }));
        return;
      }

      try {
        if (body?.serverUrl) agentDaemon.setServerUrl(String(body.serverUrl));
        const result = await agentDaemon.pair(code, name);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Pairing failed" }));
      }
      return;
    }

    if (url.pathname === "/api/unpair" && req.method === "POST") {
      agentDaemon.unpair();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (url.pathname === "/api/select-printer" && req.method === "POST") {
      const body = await this.readJsonBody(req);
      const printer = String(body?.printerName || "").trim();
      if (!printer) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No printer name specified" }));
        return;
      }
      agentDaemon.selectPrinter(printer);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, selectedPrinter: printer }));
      return;
    }

    if (url.pathname === "/api/toggle-disable-printer" && req.method === "POST") {
      const body = await this.readJsonBody(req);
      const printer = String(body?.printerName || "").trim();
      if (!printer) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No printer name specified" }));
        return;
      }
      const isDisabled = agentDaemon.toggleDisablePrinter(printer);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, printerName: printer, isDisabled }));
      return;
    }

    if (url.pathname === "/api/toggle-color-printer" && req.method === "POST") {
      const body = await this.readJsonBody(req);
      const printer = String(body?.printerName || "").trim();
      const isColor = Boolean(body?.isColor);
      if (!printer) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No printer name specified" }));
        return;
      }
      agentDaemon.setPrinterColorOverride(printer, isColor);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, printerName: printer, isColor }));
      return;
    }

    if (url.pathname === "/api/set-separator-page" && req.method === "POST") {
      const body = await this.readJsonBody(req);
      const enabled = body?.enabled !== false;
      agentDaemon.setSeparatorPage(enabled);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, enableSeparatorPage: enabled }));
      return;
    }

    if (url.pathname === "/api/wake-printer" && req.method === "POST") {
      const body = await this.readJsonBody(req);
      const printer = String(body?.printerName || "").trim();
      if (!printer) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No printer name specified" }));
        return;
      }
      const ok = await wakeWindowsPrinter(printer);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: ok, printerName: printer }));
      return;
    }

    if (url.pathname === "/api/counter-queue" && req.method === "GET") {
      try {
        const data = await agentDaemon.getCounterQueue();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            queue: [],
            pendingCount: 0,
            error: err instanceof Error ? err.message : "Failed to load queue",
            serverUrl: agentDaemon.getStatus().serverUrl,
          }),
        );
      }
      return;
    }

    if (url.pathname === "/api/approve-counter-order" && req.method === "POST") {
      const body = await this.readJsonBody(req);
      const orderId = String(body?.orderId || "");
      const duplexStep = body?.duplexStep as "odd" | "even" | "all" | undefined;
      if (!orderId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing orderId" }));
        return;
      }
      try {
        const data = await agentDaemon.approveCounterOrder(orderId, duplexStep, { waitForExecution: false });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Failed to approve order" }));
      }
      return;
    }

    if (url.pathname === "/api/cancel-counter-order" && req.method === "POST") {
      const body = await this.readJsonBody(req);
      const orderId = String(body?.orderId || "");
      if (!orderId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing orderId" }));
        return;
      }
      try {
        const data = await agentDaemon.cancelCounterOrder(orderId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Failed to cancel order" }));
      }
      return;
    }

    if (url.pathname === "/api/complete-counter-order" && req.method === "POST") {
      const body = await this.readJsonBody(req);
      const orderId = String(body?.orderId || "");
      if (!orderId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing orderId" }));
        return;
      }
      try {
        const data = await agentDaemon.completeCounterOrder(orderId);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Failed to complete order" }));
      }
      return;
    }

    if (url.pathname === "/api/whatsapp/status" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(whatsAppAgent.getStatus()));
      return;
    }

    if (url.pathname === "/api/whatsapp/connect" && req.method === "POST") {
      const hasSaved = whatsAppAgent.hasSavedSession();
      void whatsAppAgent.start(false, false, !hasSaved);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(whatsAppAgent.getStatus()));
      return;
    }

    if (url.pathname === "/api/whatsapp/disconnect" && req.method === "POST") {
      await whatsAppAgent.disconnect(true);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(whatsAppAgent.getStatus()));
      return;
    }

    if (url.pathname === "/api/document" && req.method === "GET") {
      const docId = (url.searchParams.get("documentId") || url.searchParams.get("id") || "").replace(
        /[^a-zA-Z0-9_-]/g,
        "",
      );
      if (!docId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing documentId parameter" }));
        return;
      }
      const cacheDir = getDocumentCacheDirectory();
      const directPath = path.join(cacheDir, `doc_${docId}.pdf`);
      const altPath = path.join(cacheDir, `${docId}.pdf`);
      const targetPath = fs.existsSync(directPath) ? directPath : fs.existsSync(altPath) ? altPath : null;

      if (!targetPath) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Document not found in local cache" }));
        return;
      }

      try {
        const fileBytes = fs.readFileSync(targetPath);
        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Length": fileBytes.length,
          "Content-Disposition": `inline; filename="document_${docId}.pdf"`,
        });
        res.end(fileBytes);
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to read local cached document" }));
      }
      return;
    }

    // Default: Serve the upgraded modern Agent Dashboard UI
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(this.getDashboardHtml());
  }

  private readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown> | null> {
    const MAX_BODY_BYTES = 1024 * 1024; // 1 MB cap
    return new Promise((resolve) => {
      let data = "";
      let totalBytes = 0;
      let aborted = false;
      req.on("data", (chunk: Buffer | string) => {
        if (aborted) return;
        totalBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk);
        if (totalBytes > MAX_BODY_BYTES) {
          aborted = true;
          req.destroy();
          resolve(null);
          return;
        }
        data += chunk;
      });
      req.on("end", () => {
        if (aborted) return;
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
      req.on("error", () => {
        if (!aborted) {
          aborted = true;
          resolve(null);
        }
      });
    });
  }

  private getDashboardHtml(): string {
    const status = agentDaemon.getStatus();
    const rawServerUrl = status.serverUrl || "https://printiva.co.in";
    const serverUrl = /^https?:\/\/[^/]+/i.test(rawServerUrl) ? rawServerUrl : "https://printiva.co.in";
    const shopPortalUrl = `${serverUrl}/shop/dashboard`;
    const downloadUrl = `${serverUrl}/download`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Printiva Desktop Agent v${DEFAULT_CONFIG.version}</title>
  <style>
    :root {
      --brand-950: #022c22;
      --brand-900: #064e3b;
      --brand-800: #065f46;
      --brand-700: #047857;
      --brand-600: #059669;
      --brand-500: #10b981;
      --brand-100: #d1fae5;
      --brand-50: #ecfdf5;
      --bg: #f1f5f9;
      --card-bg: #ffffff;
      --surface-muted: #f8fafc;
      --border: #e2e8f0;
      --text-main: #0f172a;
      --text-secondary: #334155;
      --text-muted: #64748b;
      --danger: #dc2626;
      --danger-light: #fef2f2;
      --success: #059669;
      --warning: #d97706;
      --radius: 16px;
      --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04);
      --shadow-card: 0 1px 3px rgba(15, 23, 42, 0.05), 0 10px 24px -14px rgba(15, 23, 42, 0.08);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background:
        radial-gradient(900px 320px at 50% -120px, rgba(16, 185, 129, 0.14), transparent 70%),
        var(--bg);
      color: var(--text-main);
      line-height: 1.5;
      padding: 20px 22px 36px;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 1120px; margin: 0 auto; }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      background: linear-gradient(135deg, #022c22 0%, #064e3b 52%, #047857 100%);
      padding: 18px 24px;
      border-radius: 18px;
      box-shadow: 0 12px 28px -10px rgba(6, 78, 59, 0.35);
      margin-bottom: 18px;
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    .logo-wrap { display: flex; align-items: center; gap: 14px; }
    .logo-mark {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.14);
      border: 1px solid rgba(255, 255, 255, 0.24);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }
    .logo-area { display: flex; flex-direction: column; gap: 2px; }
    .logo {
      font-size: 20px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 9px;
      letter-spacing: -0.02em;
    }
    .logo-badge {
      font-size: 10.5px;
      background: rgba(255, 255, 255, 0.14);
      border: 1px solid rgba(255, 255, 255, 0.25);
      padding: 2px 8px;
      border-radius: 999px;
      font-weight: 700;
      letter-spacing: 0.03em;
      color: #ecfdf5;
    }
    .tagline { font-size: 12.5px; color: #a7f3d0; font-weight: 500; }

    .header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

    .btn-dashboard {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 9px 15px;
      background: #ffffff;
      color: #064e3b;
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 10px;
      font-size: 12.5px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.18s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      white-space: nowrap;
    }
    .btn-dashboard:hover {
      background: #ecfdf5;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
    }
    .btn-header-ghost {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.24);
      box-shadow: none;
    }
    .btn-header-ghost:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #ffffff;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      padding: 5px 11px;
      border-radius: 9999px;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }
    .badge-online { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .badge-offline { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .badge-unpaired { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }
    .pulse-dot {
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.35; transform: scale(0.8); }
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
      align-items: start;
    }
    @media (max-width: 820px) {
      .grid { grid-template-columns: 1fr; }
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      box-shadow: var(--shadow-card);
      display: flex;
      flex-direction: column;
    }
    .card-hero {
      margin-bottom: 18px;
      border: 1px solid #a7f3d0;
      box-shadow: 0 2px 6px rgba(6, 78, 59, 0.04), 0 14px 30px -18px rgba(5, 150, 105, 0.22);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid #f1f5f9;
      gap: 10px;
      flex-wrap: wrap;
    }
    .card-title {
      font-size: 15px;
      font-weight: 800;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
      letter-spacing: -0.01em;
    }

    .filter-pills {
      display: inline-flex;
      background: #f1f5f9;
      border-radius: 9px;
      padding: 3px;
      gap: 2px;
    }
    .filter-pill {
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: 11.5px;
      font-weight: 700;
      padding: 5px 10px;
      border-radius: 7px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .filter-pill.active {
      background: #ffffff;
      color: #064e3b;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }

    .token-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      margin-bottom: 9px;
      border-radius: 13px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      transition: all 0.16s ease;
      box-sizing: border-box;
      overflow: hidden;
    }
    .token-row:hover {
      box-shadow: 0 4px 12px -4px rgba(15, 23, 42, 0.1);
      transform: translateY(-1px);
    }
    .token-badge-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      padding: 7px 10px;
      border-radius: 11px;
      min-width: 82px;
      max-width: 145px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
      flex-shrink: 0;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .token-badge-btn * { pointer-events: none; }
    .token-badge-btn:hover {
      transform: scale(1.03);
      box-shadow: 0 4px 10px rgba(5, 150, 105, 0.18);
    }
    .token-badge-printer {
      font-size: 9.5px;
      font-weight: 700;
      color: #065f46;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 5px;
      padding: 1px 5px;
      margin-top: 3px;
      max-width: 132px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 1.25;
    }
    .token-badge-printer.printing {
      color: #92400e;
      background: #fffbeb;
      border-color: #fde68a;
    }
    .token-badge-printer.predicted {
      color: #334155;
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .token-link-btn {
      background: transparent;
      border: none;
      padding: 0;
      font-size: 14px;
      font-weight: 800;
      color: var(--text-main);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      text-align: left;
    }
    .token-link-btn:hover { color: #047857; text-decoration: underline; text-underline-offset: 3px; }

    .printer-pill-inline {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      background: #f0fdf4;
      color: #065f46;
      border: 1px solid #a7f3d0;
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }
    .printer-pill-inline * { pointer-events: none; }
    .printer-pill-inline.printing {
      background: #fffbeb;
      color: #92400e;
      border-color: #fde68a;
    }
    .printer-pill-inline.predicted {
      background: #f8fafc;
      color: #334155;
      border-color: #cbd5e1;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-top: 12px;
    }
    .stat-box {
      background: var(--surface-muted);
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
    }
    .stat-label { font-size: 10.5px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; letter-spacing: 0.05em; }
    .stat-value { font-size: 22px; font-weight: 800; color: #064e3b; margin-top: 3px; font-variant-numeric: tabular-nums; }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 13px;
      gap: 10px;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: var(--text-muted); font-weight: 500; }
    .info-val { font-weight: 700; color: var(--text-main); }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 8px 14px;
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: #ffffff;
      border: none;
      border-radius: 9px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.16s ease;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(5, 150, 105, 0.22);
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #047857 0%, #065f46 100%);
      transform: translateY(-1px);
    }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

    .btn-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 11px;
      background: #f8fafc;
      color: #334155;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .btn-secondary:hover { background: #e2e8f0; }

    .btn-danger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 9px 16px;
      background: var(--danger-light);
      color: var(--danger);
      border: 1px solid #fecaca;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
      width: 100%;
      margin-top: 12px;
    }
    .btn-danger:hover { background: #fee2e2; color: #991b1b; }

    .input-field {
      width: 100%;
      padding: 10px 13px;
      border: 1px solid var(--border);
      border-radius: 9px;
      font-size: 13px;
      margin-top: 5px;
      margin-bottom: 12px;
      background: #f8fafc;
      transition: all 0.18s;
    }
    .input-field:focus {
      outline: none;
      background: #ffffff;
      border-color: #059669;
      box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
    }

    .tab-group {
      display: flex;
      background: #f1f5f9;
      border-radius: 10px;
      padding: 3px;
      margin-bottom: 14px;
      gap: 4px;
    }
    .tab-btn {
      flex: 1;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 700;
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      color: var(--text-muted);
      transition: all 0.18s ease;
    }
    .tab-btn.active {
      color: #064e3b;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }

    .printer-card {
      padding: 11px 13px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      margin-bottom: 9px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: #ffffff;
      transition: border-color 0.18s;
      box-sizing: border-box;
      overflow: hidden;
    }
    .printer-card:hover { border-color: #cbd5e1; }

    .status-panel-paired {
      background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
      border: 1px solid #a7f3d0;
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 14px;
    }

    /* Token Details Modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.52);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 1000;
    }
    .modal-panel {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 18px;
      width: 100%;
      max-width: 640px;
      max-height: 88vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.35);
    }
    .modal-body {
      padding: 18px 22px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-wrap">
        <div class="logo-mark" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
        </div>
        <div class="logo-area">
          <div class="logo">
            Printiva
            <span class="logo-badge">Agent v${DEFAULT_CONFIG.version}</span>
          </div>
          <div class="tagline">Smart Color/B&amp;W Print Spooler &amp; Shop Cockpit</div>
        </div>
      </div>
      <div class="header-actions">
        <div id="statusBadge" class="badge badge-offline">
          <span class="status-dot"></span> Checking Status...
        </div>
        <a id="headerDownloadLink" class="btn-dashboard btn-header-ghost" href="${downloadUrl}" target="_blank" rel="noopener" title="Download newest Windows agent installer">
          Download Agent
        </a>
        <a id="headerPortalLink" class="btn-dashboard" href="${shopPortalUrl}" target="_blank" rel="noopener">
          Open Shop Dashboard &rarr;
        </a>
      </div>
    </header>

    <!-- Counter Print Request Queue Card -->
    <div class="card card-hero" id="counterQueueCard">
      <div class="card-header">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <span class="card-title" style="font-size:16px;">Counter Print Queue</span>
          <span id="counterQueueBadge" class="badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">0 waiting</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <div class="filter-pills" id="queueFilterTabs">
            <button type="button" id="qFilterAll" class="filter-pill active" onclick="setQueueFilter('all')">All</button>
            <button type="button" id="qFilterWaiting" class="filter-pill" onclick="setQueueFilter('waiting')">Waiting</button>
            <button type="button" id="qFilterPrinting" class="filter-pill" onclick="setQueueFilter('printing')">Printing</button>
            <button type="button" id="qFilterCompleted" class="filter-pill" onclick="setQueueFilter('completed')">Printed</button>
          </div>
          <input
            type="text"
            id="agentTokenSearchInput"
            placeholder="Search token # (e.g. 5)..."
            oninput="renderAgentQueueWithFilter()"
            style="padding:6px 11px; font-size:12px; border:1px solid #cbd5e1; border-radius:9px; outline:none; background:#f8fafc; width:175px;"
          />
          <button type="button" class="btn-secondary" style="font-size:11px; padding:6px 10px; color:#64748b;" onclick="dismissAllInactiveOrders()" title="Hide cancelled and completed orders">Clear Inactive</button>
        </div>
      </div>
      <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
        Click any <b>Token #</b> to see the exact printer name assigned to each document. Click <b>Print &amp; Approve</b> to auto-route B&amp;W to B&amp;W printers and Color to Color printers.
      </p>
      <div id="counterQueueList" style="max-height:520px; overflow-y:auto; padding-right:4px;">
        <p style="font-size:13px; color:var(--text-muted); padding:10px 0;">No active counter requests.</p>
      </div>
    </div>

    <div class="grid">
      <div style="display:flex; flex-direction:column; gap:18px;">
        <!-- Connected Printers Card -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Hardware Printers</span>
            <span id="printerCount" class="badge" style="background:#f1f5f9; color:#475569; border:1px solid #e2e8f0;">0 detected</span>
          </div>
          <div id="printersList">
            <p style="font-size:13px; color:var(--text-muted); padding:10px 0;">Scanning Windows print queues...</p>
          </div>
        </div>

        <!-- Connection & Authentication Card -->
        <div class="card" id="connectionCard">
          <div class="card-header">
            <span class="card-title">Cloud Connection</span>
          </div>
          <div id="connectionDetails">
            <p style="font-size:13px; color:var(--text-muted);">Checking local pairing credentials...</p>
          </div>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:18px;">
        <!-- Auto-Print Engine Card -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Live Spooler &amp; Print Monitor</span>
            <span id="activePrintPoolBadge" class="badge" style="background:#f1f5f9; color:#475569; border:1px solid #e2e8f0;">Idle</span>
          </div>
          <div id="activeJobSection" style="margin-bottom: 4px;"></div>
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-label">Processed</div>
              <div class="stat-value" id="statProcessed">0</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Submitted</div>
              <div class="stat-value" id="statSubmitted">0</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Failed</div>
              <div class="stat-value" id="statFailed">0</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">Pages Total</div>
              <div class="stat-value" id="statPages">0</div>
            </div>
          </div>
        </div>

        <!-- WhatsApp Print Agent Card -->
        <div class="card" id="whatsappCard" style="border: 1px solid #6ee7b7;">
          <div class="card-header">
            <span class="card-title">WhatsApp Direct Print Agent</span>
            <span id="whatsappStatusBadge" class="badge" style="background:#f1f5f9; color:#475569;">Checking...</span>
          </div>
          <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
            Customers send documents directly on WhatsApp and immediately receive their configuration &amp; token link.
          </p>
          <div id="whatsappBody">
            <p style="font-size:13px; color:var(--text-muted);">Loading WhatsApp status...</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Token Details & Exact Printer Inspector Modal -->
  <div id="tokenDetailsModal" class="modal-backdrop" onclick="if(event && event.target === this) closeTokenDetails();" style="display:none;">
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="tokenModalTitle">
      <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 22px; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
        <div id="tokenModalTitle" style="font-size:16px; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:10px;">
          Token Details
        </div>
        <button type="button" class="btn-secondary" style="font-size:12px; padding:5px 10px;" onclick="closeTokenDetails()">✕ Close</button>
      </div>
      <div id="tokenDetailsBody" class="modal-body"></div>
    </div>
  </div>

  <script>
    let activeAuthTab = 'pair';
    let lastStatusSnapshot = null;
    let selectedTokenOrderId = null;
    let activeQueueFilter = 'all';

    function escapeHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    }
    function safeHref(url, fallback) {
      var str = String(url == null ? '' : url).trim();
      var lower = str.toLowerCase();
      if (lower.startsWith('http://') || lower.startsWith('https://')) return escapeHtml(str);
      return fallback ? escapeHtml(fallback) : '#';
    }
    function safeDataImageUrl(url) {
      var str = String(url == null ? '' : url).trim();
      var lower = str.toLowerCase();
      if (
        lower.startsWith('data:image/png;base64,') ||
        lower.startsWith('data:image/jpeg;base64,') ||
        lower.startsWith('data:image/webp;base64,')
      ) {
        return escapeHtml(str);
      }
      return '';
    }
    function safeDomId(value) {
      return String(value == null ? '' : value).replace(/[^a-zA-Z0-9_-]/g, '');
    }
    let lastRenderedPairedState = null;

    function setQueueFilter(filter) {
      activeQueueFilter = filter || 'all';
      var map = { all: 'qFilterAll', waiting: 'qFilterWaiting', printing: 'qFilterPrinting', completed: 'qFilterCompleted' };
      Object.keys(map).forEach(function(k) {
        var btn = document.getElementById(map[k]);
        if (btn) btn.className = 'filter-pill' + (k === activeQueueFilter ? ' active' : '');
      });
      renderAgentQueueWithFilter();
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        return await res.json();
      } catch (err) {
        return null;
      }
    }

    function switchAuthTab(tab) {
      activeAuthTab = tab;
      const signinForm = document.getElementById('signinFormContainer');
      const pairForm = document.getElementById('pairFormContainer');
      const tabSignin = document.getElementById('tabBtnSignin');
      const tabPair = document.getElementById('tabBtnPair');
      if (signinForm && pairForm && tabSignin && tabPair) {
        if (tab === 'signin') {
          signinForm.style.display = 'block';
          pairForm.style.display = 'none';
          tabSignin.className = 'tab-btn active';
          tabPair.className = 'tab-btn';
        } else {
          signinForm.style.display = 'none';
          pairForm.style.display = 'block';
          tabSignin.className = 'tab-btn';
          tabPair.className = 'tab-btn active';
        }
      }
    }

    async function handleLogin(event) {
      event.preventDefault();
      const email = document.getElementById('loginEmailInput').value.trim();
      const password = document.getElementById('loginPasswordInput').value;
      const name = document.getElementById('loginAgentNameInput').value;
      const serverUrl = document.getElementById('serverUrlInput').value.trim() || 'https://printiva.co.in';
      const btn = document.getElementById('loginBtn');
      if (btn) {
        btn.disabled = true;
        btn.innerText = 'Connecting to Printiva...';
      }
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ email, password, agentName: name, serverUrl })
        });
        const data = await res.json();
        if (res.ok) {
          lastRenderedPairedState = null;
          await refreshStatus(true);
        } else {
          alert('Sign in failed: ' + (data.error || 'Invalid credentials'));
        }
      } catch (err) {
        alert('Network error connecting to cloud server.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = 'Sign In & Link Shop';
        }
      }
    }

    async function pasteCode() {
      try {
        const text = await navigator.clipboard.readText();
        const input = document.getElementById('pairingCodeInput');
        if (input && text) {
          input.value = text.trim().toUpperCase().replace(/\\s+/g, '');
        }
      } catch (e) {}
    }

    async function pairAgent(event) {
      event.preventDefault();
      const code = document.getElementById('pairingCodeInput').value.trim().toUpperCase().replace(/\\s+/g, '');
      const name = document.getElementById('agentNameInput').value;
      const serverUrl = document.getElementById('serverUrlInput').value.trim() || 'https://printiva.co.in';
      const btn = document.getElementById('pairBtn');
      if (btn) {
        btn.disabled = true;
        btn.innerText = 'Linking with Shop...';
      }
      try {
        const res = await fetch('/api/pair', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ pairingCode: code, agentName: name, serverUrl })
        });
        const data = await res.json();
        if (res.ok) {
          lastRenderedPairedState = null;
          await refreshStatus(true);
        } else {
          alert('Pairing failed: ' + (data.error || 'Invalid pairing code'));
        }
      } catch (err) {
        alert('Network error during pairing.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = 'Connect with Pairing Code';
        }
      }
    }

    async function unpairAgent(btnEl) {
      if (btnEl) {
        if (btnEl.dataset.confirming !== 'true') {
          btnEl.dataset.confirming = 'true';
          const originalText = btnEl.innerText;
          btnEl.innerText = '⚠️ Really Disconnect? Click again';
          btnEl.style.background = '#991b1b';
          setTimeout(() => {
            if (btnEl && btnEl.dataset.confirming === 'true') {
              delete btnEl.dataset.confirming;
              btnEl.innerText = originalText;
              btnEl.style.background = '';
            }
          }, 4000);
          return;
        }
        delete btnEl.dataset.confirming;
        btnEl.disabled = true;
        btnEl.innerText = 'Disconnecting...';
      }
      await fetch('/api/unpair', { method: 'POST' });
      lastRenderedPairedState = null;
      await refreshStatus(true);
    }

    async function refreshStatus(force = false) {
      const status = await fetchStatus();
      if (!status) {
        document.getElementById('statusBadge').className = 'badge badge-offline';
        document.getElementById('statusBadge').innerHTML = '<span class="status-dot"></span> AGENT SERVICE OFFLINE';
        return;
      }

      var rawUrl = String(status.serverUrl || '').trim();
      const activeServerUrl = (rawUrl.toLowerCase().startsWith('http://') || rawUrl.toLowerCase().startsWith('https://')) ? rawUrl : 'https://printiva.co.in';
      const portalLink = document.getElementById('headerPortalLink');
      if (portalLink) portalLink.href = \`\${activeServerUrl}/shop/dashboard\`;

      status.printers = Array.isArray(status.printers)
        ? status.printers.filter(p => !/onenote|print to pdf|xps|fax|pdfcreator|cutepdf/i.test(p.name + ' ' + (p.driverName || '')) && !/^(nul:|portprompt:|file:)$/i.test(p.portName || ''))
        : [];
      lastStatusSnapshot = status;
      const printerReady = status.printers.some(p => ['online', 'printing'].includes(p.status));

      const badge = document.getElementById('statusBadge');
      if (!status.isPaired) {
        badge.className = 'badge badge-unpaired';
        badge.innerHTML = '<span class="status-dot"></span> PAIRING REQUIRED';
      } else if (status.isConnected) {
        badge.className = printerReady ? 'badge badge-online' : 'badge badge-offline';
        badge.innerHTML = \`<span class="status-dot \${printerReady ? 'pulse-dot' : ''}"></span> \${printerReady ? 'ACTIVE &bull; PRINTER READY' : 'ONLINE &bull; PRINTER OFFLINE'}\`;
      } else {
        badge.className = 'badge badge-offline';
        badge.innerHTML = '<span class="status-dot"></span> CONNECTING...';
      }

      if (lastRenderedPairedState !== status.isPaired || force) {
        lastRenderedPairedState = status.isPaired;
        const connDiv = document.getElementById('connectionDetails');
        if (!status.isPaired) {
          connDiv.innerHTML = \`
            <label for="serverUrlInput" style="font-size:12px; font-weight:700; color:var(--text-main);">Printiva Website Address</label>
            <input type="url" id="serverUrlInput" class="input-field" value="\${escapeHtml(activeServerUrl)}" placeholder="https://printiva.co.in" />

            <div class="tab-group">
              <button type="button" id="tabBtnPair" class="tab-btn active" onclick="switchAuthTab('pair')">Pairing Key</button>
              <button type="button" id="tabBtnSignin" class="tab-btn" onclick="switchAuthTab('signin')">Email Sign In</button>
            </div>

            <div id="pairFormContainer">
              <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px; line-height:1.4;">
                Get your 6-digit code from your Shop Dashboard under <b>Printers</b> &rarr; <b>Add Agent</b>.
              </p>
              <form onsubmit="pairAgent(event)">
                <label for="pairingCodeInput" style="font-size:12px; font-weight:700; color:var(--text-main);">Pairing Key</label>
                <div style="display:flex; gap:8px; margin-top:4px; margin-bottom:12px;">
                  <input type="text" id="pairingCodeInput" class="input-field" style="margin:0; text-transform:uppercase; font-family:monospace; font-weight:700; font-size:14px; letter-spacing:0.05em;" placeholder="PS-1234-ABCD" autocomplete="off" spellcheck="false" required />
                  <button type="button" class="btn-secondary" onclick="pasteCode()">Paste</button>
                </div>
                <label for="agentNameInput" style="font-size:12px; font-weight:700; color:var(--text-main);">Agent Station Name</label>
                <input type="text" id="agentNameInput" class="input-field" maxlength="100" value="\${escapeHtml(status.agentName || 'Shop Windows Station')}" required />
                <button type="submit" id="pairBtn" class="btn-primary">Connect with Pairing Code</button>
              </form>
            </div>

            <div id="signinFormContainer" style="display:none;">
              <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px; line-height:1.4;">
                Sign in with your Printiva shop owner account to automatically link this printer station.
              </p>
              <form onsubmit="handleLogin(event)">
                <label style="font-size:12px; font-weight:700; color:var(--text-main);">Shop Email</label>
                <input type="email" id="loginEmailInput" class="input-field" placeholder="owner@printshop.com" required />
                <label style="font-size:12px; font-weight:700; color:var(--text-main);">Password</label>
                <input type="password" id="loginPasswordInput" class="input-field" placeholder="••••••••" required />
                <input type="hidden" id="loginAgentNameInput" value="\${escapeHtml(status.agentName || 'Shop Windows Station')}" />
                <button type="submit" id="loginBtn" class="btn-primary">Sign In &amp; Link Shop</button>
              </form>
            </div>
          \`;
        } else {
          connDiv.innerHTML = \`
            <div class="status-panel-paired">
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="status-dot pulse-dot" style="background:#10b981; width:9px; height:9px;"></span>
                <b style="color:#064e3b; font-size:14.5px;">\${escapeHtml(status.shopName || 'Shop Connected')}</b>
              </div>
              <p style="font-size:12px; color:#047857; margin-top:3px;">Permanently Paired &bull; Automatic Cloud Spooling Active</p>
            </div>
            <div class="info-row"><span class="info-label">Shop Name</span><span class="info-val">\${escapeHtml(status.shopName || 'Connected')}</span></div>
            <div class="info-row"><span class="info-label">Station Name</span><span class="info-val">\${escapeHtml(status.agentName || 'Windows PC')}</span></div>
            <div class="info-row">
              <span class="info-label" style="flex-shrink:0;">Cloud Server</span>
              <span class="info-val" style="font-size:12px; color:#065f46; display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden;">
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="\${escapeHtml(activeServerUrl)}">\${escapeHtml(activeServerUrl)}</span>
                <button type="button" class="btn-secondary" style="padding:2px 8px; font-size:10px; flex-shrink:0; white-space:nowrap;" onclick="changeServerUrl()">Switch</button>
              </span>
            </div>
            <div class="info-row"><span class="info-label">Last Heartbeat</span><span class="info-val" style="font-size:12px;">\${status.lastHeartbeat ? new Date(status.lastHeartbeat).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) + ' IST' : 'Active'}</span></div>
            <button class="btn-danger" onclick="unpairAgent(this)">Disconnect Agent</button>
          \`;
        }
      }

      const colorOverridesMap = {};
      if (status.printerColorOverrides) {
        Object.keys(status.printerColorOverrides).forEach(k => {
          colorOverridesMap[k.trim().toLowerCase()] = Boolean(status.printerColorOverrides[k]);
        });
      }
      const getPrinterColorState = (p) => {
        const nl = (p.name || '').trim().toLowerCase();
        return colorOverridesMap[nl] !== undefined
          ? colorOverridesMap[nl]
          : Boolean(p.capabilities && p.capabilities.colorSupport);
      };

      const activeDispatches = Array.isArray(status.activeDispatches) ? status.activeDispatches : [];
      const activePrinterNamesLower = new Set(activeDispatches.map(d => String(d.printerName || '').toLowerCase()));

      const onlinePrinters = status.printers.filter(p => !p.isDisabled && (p.status === 'online' || p.status === 'printing'));
      const onlineCount = onlinePrinters.length;
      const bwOnlineCount = onlinePrinters.filter(p => !getPrinterColorState(p)).length;
      const colorOnlineCount = onlinePrinters.filter(p => getPrinterColorState(p)).length;

      document.getElementById('printerCount').innerText = onlineCount > 0
        ? \`\${onlineCount} online (\${bwOnlineCount} B&W · \${colorOnlineCount} Color)\`
        : \`0 online (\${status.printers.length} disconnected)\`;

      const pList = document.getElementById('printersList');
      if (status.printers.length === 0) {
        pList.innerHTML = '<p style="font-size:13px; color:var(--text-muted); padding:10px 0;">No physical printers detected. Plug in your USB printer or turn on network printer.</p>';
      } else {
        const headerNotice = onlineCount === 0
          ? \`<div style="font-size:11px; color:#991b1b; background:#fef2f2; border:1px solid #fecaca; padding:8px 12px; border-radius:9px; margin-bottom:12px; line-height:1.4;">
              ⚠️ <b>No Printer Connected:</b> All physical printers are currently offline or disconnected. Please plug in the USB cable and turn on your printer.
            </div>\`
          : \`<div style="font-size:11px; color:#065f46; background:#f0fdf4; border:1px solid #bbf7d0; padding:8px 12px; border-radius:9px; margin-bottom:12px; line-height:1.4;">
              ⚡ <b>Strict Load-Balanced Routing:</b> B&amp;W jobs rotate across <b>\${bwOnlineCount} B&amp;W</b> printer(s); Color jobs route strictly across <b>\${colorOnlineCount} Color</b> printer(s).
            </div>\`;

        const nextPrintersHtml = headerNotice + status.printers.map(p => {
          const nameLower = (p.name || '').trim().toLowerCase();
          const isColor = getPrinterColorState(p);
          const isOnline = ['online', 'printing'].includes(p.status);
          const isSleeping = Boolean(p.isSleeping);
          const isDisabled = (status.disabledPrinters || []).some(x => x.trim().toLowerCase() === nameLower);
          const isActive = !isDisabled && isOnline && (status.selectedPrinter
            ? status.selectedPrinter.trim().toLowerCase() === nameLower
            : p.isDefault || onlineCount === 1);
          const isCurrentlyPrinting = !isDisabled && (p.status === 'printing' || activePrinterNamesLower.has(nameLower));
          const safePrinterArg = escapeHtml(JSON.stringify(p.name));
          const safePrinterAttr = escapeHtml(p.name);
          const targetColorStr = !isColor ? 'true' : 'false';

          return \`
          <div class="printer-card" style="\${isDisabled ? 'opacity:0.75; border-color:#fca5a5; background:#fff5f5;' : isCurrentlyPrinting ? 'border-color:#f59e0b; background:#fffbeb;' : isActive ? 'border-color:#10b981; background:#f0fdf4;' : isSleeping ? 'border-color:#bfdbfe; background:#f8fafc;' : 'border-color:#e2e8f0; background:#ffffff;'}">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; width:100%; box-sizing:border-box;">
              <div style="flex:1 1 auto; min-width:0; overflow:hidden;">
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                  <span style="font-size:13px; font-weight:700; color:\${isOnline ? 'var(--text-main)' : 'var(--text-muted)'}; text-decoration:\${isDisabled ? 'line-through' : 'none'}; word-break:break-word;">
                    \${escapeHtml(p.name)}
                  </span>
                  <span class="badge" style="font-size:9px; padding:2px 7px; \${isColor ? 'background:#ecfdf5; color:#047857; border:1px solid #a7f3d0;' : 'background:#f1f5f9; color:#475569; border:1px solid #e2e8f0;'}">
                    \${isColor ? '🎨 Color' : '📄 B&W'}
                  </span>
                  \${isCurrentlyPrinting ? '<span class="badge" style="font-size:9px; padding:2px 7px; background:#fef3c7; color:#92400e; border:1px solid #fde68a;">🖨️ PRINTING NOW</span>' : ''}
                  \${isDisabled ? '<span class="badge" style="font-size:9px; padding:2px 6px; background:#fee2e2; color:#991b1b; border:1px solid #fecaca;">⛔ EXCLUDED</span>' : ''}
                  \${isActive ? '<span class="badge" style="font-size:9px; padding:2px 6px; background:#d1fae5; color:#065f46; border:1px solid #6ee7b7;">⭐ DEFAULT</span>' : ''}
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="\${escapeHtml(p.driverName || 'Windows Spooler')}">
                  \${escapeHtml(p.driverName || 'Windows Spooler')}
                </div>
              </div>
              <div style="flex:0 0 auto; flex-shrink:0;">
                <span class="badge \${isDisabled ? 'badge-offline' : isSleeping ? 'badge-sleeping' : isOnline ? 'badge-online' : 'badge-offline'}" style="font-size:9.5px; padding:3px 8px; white-space:nowrap; \${isSleeping ? 'background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;' : ''}">
                  \${isDisabled ? 'EXCLUDED' : isSleeping ? '🌙 SLEEPING' : isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}
                </span>
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding-top:6px; border-top:1px dashed #e2e8f0; width:100%; box-sizing:border-box;">
              \${isSleeping && !isDisabled ? \`<button type="button" class="btn-secondary" style="font-size:10.5px; padding:4px 8px; cursor:pointer; color:#1d4ed8; border-color:#bfdbfe; white-space:nowrap;" onclick="wakePrinter(\${safePrinterArg}, this)" title="Send immediate wake command to printer">⚡ Wake Up</button>\` : ''}
              <button type="button" class="btn-secondary" style="font-size:10.5px; padding:4px 8px; cursor:pointer; white-space:nowrap;" data-printer="\${safePrinterAttr}" data-target-color="\${targetColorStr}" onclick="toggleColorPrinter(this.getAttribute('data-printer'), this.getAttribute('data-target-color') === 'true', this)" title="Manually set whether this printer prints Color or B&W">
                \${isColor ? 'Switch to B&W' : 'Switch to Color'}
              </button>
              <button type="button" class="btn-secondary" style="font-size:10.5px; padding:4px 8px; cursor:pointer; color:\${isDisabled ? '#065f46' : '#b91c1c'}; border-color:\${isDisabled ? '#a7f3d0' : '#fca5a5'}; white-space:nowrap;" onclick="toggleDisablePrinter(\${safePrinterArg})" title="\${isDisabled ? 'Enable printer for jobs' : 'Exclude printer from all print jobs'}">
                \${isDisabled ? '✅ Enable Printer' : '⛔ Do Not Use'}
              </button>
              \${!isDisabled && !isActive && isOnline ? \`<button type="button" class="btn-secondary" style="font-size:10.5px; padding:4px 8px; cursor:pointer; white-space:nowrap;" onclick="selectDefaultPrinter(\${safePrinterArg})">⭐ Use as Default</button>\` : ''}
            </div>
          </div>
        \`;
        }).join('');
        if (lastRenderedPrintersHtml !== nextPrintersHtml) {
          lastRenderedPrintersHtml = nextPrintersHtml;
          pList.innerHTML = nextPrintersHtml;
        }
      }

      document.getElementById('statProcessed').innerText = status.stats.jobsProcessed;
      document.getElementById('statSubmitted').innerText = status.stats.jobsSubmitted;
      document.getElementById('statFailed').innerText = status.stats.jobsFailed;
      document.getElementById('statPages').innerText = status.stats.totalPagesSubmitted;

      const activeBadge = document.getElementById('activePrintPoolBadge');
      if (activeBadge) {
        if (activeDispatches.length > 0) {
          activeBadge.className = 'badge badge-unpaired';
          activeBadge.innerHTML = '<span class="status-dot pulse-dot"></span> ' + activeDispatches.length + ' printing';
        } else if (status.currentJob) {
          activeBadge.className = 'badge badge-unpaired';
          activeBadge.innerHTML = '<span class="status-dot pulse-dot"></span> 1 printing';
        } else {
          activeBadge.className = 'badge badge-online';
          activeBadge.innerHTML = '<span class="status-dot"></span> Ready';
        }
      }

      const jobSec = document.getElementById('activeJobSection');
      if (activeDispatches.length > 0) {
        jobSec.innerHTML = activeDispatches.map(d => \`
          <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:10px 12px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div style="min-width:0;">
              <div style="font-size:10.5px; font-weight:800; color:#b45309; letter-spacing:0.04em;">🔄 PRINTING ON \${escapeHtml(d.printerName)}</div>
              <div style="font-size:12.5px; font-weight:700; color:var(--text-main); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\${escapeHtml(d.filename)}</div>
              <div style="font-size:11px; color:#92400e;">\${d.totalPages} page(s) &bull; Job #\${escapeHtml(String(d.jobId || '').slice(0,8))}</div>
            </div>
            <span class="badge" style="background:#ffffff; color:#92400e; border:1px solid #fde68a; font-size:10px;">\${d.isColorPrinter ? '🎨 Color' : '📄 B&W'}</span>
          </div>
        \`).join('');
      } else if (status.currentJob) {
        jobSec.innerHTML = \`
          <div style="background:#ecfdf5; border:1px solid #6ee7b7; border-radius:10px; padding:12px;">
            <div style="font-size:11px; font-weight:800; color:#047857; letter-spacing:0.04em;">🔄 PRINTING IN PROGRESS</div>
            <div style="font-size:13px; font-weight:700; color:var(--text-main); margin-top:2px;">\${escapeHtml(status.currentJob.document.originalFilename)}</div>
            <div style="font-size:11px; color:#065f46; margin-top:2px;">\${status.currentJob.totalPages} page(s) &bull; Job #\${status.currentJob.id.slice(0,8)}</div>
          </div>
        \`;
      } else {
        jobSec.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:6px 2px;">🟢 Idle &bull; Ready &amp; listening for paid customer print jobs...</div>';
      }

      const qCard = document.getElementById('counterQueueCard');
      if (qCard && qCard.style) {
        qCard.style.display = 'block';
      }
      if (selectedTokenOrderId) {
        renderTokenDetailsModal();
      }
    }

    async function switchToLocal() {
      await changeServerUrl('http://localhost:3000');
    }

    async function changeServerUrl(targetUrl) {
      const url = targetUrl || prompt('Enter website server address (e.g. http://localhost:3000 or https://printiva.co.in):');
      if (!url) return;
      try {
        const res = await fetch('/api/set-server-url', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ serverUrl: url })
        });
        const data = await res.json();
        if (res.ok) {
          lastRenderedPairedState = null;
          await refreshStatus(true);
          await refreshCounterQueue();
        } else {
          alert('Failed to change server: ' + (data.error || 'Invalid URL'));
        }
      } catch (err) {
        alert('Network error updating server URL');
      }
    }
    async function selectDefaultPrinter(printerName) {
      if (!printerName) return;
      try {
        const res = await fetch('/api/select-printer', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ printerName })
        });
        if (res.ok) {
          await refreshStatus(true);
        } else {
          const err = await res.json().catch(() => ({}));
          alert('Could not select printer: ' + (err.error || 'Server error'));
        }
      } catch (err) {
        alert('Network error selecting printer');
      }
    }

    async function toggleDisablePrinter(printerName) {
      if (!printerName) return;
      try {
        const res = await fetch('/api/toggle-disable-printer', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ printerName })
        });
        if (res.ok) {
          await refreshStatus(true);
        } else {
          const err = await res.json().catch(() => ({}));
          alert('Could not toggle printer: ' + (err.error || 'Server error'));
        }
      } catch (err) {
        alert('Network error updating printer setting');
      }
    }

    async function toggleColorPrinter(printerName, isColor, btnEl) {
      if (!printerName) return;
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerText = isColor ? 'Switching to Color...' : 'Switching to B&W...';
      }
      try {
        const res = await fetch('/api/toggle-color-printer', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ printerName, isColor })
        });
        if (res.ok) {
          if (lastStatusSnapshot) {
            if (!lastStatusSnapshot.printerColorOverrides || typeof lastStatusSnapshot.printerColorOverrides !== 'object') {
              lastStatusSnapshot.printerColorOverrides = {};
            }
            const nl = String(printerName).trim().toLowerCase();
            lastStatusSnapshot.printerColorOverrides[nl] = Boolean(isColor);
            if (Array.isArray(lastStatusSnapshot.printers)) {
              lastStatusSnapshot.printers.forEach(function(pr) {
                if (String(pr.name || '').trim().toLowerCase() === nl) {
                  pr.capabilities = Object.assign({}, pr.capabilities || {}, { colorSupport: Boolean(isColor) });
                  pr.isColorUserOverride = true;
                }
              });
            }
          }
          await refreshStatus(true);
          if (cachedCounterQueue && cachedCounterQueue.length > 0) {
            renderAgentQueueWithFilter();
          }
          if (selectedTokenOrderId) {
            renderTokenDetailsModal();
          }
        } else {
          const err = await res.json().catch(() => ({}));
          alert('Could not update color mode: ' + (err.error || 'Server error'));
        }
      } catch (err) {
        alert('Network error updating color mode');
      } finally {
        if (btnEl) btnEl.disabled = false;
      }
    }

    async function wakePrinter(printerName, btnEl) {
      if (!printerName) return;
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerText = 'Waking...';
      }
      try {
        const res = await fetch('/api/wake-printer', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ printerName })
        });
        if (res.ok) {
          await refreshStatus(true);
        } else {
          alert('Could not send wake command to printer.');
        }
      } catch (err) {
        alert('Network error communicating with desktop agent.');
      } finally {
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.innerText = '⚡ Wake Up';
        }
      }
    }

    let inFlightQueueFetch = null;
    let lastQueueFetchAt = 0;

    async function fetchCounterQueue() {
      if (inFlightQueueFetch) return inFlightQueueFetch;
      inFlightQueueFetch = (async () => {
        try {
          const res = await fetch('/api/counter-queue');
          if (!res.ok) return null;
          lastQueueFetchAt = Date.now();
          return await res.json();
        } catch (err) {
          return null;
        } finally {
          inFlightQueueFetch = null;
        }
      })();
      return inFlightQueueFetch;
    }

    let cachedCounterQueue = [];
    let confirmingCancelOrderId = null;
    let cancellingOrderIds = new Set();
    let approvingOrderIds = new Set();
    let queueMutationSeq = 0;
    let queueErrorNotice = null;
    let lastRenderedPrintersHtml = null;
    let lastRenderedQueueHtml = null;
    let lastRenderedModalHtml = null;
    let visibleQueueLimit = 40;

    function showMoreQueueItems() {
      visibleQueueLimit += 40;
      lastRenderedQueueHtml = null;
      renderAgentQueueWithFilter();
    }

    function getSnapshotPrintersByPool() {
      var all = (lastStatusSnapshot && Array.isArray(lastStatusSnapshot.printers)) ? lastStatusSnapshot.printers : [];
      var disabledSet = new Set(((lastStatusSnapshot && lastStatusSnapshot.disabledPrinters) || []).map(function(s) {
        return String(s || '').trim().toLowerCase();
      }));
      var overrides = (lastStatusSnapshot && lastStatusSnapshot.printerColorOverrides) || {};
      var overridesLower = {};
      Object.keys(overrides).forEach(function(k) {
        overridesLower[k.trim().toLowerCase()] = Boolean(overrides[k]);
      });
      var selectedLower = (lastStatusSnapshot && lastStatusSnapshot.selectedPrinter)
        ? String(lastStatusSnapshot.selectedPrinter).trim().toLowerCase()
        : '';

      var usable = all.filter(function(p) {
        if (!p || !p.name) return false;
        var nl = p.name.trim().toLowerCase();
        return !p.isDisabled && !disabledSet.has(nl);
      }).sort(function(a, b) {
        var aOnline = (a.status === 'online' || a.status === 'printing') ? 0 : 1;
        var bOnline = (b.status === 'online' || b.status === 'printing') ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        var aSel = (a.name || '').trim().toLowerCase() === selectedLower ? 0 : 1;
        var bSel = (b.name || '').trim().toLowerCase() === selectedLower ? 0 : 1;
        if (aSel !== bSel) return aSel - bSel;
        return (a.isDefault ? 0 : 1) - (b.isDefault ? 0 : 1);
      });

      var isColorFn = function(p) {
        var nl = (p.name || '').trim().toLowerCase();
        return overridesLower[nl] !== undefined ? overridesLower[nl] : Boolean(p.capabilities && p.capabilities.colorSupport);
      };
      return {
        bw: usable.filter(function(p) { return !isColorFn(p); }).map(function(p) { return p.name; }),
        color: usable.filter(function(p) { return isColorFn(p); }).map(function(p) { return p.name; }),
      };
    }

    function getPredictedPrintersForOrder(item) {
      var pools = getSnapshotPrintersByPool();
      var names = [];
      var addName = function(n) { if (n && names.indexOf(n) === -1) names.push(n); };
      var needsBw = Number(item.blackAndWhitePages || 0) > 0;
      var needsColor = Number(item.colorPages || 0) > 0;
      if (!needsBw && !needsColor) needsBw = true;
      if (needsBw && pools.bw.length > 0) addName(pools.bw[0]);
      if (needsColor && pools.color.length > 0) addName(pools.color[0]);
      return names;
    }

    function getAssignedPrintersForOrder(item) {
      var names = [];
      var addName = function(n) {
        if (n && names.indexOf(n) === -1) names.push(n);
      };
      if (Array.isArray(item.assignedPrinters)) {
        item.assignedPrinters.forEach(addName);
      }
      if (Array.isArray(item.jobs)) {
        item.jobs.forEach(function(j) {
          if (Array.isArray(j.printerNames)) j.printerNames.forEach(addName);
          else if (j.printerName) addName(j.printerName);
          if (Array.isArray(j.rangeAssignments)) {
            j.rangeAssignments.forEach(function(r) { addName(r.printerName); });
          }
        });
      }
      if (lastStatusSnapshot && Array.isArray(lastStatusSnapshot.activeDispatches)) {
        lastStatusSnapshot.activeDispatches.forEach(function(d) {
          if (d.orderId === item.id && d.printerName) addName(d.printerName);
        });
      }
      return names;
    }

    function openTokenDetails(orderId) {
      if (!orderId) return;
      selectedTokenOrderId = orderId;
      renderTokenDetailsModal();
    }

    function closeTokenDetails() {
      selectedTokenOrderId = null;
      var modal = document.getElementById('tokenDetailsModal');
      if (modal && modal.style) {
        modal.style.display = 'none';
      }
    }

    function renderTokenDetailsModal() {
      var modal = document.getElementById('tokenDetailsModal');
      var titleEl = document.getElementById('tokenModalTitle');
      var bodyEl = document.getElementById('tokenDetailsBody');
      if (!modal || !bodyEl || !selectedTokenOrderId) return;

      var item = cachedCounterQueue.find(function(i) { return i.id === selectedTokenOrderId; });
      if (!item) {
        closeTokenDetails();
        return;
      }

      if (modal.style) modal.style.display = 'flex';
      var tokenLabel = item.tokenNumber ? ('#' + item.tokenNumber) : ('#' + (item.publicId || '').slice(0, 4));
      var amountStr = '₹' + Number(item.totalAmount || 0).toFixed(2);
      var assignedPrinters = getAssignedPrintersForOrder(item);

      var activeDispatchesForOrder = (lastStatusSnapshot && Array.isArray(lastStatusSnapshot.activeDispatches))
        ? lastStatusSnapshot.activeDispatches.filter(function(d) { return d.orderId === item.id; })
        : [];
      var isCompleted = item.status === 'completed' || (Array.isArray(item.jobs) && item.jobs.length > 0 && item.jobs.every(function(j) { return j.status === 'completed'; }));
      var isPrintingNow = activeDispatchesForOrder.length > 0 || (!isCompleted && Array.isArray(item.jobs) && item.jobs.some(function(j) { return j.status === 'print_submitted' || j.liveRoutingStatus === 'printing'; }));

      if (titleEl) {
        titleEl.innerHTML = [
          '<span style="font-family:monospace; font-size:18px; font-weight:900; color:#064e3b; background:#ecfdf5; border:1px solid #a7f3d0; padding:3px 10px; border-radius:9px;">Token ' + escapeHtml(tokenLabel) + '</span>',
          '<span style="font-size:13px; font-weight:700; color:#047857;">' + amountStr + '</span>',
          '<span style="font-size:12px; font-weight:600; color:#64748b;">' + item.totalPages + ' page(s)</span>'
        ].join('');
      }

      var onlinePrinters = (lastStatusSnapshot && Array.isArray(lastStatusSnapshot.printers))
        ? lastStatusSnapshot.printers.filter(function(p) { return !p.isDisabled && ['online', 'printing'].includes(p.status); })
        : [];
      var onlineBwNames = onlinePrinters.filter(function(p) { return !(p.capabilities && p.capabilities.colorSupport); }).map(function(p) { return p.name; });
      var onlineColorNames = onlinePrinters.filter(function(p) { return Boolean(p.capabilities && p.capabilities.colorSupport); }).map(function(p) { return p.name; });

      var spotlightHtml = '';
      if (assignedPrinters.length > 0) {
        var verb = isPrintingNow ? 'Currently Printing On' : isCompleted ? 'Printed On' : 'Assigned Printer';
        var bannerBg = isPrintingNow ? '#fffbeb' : '#ecfdf5';
        var bannerBorder = isPrintingNow ? '#fde68a' : '#a7f3d0';
        var bannerAccent = isPrintingNow ? '#92400e' : '#065f46';
        spotlightHtml = [
          '<div style="background:' + bannerBg + '; border:1px solid ' + bannerBorder + '; border-radius:12px; padding:14px; margin-bottom:14px;">',
            '<div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:' + bannerAccent + ';">' + verb + ' (' + assignedPrinters.length + ' Printer' + (assignedPrinters.length > 1 ? 's' : '') + ')</div>',
            '<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">',
              assignedPrinters.map(function(pName) {
                return '<span style="display:inline-flex; align-items:center; gap:6px; background:#ffffff; border:1px solid ' + bannerBorder + '; color:#0f172a; padding:6px 12px; border-radius:10px; font-size:13.5px; font-weight:800;">🖨️ ' + escapeHtml(pName) + '</span>';
              }).join(''),
            '</div>',
          '</div>'
        ].join('');
      } else {
        var needsBw = Number(item.blackAndWhitePages || 0) > 0;
        var needsColor = Number(item.colorPages || 0) > 0;
        var poolHints = [];
        if (needsBw) {
          poolHints.push('<b>B&amp;W Pool:</b> ' + (onlineBwNames.length ? onlineBwNames.map(escapeHtml).join(', ') : 'No B&amp;W printer connected'));
        }
        if (needsColor) {
          poolHints.push('<b>Color Pool:</b> ' + (onlineColorNames.length ? onlineColorNames.map(escapeHtml).join(', ') : 'No Color printer connected'));
        }
        if (poolHints.length === 0) {
          poolHints.push('Printer will be selected automatically upon dispatch.');
        }
        spotlightHtml = [
          '<div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:13px 14px; margin-bottom:14px;">',
            '<div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#475569;">Awaiting Dispatch — Target Printer Pool</div>',
            '<div style="font-size:12.5px; color:#334155; margin-top:6px; line-height:1.5;">' + poolHints.join('<br/>') + '</div>',
          '</div>'
        ].join('');
      }

      var docs = Array.isArray(item.documents) ? item.documents : [];
      var jobs = Array.isArray(item.jobs) ? item.jobs : [];
      var docsHtml = docs.length === 0
        ? '<p style="font-size:12.5px; color:#64748b;">No documents attached to this token.</p>'
        : docs.map(function(doc, idx) {
            var matchingJobs = jobs.filter(function(j) { return j.documentId && doc.id && j.documentId === doc.id; });
            var primaryJob = matchingJobs[0] || jobs[idx] || null;

            var docPrinters = Array.isArray(doc.printerNames) && doc.printerNames.length > 0
              ? doc.printerNames
              : (primaryJob && Array.isArray(primaryJob.printerNames) && primaryJob.printerNames.length > 0)
                ? primaryJob.printerNames
                : (primaryJob && primaryJob.printerName ? [primaryJob.printerName] : []);

            var liveDispatch = (doc.id && lastStatusSnapshot && Array.isArray(lastStatusSnapshot.activeDispatches))
              ? lastStatusSnapshot.activeDispatches.find(function(d) { return d.orderId === item.id && primaryJob && d.jobId === primaryJob.id; })
              : null;
            if (liveDispatch && liveDispatch.printerName && docPrinters.indexOf(liveDispatch.printerName) === -1) {
              docPrinters.push(liveDispatch.printerName);
            }

            var jobPages = (primaryJob && Array.isArray(primaryJob.pages)) ? primaryJob.pages : [];
            var colorModesSummary = [];
            jobPages.forEach(function(pg) {
              var label = pg.colorMode === 'color' ? 'Color' : 'B&W';
              if (colorModesSummary.indexOf(label) === -1) colorModesSummary.push(label);
            });
            var modeText = colorModesSummary.length > 0 ? colorModesSummary.join(' + ') : (item.colorPages > 0 && item.blackAndWhitePages === 0 ? 'Color' : 'B&W');
            var docStatus = (primaryJob && (primaryJob.liveRoutingStatus || primaryJob.status)) || doc.jobStatus || item.status;
            var failReason = primaryJob && primaryJob.failureReason ? primaryJob.failureReason : null;

            var ranges = (doc.rangeAssignments && doc.rangeAssignments.length > 0)
              ? doc.rangeAssignments
              : (primaryJob && Array.isArray(primaryJob.rangeAssignments) ? primaryJob.rangeAssignments : []);

            var printerBlockHtml = '';
            if (ranges.length > 1 || (ranges.length === 1 && docPrinters.length > 1)) {
              printerBlockHtml = ranges.map(function(r) {
                return '<div style="font-size:11.5px; color:#065f46; background:#ecfdf5; border:1px solid #a7f3d0; padding:4px 9px; border-radius:7px; margin-top:4px; display:inline-flex; align-items:center; gap:6px; margin-right:6px;">' +
                  '<span>Pages ' + r.startPage + '–' + r.endPage + ' (' + (r.colorMode === 'color' ? 'Color' : 'B&W') + ')</span> &rarr; <b>🖨️ ' + escapeHtml(r.printerName) + '</b>' +
                '</div>';
              }).join('');
            } else if (docPrinters.length > 0) {
              printerBlockHtml = '<div style="margin-top:6px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
                docPrinters.map(function(pn) {
                  return '<span style="font-size:12px; font-weight:800; color:#064e3b; background:#d1fae5; border:1px solid #6ee7b7; padding:4px 10px; border-radius:8px; display:inline-flex; align-items:center; gap:5px;">🖨️ Printing/Assigned: ' + escapeHtml(pn) + '</span>';
                }).join('') +
              '</div>';
            } else {
              var pools = getSnapshotPrintersByPool();
              var wantsColor = colorModesSummary.indexOf('Color') !== -1;
              var wantsBw = colorModesSummary.indexOf('B&W') !== -1 || (!wantsColor && colorModesSummary.length === 0);
              var docPredicted = [];
              if (wantsBw && pools.bw.length > 0) docPredicted.push(pools.bw[0] + ' (B&W Pool)');
              if (wantsColor && pools.color.length > 0) docPredicted.push(pools.color[0] + ' (Color Pool)');
              printerBlockHtml = docPredicted.length > 0
                ? '<div style="margin-top:6px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
                    docPredicted.map(function(pn) {
                      return '<span style="font-size:12px; font-weight:700; color:#334155; background:#f1f5f9; border:1px solid #cbd5e1; padding:4px 10px; border-radius:8px; display:inline-flex; align-items:center; gap:5px;">🎯 Target Printer: ' + escapeHtml(pn) + '</span>';
                    }).join('') +
                  '</div>'
                : '<div style="margin-top:6px; font-size:11.5px; color:#991b1b; font-weight:600;">⚠️ No compatible printer currently connected for this mode</div>';
            }

            return [
              '<div style="border:1px solid #e2e8f0; border-radius:12px; padding:12px 14px; margin-bottom:9px; background:#ffffff;">',
                '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">',
                  '<div style="min-width:0; flex:1;">',
                    '<div style="font-size:13.5px; font-weight:700; color:#0f172a; word-break:break-word;">' + (idx + 1) + '. ' + escapeHtml(doc.filename || 'Document') + '</div>',
                    '<div style="font-size:11.5px; color:#64748b; margin-top:2px;">' + (doc.pageCount || (primaryJob && primaryJob.totalPages) || 1) + ' page(s) &bull; ' + escapeHtml(modeText) + ' &bull; Status: <b>' + escapeHtml(docStatus) + '</b></div>',
                  '</div>',
                  (doc.id && item.isPrecached !== false
                    ? '<a href="/api/document?documentId=' + encodeURIComponent(doc.id) + '" target="_blank" rel="noopener" class="btn-secondary" style="font-size:11px; padding:4px 9px; text-decoration:none;">View PDF ↗</a>'
                    : ''),
                '</div>',
                printerBlockHtml,
                (failReason ? '<div style="margin-top:6px; font-size:11.5px; color:#b91c1c; background:#fef2f2; border:1px solid #fecaca; padding:5px 9px; border-radius:7px;">⚠️ ' + escapeHtml(failReason) + '</div>' : ''),
              '</div>'
            ].join('');
          }).join('');

      const nextModalHtml = [
        spotlightHtml,
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">',
          '<span style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.04em; color:#475569;">Documents (' + docs.length + ')</span>',
          (item.copiesSummary ? '<span style="font-size:11.5px; font-weight:700; color:#0f172a;">' + escapeHtml(item.copiesSummary) + '</span>' : ''),
        '</div>',
        docsHtml
      ].join('');
      if (lastRenderedModalHtml !== nextModalHtml) {
        lastRenderedModalHtml = nextModalHtml;
        bodyEl.innerHTML = nextModalHtml;
      }
    }

    function updateQueueBadge() {
      const active = cachedCounterQueue.filter(i => (i.status === 'awaiting_payment' || (i.sideMode === 'double_sided' && i.status === 'partially_printed')) && !i.isExpired && (typeof i.remainingSeconds !== 'number' || i.remainingSeconds > 0));
      const badge = document.getElementById('counterQueueBadge');
      if (badge) {
        badge.innerText = active.length + ' waiting';
        if (badge.style) {
          badge.style.background = active.length > 0 ? '#fef3c7' : '#f1f5f9';
          badge.style.color = active.length > 0 ? '#92400e' : '#475569';
        }
      }
    }

    async function approveCounterOrder(orderId, duplexStep, btnEl) {
      if (approvingOrderIds.has(orderId)) return;
      if (typeof duplexStep === 'object' && duplexStep !== null && !btnEl) {
        btnEl = duplexStep;
        duplexStep = 'all';
      }
      duplexStep = duplexStep || 'all';
      approvingOrderIds.add(orderId);
      queueMutationSeq++;
      queueErrorNotice = null;

      if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '🖨️ Dispatching...';
      }

      const item = cachedCounterQueue.find(i => i.id === orderId);
      const originalStatus = item ? item.status : null;
      if (item) {
        if (duplexStep === 'odd') {
          item.status = 'partially_printed';
          item.duplexStep = 'odd_printed';
        } else {
          item.status = 'paid';
          if (!Array.isArray(item.jobs) || item.jobs.length === 0) {
            item.jobs = [{ id: 'pending', status: 'print_submitted', totalPages: item.totalPages }];
          } else {
            item.jobs.forEach(function(j) { j.status = 'print_submitted'; j.failureReason = null; });
          }
        }
        renderAgentQueueWithFilter();
        updateQueueBadge();
      }

      try {
        const res = await fetch('/api/approve-counter-order', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ orderId, duplexStep })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && (data.success || !data.error)) {
          approvingOrderIds.delete(orderId);
          await refreshCounterQueue();
          await refreshStatus(false);
        } else {
          approvingOrderIds.delete(orderId);
          if (item && originalStatus) {
            item.status = originalStatus;
          }
          queueErrorNotice = 'Approval failed: ' + (data.error || 'Server error');
          renderAgentQueueWithFilter();
          if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = '🖨️ Print &amp; Approve';
          }
        }
      } catch (e) {
        approvingOrderIds.delete(orderId);
        if (item && originalStatus) {
          item.status = originalStatus;
        }
        queueErrorNotice = 'Failed to approve order: Network error';
        renderAgentQueueWithFilter();
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.innerHTML = '🖨️ Print &amp; Approve';
        }
      }
    }

    function promptCancelCounterOrder(orderId) {
      queueErrorNotice = null;
      confirmingCancelOrderId = orderId;
      renderAgentQueueWithFilter();
    }

    function abortCancelCounterOrder() {
      confirmingCancelOrderId = null;
      renderAgentQueueWithFilter();
    }

    var dismissedOrderIds = new Set();
    function dismissQueueItem(orderId) {
      dismissedOrderIds.add(orderId);
      if (selectedTokenOrderId === orderId) closeTokenDetails();
      renderAgentQueueWithFilter();
    }
    function dismissAllInactiveOrders() {
      cachedCounterQueue.forEach(function(item) {
        if (item.status === 'cancelled' || item.status === 'completed' || item.status === 'expired' || item.isExpired) {
          dismissedOrderIds.add(item.id);
        }
      });
      renderAgentQueueWithFilter();
    }

    async function executeCancelOrder(orderId) {
      confirmingCancelOrderId = null;
      cancellingOrderIds.add(orderId);
      queueMutationSeq++;
      queueErrorNotice = null;
      renderAgentQueueWithFilter();

      try {
        const res = await fetch('/api/cancel-counter-order', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ orderId })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && (data.success || !data.error)) {
          const item = cachedCounterQueue.find(i => i.id === orderId);
          if (item) {
            item.status = 'cancelled';
          }
          cancellingOrderIds.delete(orderId);
          renderAgentQueueWithFilter();
          updateQueueBadge();
          await refreshCounterQueue();
        } else {
          cancellingOrderIds.delete(orderId);
          queueErrorNotice = 'Failed to cancel order: ' + (data.error || 'Server error');
          renderAgentQueueWithFilter();
        }
      } catch (e) {
        cancellingOrderIds.delete(orderId);
        queueErrorNotice = 'Network error cancelling order';
        renderAgentQueueWithFilter();
      }
    }

    function cancelCounterOrder(orderId, btnEl) {
      promptCancelCounterOrder(orderId);
    }

    async function completeCounterOrder(orderId, btnEl) {
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '⏳ Marking...';
      }
      queueMutationSeq++;
      queueErrorNotice = null;
      try {
        const res = await fetch('/api/complete-counter-order', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ orderId })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && (data.success || !data.error)) {
          const item = cachedCounterQueue.find(i => i.id === orderId);
          if (item) {
            item.status = 'completed';
            if (Array.isArray(item.jobs)) {
              item.jobs.forEach(function(j) { j.status = 'completed'; });
            }
          }
          renderAgentQueueWithFilter();
          updateQueueBadge();
          await refreshCounterQueue();
        } else {
          queueErrorNotice = 'Could not mark printed: ' + (data.error || 'Server error');
          renderAgentQueueWithFilter();
          if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = 'Mark Printed';
          }
        }
      } catch (e) {
        queueErrorNotice = 'Network error marking order printed';
        renderAgentQueueWithFilter();
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.innerHTML = 'Mark Printed';
        }
      }
    }

    function renderAgentQueueWithFilter() {
      const list = document.getElementById('counterQueueList');
      if (!list) return;
      const searchInput = document.getElementById('agentTokenSearchInput');
      const query = (searchInput && typeof searchInput.value === 'string' ? searchInput.value : '').trim().replace(/^#+/, '').toLowerCase();

      var errorNoticeHtml = queueErrorNotice ? [
        '<div style="background:#fef2f2; border:1px solid #fca5a5; color:#991b1b; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:600; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">',
          '<span>⚠️ ' + escapeHtml(queueErrorNotice) + '</span>',
          '<button type="button" class="btn-secondary" style="font-size:11px; padding:2px 8px; border-color:#f87171; color:#991b1b; cursor:pointer;" onclick="queueErrorNotice=null;renderAgentQueueWithFilter();">Dismiss</button>',
        '</div>'
      ].join('') : '';

      let items = cachedCounterQueue.filter(function(item) {
        return !dismissedOrderIds.has(item.id);
      });
      if (activeQueueFilter !== 'all') {
        items = items.filter(function(item) {
          var isDone = item.status === 'completed' || (Array.isArray(item.jobs) && item.jobs.length > 0 && item.jobs.every(function(j) { return j.status === 'completed'; }));
          var isWait = item.status === 'awaiting_payment' || (item.sideMode === 'double_sided' && item.status === 'partially_printed');
          var isAct = !isDone && !isWait && item.status !== 'cancelled' && item.status !== 'expired' && !item.isExpired;
          if (activeQueueFilter === 'waiting') return isWait && !item.isExpired;
          if (activeQueueFilter === 'printing') return isAct;
          if (activeQueueFilter === 'completed') return isDone;
          return true;
        });
      }
      if (query) {
        items = items.filter(function(item) {
          var tokenStr = String(item.tokenNumber || '');
          var publicIdStr = String(item.publicId || '').toLowerCase();
          return tokenStr === query || tokenStr.startsWith(query) || publicIdStr.includes(query);
        });
      }

      if (items.length === 0) {
        const emptyHtml = query
          ? (errorNoticeHtml + '<p style="font-size:13px; color:var(--text-muted); padding:10px 0;">No counter orders found matching Token #' + escapeHtml(query) + '.</p>')
          : (errorNoticeHtml + '<p style="font-size:13px; color:var(--text-muted); padding:10px 0;">No active counter requests right now.</p>');
        if (lastRenderedQueueHtml !== emptyHtml) {
          lastRenderedQueueHtml = emptyHtml;
          list.innerHTML = emptyHtml;
        }
        return;
      }

      const displayItems = (!query && items.length > visibleQueueLimit) ? items.slice(0, visibleQueueLimit) : items;
      const hiddenCount = items.length - displayItems.length;
      const showMoreFooter = hiddenCount > 0
        ? '<div style="text-align:center; padding:10px 0;"><button type="button" class="btn-secondary" style="font-size:12px; font-weight:700; padding:6px 14px; cursor:pointer;" onclick="showMoreQueueItems()">Show more orders (' + hiddenCount + ' older hidden)</button></div>'
        : '';

      const nextListHtml = errorNoticeHtml + displayItems.map(function(item) {
        var isDouble = item.sideMode === "double_sided";
        var isCancelled = item.status === "cancelled";
        var isCompleted = item.status === "completed" || (Array.isArray(item.jobs) && item.jobs.length > 0 && item.jobs.every(function(j) { return j.status === 'completed'; }));
        var isPartiallyPrinted = item.status === "partially_printed";
        var isOddDone = isDouble && (item.status === "partially_printed" || item.duplexStep === "odd_printed" || item.duplexStep === "even");
        var isExpired = !isCancelled && !isCompleted && !isPartiallyPrinted && !isOddDone && (item.isExpired || item.status === "expired" || (typeof item.remainingSeconds === "number" && item.remainingSeconds <= 0) || (item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()));
        var hasFailedJobs = !isCancelled && !isExpired && !isCompleted && (item.status === "failed" || (Array.isArray(item.jobs) && item.jobs.length > 0 && item.jobs.some(function(j) { return j.status === 'failed'; })));
        var failureMessage = hasFailedJobs ? ((Array.isArray(item.jobs) ? item.jobs.find(function(j) { return j.status === 'failed' && j.failureReason; }) : null) || {}).failureReason : null;
        var isPrinting = !isCancelled && !isExpired && !isCompleted && !hasFailedJobs && (item.status === "paid" || item.status === "printing" || item.status === "partially_printed") && Array.isArray(item.jobs) && item.jobs.some(function(j) { return j.status === 'print_submitted'; });
        var isProcessing = !isCancelled && !isExpired && !isCompleted && !isPrinting && !hasFailedJobs && (item.status === "paid" || item.status === "printing" || (Array.isArray(item.jobs) && item.jobs.some(function(j) { return j.status === 'queued' || j.status === 'claimed'; })));
        var totalSecs = (isCompleted || isCancelled) ? 0 : Math.max(0, item.remainingSeconds || 0);
        var minutesLeft = Math.floor(totalSecs / 60);
        var secondsLeft = totalSecs % 60;
        var validText = (isCompleted || isCancelled) ? "" : minutesLeft > 0 ? (minutesLeft + "m valid") : (secondsLeft + "s valid");
        var isPrecached = item.isPrecached !== false;
        var docNames = (item.documents || []).map(function(d) { return escapeHtml(d.filename); }).join(", ");
        var tokenLabel = item.tokenNumber ? ("#" + item.tokenNumber) : ("#" + (item.publicId || '').slice(0, 4));
        var assignedPrinters = getAssignedPrintersForOrder(item);

        var statusText = isCancelled
          ? "Cancelled"
          : isCompleted
          ? "Printed"
          : hasFailedJobs
          ? (failureMessage ? ("Hold / Failed: " + escapeHtml(failureMessage)) : "Print Held / Needs Force Print")
          : isPrinting
          ? "Printing Pages..."
          : isProcessing
          ? "Processing..."
          : isOddDone
          ? "Front Side Printed — Reload Tray for Back Side"
          : (!isDouble && isPartiallyPrinted)
          ? "Partially Printed"
          : isExpired
          ? "Expired (1 hr)"
          : (!isPrecached)
          ? "Ready to Print (auto-caching)"
          : validText;

        var statusColor = isCancelled
          ? "#dc2626"
          : isCompleted
          ? "#059669"
          : hasFailedJobs
          ? "#dc2626"
          : isPrinting
          ? "#d97706"
          : isProcessing
          ? "#2563eb"
          : isOddDone
          ? "#d97706"
          : (!isDouble && isPartiallyPrinted)
          ? "#d97706"
          : isExpired
          ? "#dc2626"
          : "#d97706";

        var borderCol = isCancelled
          ? "#fecaca"
          : isCompleted
          ? "#a7f3d0"
          : hasFailedJobs
          ? "#fca5a5"
          : isPrinting
          ? "#fde68a"
          : isProcessing
          ? "#bfdbfe"
          : isOddDone
          ? "#fde68a"
          : (!isDouble && isPartiallyPrinted)
          ? "#fde68a"
          : isExpired
          ? "#e2e8f0"
          : "#fde68a";

        var bgCol = isCancelled
          ? "#fef2f2"
          : isCompleted
          ? "#f0fdf4"
          : hasFailedJobs
          ? "#fef2f2"
          : isPrinting
          ? "#fffbeb"
          : isProcessing
          ? "#eff6ff"
          : isOddDone
          ? "#fffbeb"
          : (!isDouble && isPartiallyPrinted)
          ? "#fffbeb"
          : isExpired
          ? "#f8fafc"
          : "#fffbeb";

        var tokenCol = isCancelled
          ? "#991b1b"
          : isCompleted
          ? "#065f46"
          : hasFailedJobs
          ? "#991b1b"
          : isPrinting
          ? "#b45309"
          : isProcessing
          ? "#1d4ed8"
          : isOddDone
          ? "#b45309"
          : (!isDouble && isPartiallyPrinted)
          ? "#b45309"
          : isExpired
          ? "#64748b"
          : "#b45309";

        var safeOrderId = safeDomId(item.id);
        var isConfirmingCancel = confirmingCancelOrderId === item.id;
        var isCancelling = cancellingOrderIds.has(item.id);

        var actionHtml = "";
        if (isCancelling) {
          actionHtml = '<span style="font-size:12px; font-weight:700; color:#dc2626; padding:6px 10px;">⏳ Cancelling...</span>';
        } else if (isConfirmingCancel) {
          actionHtml = [
            '<span style="font-size:12px; font-weight:700; color:#dc2626; display:flex; align-items:center; margin-right:4px;">Cancel order?</span>',
            '<button type="button" class="btn-secondary" style="background:#dc2626; color:#ffffff; border-color:#dc2626; font-size:12px; font-weight:700; padding:6px 12px; cursor:pointer;" onclick="executeCancelOrder(',
            "'", safeOrderId, "'",
            ')">Yes, Cancel</button>',
            '<button type="button" class="btn-secondary" style="font-size:12px; padding:6px 10px; cursor:pointer;" onclick="abortCancelCounterOrder()">Keep</button>'
          ].join("");
        } else if (hasFailedJobs) {
          actionHtml = [
            '<span style="font-size:11px; font-weight:700; color:#dc2626; background:#fef2f2; border:1px solid #fca5a5; padding:5px 8px; border-radius:7px; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;">⚠️ Print Held</span>',
            '<button type="button" class="btn-primary" style="width:auto; padding:5px 12px; font-size:11.5px; font-weight:700; background:#059669; border-color:#059669; cursor:pointer;" onclick="approveCounterOrder(',
            "'", safeOrderId, "', 'all', this",
            ')">🖨️ Force Print</button>',
            '<button type="button" class="btn-secondary" style="font-size:11px; padding:5px 8px; cursor:pointer;" onclick="completeCounterOrder(',
            "'", safeOrderId, "', this",
            ')" title="Mark as completed">Mark Printed</button>',
            '<button type="button" class="btn-secondary" style="color:#dc2626; border-color:#fca5a5; font-size:11px; padding:5px 8px; cursor:pointer;" onclick="promptCancelCounterOrder(',
            "'", safeOrderId, "'",
            ')" title="Stop and cancel this order">Cancel</button>'
          ].join("");
        } else if (isProcessing) {
          actionHtml = [
            '<span style="font-size:11.5px; font-weight:700; color:#2563eb; background:#eff6ff; border:1px solid #bfdbfe; padding:5px 9px; border-radius:7px; display:inline-flex; align-items:center; gap:5px; white-space:nowrap;">⏳ Processing...</span>',
            '<button type="button" class="btn-primary" style="width:auto; padding:5px 10px; font-size:11px;" onclick="approveCounterOrder(',
            "'", safeOrderId, "', 'all', this",
            ')">🖨️ Force Print</button>',
            '<button type="button" class="btn-secondary" style="font-size:11px; padding:5px 8px; cursor:pointer;" onclick="completeCounterOrder(',
            "'", safeOrderId, "', this",
            ')" title="Mark as completed">Mark Printed</button>',
            '<button type="button" class="btn-secondary" style="color:#dc2626; border-color:#fca5a5; font-size:11px; padding:5px 8px; cursor:pointer;" onclick="promptCancelCounterOrder(',
            "'", safeOrderId, "'",
            ')" title="Stop and cancel this order">Cancel</button>'
          ].join("");
        } else if (isPrinting) {
          actionHtml = [
            '<span style="font-size:11.5px; font-weight:700; color:#b45309; background:#fffbeb; border:1px solid #fde68a; padding:5px 9px; border-radius:7px; display:inline-flex; align-items:center; gap:5px; white-space:nowrap;">🖨️ Printing Pages...</span>',
            '<button type="button" class="btn-primary" style="width:auto; padding:5px 10px; font-size:11px; font-weight:700; background:#059669; border-color:#059669; cursor:pointer;" onclick="completeCounterOrder(',
            "'", safeOrderId, "', this",
            ')">Mark Printed</button>',
            '<button type="button" class="btn-secondary" style="color:#dc2626; border-color:#fca5a5; font-size:11px; padding:5px 8px; cursor:pointer;" onclick="promptCancelCounterOrder(',
            "'", safeOrderId, "'",
            ')" title="Stop and cancel this print job">Cancel</button>'
          ].join("");
        } else if (isCompleted) {
          actionHtml = [
            '<span style="font-size:12px; font-weight:700; color:#059669; background:#ecfdf5; border:1px solid #a7f3d0; padding:6px 10px; border-radius:8px;">✅ Printed</span>',
            '<button type="button" class="btn-secondary" style="font-size:11px; padding:5px 10px; cursor:pointer;" onclick="approveCounterOrder(',
            "'", safeOrderId, "', 'all', this",
            ')" title="Send to printer again if paper jammed or misprinted">🖨️ Re-Print</button>',
            '<button type="button" class="btn-secondary" style="font-size:10.5px; padding:4px 8px; color:#64748b; cursor:pointer;" onclick="dismissQueueItem(',
            "'", safeOrderId, "'",
            ')" title="Remove from queue view">Dismiss</button>'
          ].join("");
        } else if (isDouble && !isCancelled && !isExpired) {
          if (isOddDone) {
            actionHtml = [
              '<button type="button" class="btn-primary" style="width:auto; padding:7px 14px; font-size:12px; background:linear-gradient(to bottom, #f59e0b, #d97706); box-shadow:0 0 10px rgba(245, 158, 11, 0.4);" onclick="approveCounterOrder(',
              "'", safeOrderId, "', 'even', this",
              ')">🔄 Print Next Side (Even)</button>',
              '<button type="button" class="btn-secondary" style="font-size:11px; padding:6px 10px; cursor:pointer;" onclick="approveCounterOrder(',
              "'", safeOrderId, "', 'all', this",
              ')" title="Re-dispatch all pages">🖨️ Re-Print</button>'
            ].join("");
          } else {
            actionHtml = [
              '<button type="button" class="btn-primary" style="width:auto; padding:7px 14px; font-size:12px; background:linear-gradient(to bottom, #10b981, #059669);" onclick="approveCounterOrder(',
              "'", safeOrderId, "', 'odd', this",
              ')">🖨️ Print Front (Odd)</button>',
              '<button type="button" class="btn-secondary" style="color:#dc2626; border-color:#fca5a5; cursor:pointer;" onclick="promptCancelCounterOrder(',
              "'", safeOrderId, "'",
              ')">Cancel</button>'
            ].join("");
          }
        } else if (!isDouble && isPartiallyPrinted) {
          actionHtml = [
            '<span style="font-size:12px; font-weight:700; color:#b45309; background:#fffbeb; border:1px solid #fde68a; padding:6px 10px; border-radius:8px;">⚠️ Partially Printed</span>',
            '<button type="button" class="btn-secondary" style="font-size:11px; padding:6px 10px; cursor:pointer;" onclick="approveCounterOrder(',
            "'", safeOrderId, "', 'all', this",
            ')" title="Re-dispatch all pages">🖨️ Re-Print</button>'
          ].join("");
        } else if (!isCancelled && !isExpired) {
          actionHtml = [
            '<button type="button" class="btn-primary" style="width:auto; padding:7px 14px; font-size:12px;" onclick="approveCounterOrder(',
            "'", safeOrderId, "', 'all', this",
            ')">🖨️ Print &amp; Approve</button>',
            '<button type="button" class="btn-secondary" style="color:#dc2626; border-color:#fca5a5; cursor:pointer;" onclick="promptCancelCounterOrder(',
            "'", safeOrderId, "'",
            ')">Cancel</button>'
          ].join("");
        } else if (isCancelled) {
          actionHtml = [
            '<span style="font-size:12px; font-weight:700; color:#dc2626; padding:6px 10px;">❌ Cancelled</span>',
            '<button type="button" class="btn-secondary" style="font-size:10.5px; padding:4px 8px; color:#64748b; cursor:pointer;" onclick="dismissQueueItem(',
            "'", safeOrderId, "'",
            ')" title="Remove from queue view">Dismiss</button>'
          ].join("");
        } else if (isExpired) {
          actionHtml = [
            '<span style="font-size:12px; font-weight:700; color:#dc2626; padding:6px 10px;">⏰ Expired</span>',
            '<button type="button" class="btn-secondary" style="font-size:10.5px; padding:4px 8px; color:#64748b; cursor:pointer;" onclick="dismissQueueItem(',
            "'", safeOrderId, "'",
            ')" title="Remove from queue view">Dismiss</button>'
          ].join("");
        } else {
          actionHtml = '<span style="font-size:12px; color:var(--text-muted); padding:6px 10px;">Expired</span>';
        }

        var amountStr = '₹' + Number(item.totalAmount || 0).toFixed(2);
        var predictedPrinters = assignedPrinters.length === 0 ? getPredictedPrintersForOrder(item) : [];
        var visiblePrinters = assignedPrinters.length > 0 ? assignedPrinters : predictedPrinters;
        var isPredictedOnly = assignedPrinters.length === 0 && predictedPrinters.length > 0;
        var badgePrinterLabel = visiblePrinters.length === 1
          ? visiblePrinters[0]
          : visiblePrinters.length > 1
            ? (visiblePrinters[0] + ' +' + (visiblePrinters.length - 1))
            : 'No Printer';
        var badgePrinterTitle = assignedPrinters.length > 0
          ? ('Assigned Printer(s): ' + assignedPrinters.join(', '))
          : predictedPrinters.length > 0
            ? ('Target Printer(s): ' + predictedPrinters.join(', '))
            : 'No compatible printer connected';
        var printerChipHtml = assignedPrinters.length > 0
          ? '<button type="button" class="printer-pill-inline' + (isPrinting ? ' printing' : '') + '" data-token-order-id="' + safeOrderId + '" onclick="openTokenDetails(\\'' + safeOrderId + '\\')" title="Click to inspect all documents & printers">🖨️ ' + escapeHtml(assignedPrinters.join(', ')) + '</button>'
          : predictedPrinters.length > 0
            ? '<button type="button" class="printer-pill-inline predicted" data-token-order-id="' + safeOrderId + '" onclick="openTokenDetails(\\'' + safeOrderId + '\\')" title="Target printer ready for this token — click for details">🖨️ Target: ' + escapeHtml(predictedPrinters.join(', ')) + '</button>'
            : '<button type="button" class="btn-secondary" style="font-size:10.5px; padding:2px 8px; border-radius:999px; color:#991b1b; border-color:#fecaca; background:#fef2f2;" data-token-order-id="' + safeOrderId + '" onclick="openTokenDetails(\\'' + safeOrderId + '\\')" title="Click to inspect document routing">⚠️ No Printer &bull; Info ↗</button>';

        return [
          '<div class="token-row" style="border-color:' + borderCol + '; background:' + bgCol + ';">',
            '<div style="display:flex; align-items:center; gap:12px; flex:1 1 auto; min-width:0; overflow:hidden;">',
              '<button type="button" class="token-badge-btn" data-token-order-id="' + safeOrderId + '" onclick="openTokenDetails(\\'' + safeOrderId + '\\')" title="Click to view which printer is printing this token" style="border:2px solid ' + (isCompleted ? '#a7f3d0' : isPrinting ? '#fde68a' : isCancelled ? '#fca5a5' : '#cbd5e1') + ';">',
                '<div style="font-family:monospace; font-weight:900; font-size:18px; color:' + tokenCol + '; line-height:1.1;">' + tokenLabel + '</div>',
                '<div style="font-size:11px; font-weight:800; color:' + (isCancelled ? '#991b1b' : '#047857') + '; margin-top:3px; background:' + (isCancelled ? '#fef2f2' : '#ecfdf5') + '; border-radius:5px; padding:1px 6px; border:1px solid ' + (isCancelled ? '#fecaca' : '#a7f3d0') + '; white-space:nowrap; line-height:1.2;">' + amountStr + '</div>',
                '<div class="token-badge-printer' + (isPrinting ? ' printing' : isPredictedOnly ? ' predicted' : '') + '" title="' + escapeHtml(badgePrinterTitle) + '">🖨️ ' + escapeHtml(badgePrinterLabel) + '</div>',
              '</button>',
              '<div style="flex:1 1 auto; min-width:0; overflow:hidden;">',
                '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">',
                  '<button type="button" class="token-link-btn" data-token-order-id="' + safeOrderId + '" onclick="openTokenDetails(\\'' + safeOrderId + '\\')" title="Click to see exact printer assignment">Token ' + tokenLabel + '</button>',
                  '<span style="font-size:12px; font-weight:800; color:#047857; background:#d1fae5; border:1px solid #6ee7b7; padding:1px 8px; border-radius:6px; white-space:nowrap;">' + amountStr + '</span>',
                  '<span style="font-size:12px; font-weight:600; color:var(--text-muted);">&bull; ' + item.totalPages + ' Pages (' + item.blackAndWhitePages + ' B&amp;W, ' + item.colorPages + ' Color)</span>',
                  printerChipHtml,
                '</div>',
                '<div style="font-size:11.5px; color:var(--text-muted); margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%;" title="' + escapeHtml(docNames) + '">',
                  (item.copiesSummary ? ('<b style="color:var(--text-main);">' + escapeHtml(item.copiesSummary) + '</b> &bull; ') : '') + docNames + ' &bull; <span style="font-weight:700; color:' + statusColor + ';">' + statusText + '</span>',
                '</div>',
              '</div>',
            '</div>',
            '<div style="display:flex; gap:8px; align-items:center; flex:0 0 auto; flex-shrink:0; justify-content:flex-end; white-space:nowrap;">' + actionHtml + '</div>',
          '</div>'
        ].join("");
      }).join("") + showMoreFooter;

      if (lastRenderedQueueHtml !== nextListHtml) {
        lastRenderedQueueHtml = nextListHtml;
        list.innerHTML = nextListHtml;
      }

      if (selectedTokenOrderId) {
        renderTokenDetailsModal();
      }
    }

    async function refreshCounterQueue() {
      const qCard = document.getElementById('counterQueueCard');
      if (!qCard) return;
      const myMutSeq = queueMutationSeq;
      const data = await fetchCounterQueue();
      if (myMutSeq !== queueMutationSeq || approvingOrderIds.size > 0) return;
      const list = document.getElementById('counterQueueList');
      if (!list) return;

      if (data && data.error) {
        list.innerHTML = [
          '<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:12px; font-size:12px; color:#92400e; line-height:1.5;">',
            '<b>⚠️ Connection Notice:</b> ' + escapeHtml(data.error) + ' (Server: ' + escapeHtml(data.serverUrl || '') + ')<br/>',
            '<span style="font-size:11px; color:#b45309;">If running locally, switch this agent to connect to http://localhost:3000:</span><br/>',
            '<button type="button" class="btn-secondary" style="margin-top:6px; font-size:11px;" onclick="switchToLocal()">Switch to Localhost:3000</button>',
          '</div>'
        ].join("");
        return;
      }

      if (!data || !Array.isArray(data.queue)) return;

      cachedCounterQueue = data.queue;
      updateQueueBadge();
      renderAgentQueueWithFilter();
    }

    function renderWhatsAppEventsHtml(events) {
      if (!events || events.length === 0) return '';
      return '<div style="margin-top:14px; border-top:1px solid #e2e8f0; padding-top:8px;">' +
        '<p style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:8px;">Recent WhatsApp Orders</p>' +
        '<div style="max-height:160px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">' +
        events.map(function(e) {
          var actionHtml = e.configUrl
            ? '<a href="' + safeHref(e.configUrl) + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex; align-items:center; font-size:10.5px; color:#065f46; background:#d1fae5; border:1px solid #a7f3d0; border-radius:6px; padding:3px 8px; font-weight:700; text-decoration:none; white-space:nowrap; flex-shrink:0;">Open Config ↗</a>'
            : (e.status === 'retrying'
              ? '<span style="color:#d97706; font-size:10.5px; font-weight:600; display:inline-flex; align-items:center; gap:3px; white-space:nowrap; flex-shrink:0;">🔄 Retrying</span>'
              : '<span style="color:#ef4444; font-size:10.5px; font-weight:600; white-space:nowrap; flex-shrink:0;">Failed</span>');

          return '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 10px; font-size:12px; overflow:hidden; box-sizing:border-box;">' +
            '<div style="flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + escapeHtml(e.senderName) + ' (' + escapeHtml(e.senderPhone) + ') · ' + escapeHtml(e.filename) + '">' +
              '<b>' + escapeHtml(e.senderName) + '</b> (' + escapeHtml(e.senderPhone) + ') · <span style="color:#059669; font-weight:600;">' + escapeHtml(e.filename) + '</span> (' + (e.pageCount || 0) + 'p)' +
            '</div>' +
            '<div style="display:flex; align-items:center; gap:6px; flex:0 0 auto; flex-shrink:0; white-space:nowrap;">' +
              '<span style="font-size:10.5px; color:#64748b;">' + escapeHtml(e.timestamp) + '</span>' +
              actionHtml +
            '</div>' +
          '</div>';
        }).join('') +
        '</div></div>';
    }

    async function refreshWhatsApp() {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (!res.ok) return;
        const data = await res.json();
        const badge = document.getElementById('whatsappStatusBadge');
        const body = document.getElementById('whatsappBody');
        if (!body || !badge) return;

        if (data.state === 'connected') {
          badge.className = 'badge badge-online';
          badge.innerHTML = '<span class="status-dot"></span> Active (' + escapeHtml(data.connectedPhone || 'Linked') + ')';
          body.innerHTML = [
            '<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px; font-size:13px; color:#14532d; display:flex; justify-content:space-between; align-items:center; gap:8px; box-sizing:border-box; overflow:hidden;">',
              '<div style="flex:1 1 auto; min-width:0;">',
                '<b>✅ WhatsApp Connected:</b> Listening for customer documents on <b>' + escapeHtml(data.connectedPhone || 'Your WhatsApp') + '</b>.<br/>',
                '<span style="font-size:11.5px; color:#166534;">Auto-reply with document configuration link is live.</span>',
              '</div>',
              '<button type="button" class="btn-secondary" style="font-size:11px; color:#b91c1c; border-color:#fca5a5; flex:0 0 auto; flex-shrink:0; white-space:nowrap;" onclick="disconnectWhatsApp(false)">Unlink</button>',
            '</div>',
            renderWhatsAppEventsHtml(data.recentEvents)
          ].join('');
        } else if (data.isSavedSession || data.connectedPhone) {
          badge.className = 'badge';
          badge.style.background = '#fef3c7';
          badge.style.color = '#92400e';
          badge.innerHTML = '<span class="status-dot pulse-dot" style="background:#f59e0b;"></span> Reconnecting (' + escapeHtml(data.connectedPhone || 'Saved') + ')';
          body.innerHTML = [
            '<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:12px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; box-sizing:border-box; overflow:hidden;">',
              '<div style="flex:1 1 200px; min-width:0;">',
                '<div style="display:flex; align-items:center; gap:6px;">',
                  '<span style="font-size:13px; font-weight:700; color:#92400e;">⚡ Paired WhatsApp: ' + escapeHtml(data.connectedPhone || 'Saved Phone') + '</span>',
                '</div>',
                '<p style="font-size:11.5px; color:#b45309; margin-top:3px; line-height:1.4;">',
                  'Waiting for internet connection. Auto-reconnects automatically.',
                '</p>',
              '</div>',
              '<div style="display:flex; gap:6px; flex:0 0 auto; flex-shrink:0; white-space:nowrap;">',
                '<button type="button" class="btn-secondary" style="font-size:11px; white-space:nowrap;" onclick="connectWhatsApp()">🔄 Retry Now</button>',
                '<button type="button" class="btn-secondary" style="font-size:11px; color:#b91c1c; border-color:#fca5a5; white-space:nowrap;" onclick="disconnectWhatsApp(false)">Unlink</button>',
              '</div>',
            '</div>',
            renderWhatsAppEventsHtml(data.recentEvents)
          ].join('');
        } else if (data.state === 'qr_ready' && data.qrCodeDataUrl) {
          badge.className = 'badge';
          badge.style.background = '#fef3c7';
          badge.style.color = '#92400e';
          badge.innerText = 'Scan QR to Link';
          body.innerHTML = [
            '<div style="display:flex; flex-direction:column; align-items:center; text-align:center; padding:12px 0;">',
              '<img src="' + safeDataImageUrl(data.qrCodeDataUrl) + '" style="width:200px; height:200px; border-radius:12px; border:1px solid #cbd5e1; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); margin-bottom:12px;" alt="WhatsApp QR Code" />',
              '<p style="font-size:13px; font-weight:700; color:#0f172a; margin-bottom:4px;">Scan with your WhatsApp</p>',
              '<p style="font-size:12px; color:#64748b; max-width:320px; line-height:1.4;">',
                '1. Open WhatsApp on your phone<br/>',
                '2. Go to <b>Linked Devices</b> &gt; <b>Link a device</b><br/>',
                '3. Scan this QR code to connect your shop number',
              '</p>',
              '<div style="display:flex; gap:8px; margin-top:12px;">',
                '<button type="button" class="btn-primary" style="font-size:11px;" onclick="connectWhatsApp()">🔄 Refresh QR Code</button>',
                '<button type="button" class="btn-secondary" style="font-size:11px;" onclick="disconnectWhatsApp(true)">Cancel</button>',
              '</div>',
            '</div>'
          ].join('');
        } else if (data.state === 'connecting') {
          badge.className = 'badge';
          badge.style.background = '#e0f2fe';
          badge.style.color = '#0369a1';
          badge.innerText = 'Connecting...';
          body.innerHTML = [
            '<div style="text-align:center; padding:16px 0;">',
              '<p style="font-size:13px; font-weight:600; color:#0f172a;">Initializing WhatsApp connection...</p>',
              '<p style="font-size:11.5px; color:#64748b; margin-top:4px;">Preparing secure link session. A fresh QR code will appear in a moment.</p>',
              '<button type="button" class="btn-secondary" style="margin-top:12px; font-size:11px;" onclick="disconnectWhatsApp(true)">Cancel / Reset</button>',
            '</div>'
          ].join('');
        } else {
          badge.className = 'badge badge-offline';
          badge.innerHTML = '<span class="status-dot"></span> Disconnected';
          var errBanner = data.lastError ? '<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px 12px; margin-bottom:10px; font-size:12px; color:#991b1b;">⚠️ ' + escapeHtml(data.lastError) + '</div>' : '';
          body.innerHTML = [
            errBanner,
            '<div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; gap:10px;">',
              '<div>',
                '<p style="font-size:13px; font-weight:700; color:#0f172a;">Connect Your Shop WhatsApp</p>',
                '<p style="font-size:12px; color:#64748b; margin-top:2px;">Scan QR with your shop phone to start accepting documents directly from WhatsApp.</p>',
              '</div>',
              '<button type="button" class="btn-primary" style="font-size:12px; white-space:nowrap;" onclick="connectWhatsApp()">🟢 Connect WhatsApp</button>',
            '</div>'
          ].join('');
        }
      } catch (e) {}
    }

    async function connectWhatsApp() {
      try {
        await fetch('/api/whatsapp/connect', { method: 'POST' });
        await refreshWhatsApp();
      } catch (e) {
        alert('Failed to connect WhatsApp.');
      }
    }

    async function disconnectWhatsApp(force) {
      if (!force && !confirm('Are you sure you want to unlink WhatsApp from Printiva? You will need to scan the QR code again to reconnect.')) return;
      try {
        await fetch('/api/whatsapp/disconnect', { method: 'POST' });
        await refreshWhatsApp();
      } catch (e) {
        alert('Failed to disconnect WhatsApp.');
      }
    }

    refreshStatus(true);
    refreshCounterQueue();
    refreshWhatsApp();

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          refreshStatus(false);
          refreshCounterQueue();
          refreshWhatsApp();
        }
      });
      document.addEventListener('keydown', (ev) => {
        if (ev && ev.key === 'Escape' && selectedTokenOrderId) {
          closeTokenDetails();
        }
      });
      document.addEventListener('click', (ev) => {
        var target = ev && ev.target;
        if (target && typeof target.closest === 'function') {
          var trigger = target.closest('[data-token-order-id]');
          if (trigger && !trigger.getAttribute('onclick')) {
            var oid = trigger.getAttribute('data-token-order-id');
            if (oid) openTokenDetails(oid);
          }
        }
      });
    }

    let isPollingQueue = false;
    async function tickCounterQueue() {
      if (isPollingQueue || (typeof document !== 'undefined' && document.hidden)) return;
      isPollingQueue = true;
      try {
        await refreshCounterQueue();
      } catch (e) {
      } finally {
        isPollingQueue = false;
        var hasActiveJob = Array.isArray(cachedCounterQueue) && cachedCounterQueue.some(function(i) {
          var isCompleted = i.status === 'completed' || (Array.isArray(i.jobs) && i.jobs.length > 0 && i.jobs.every(function(j) { return j.status === 'completed'; }));
          return !isCompleted && (i.status === 'paid' || (Array.isArray(i.jobs) && i.jobs.some(function(j) { return j.status === 'queued' || j.status === 'claimed' || j.status === 'print_submitted'; })));
        });
        if (typeof setTimeout === 'function') {
          setTimeout(tickCounterQueue, hasActiveJob ? 1200 : 2000);
        }
      }
    }
    if (typeof setTimeout === 'function') {
      setTimeout(tickCounterQueue, 1500);
    }

    setInterval(() => { if (!document.hidden) refreshStatus(false); }, 20000);
    setInterval(() => { if (!document.hidden) refreshWhatsApp(); }, 6000);
  </script>
</body>
</html>`;
  }
}
