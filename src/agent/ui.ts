import http from "node:http";
import { agentDaemon } from "./daemon";
import { logger } from "./logger";
import { whatsAppAgent } from "./whatsapp";

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
      origin.includes("printiva.co.in");
    if (!isAllowedOrigin) {
      res.writeHead(403);
      res.end("Origin not allowed");
      return;
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-agent-token");

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

    if (url.pathname === "/api/trigger-poll" && (req.method === "POST" || req.method === "GET")) {
      void agentDaemon.triggerPoll();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Poll triggered" }));
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
          })
        );
      }
      return;
    }

    if (url.pathname === "/api/approve-counter-order" && req.method === "POST") {
      const body = await this.readJsonBody(req);
      const orderId = String(body?.orderId || "");
      if (!orderId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing orderId" }));
        return;
      }
      try {
        const data = await agentDaemon.approveCounterOrder(orderId);
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

    if (url.pathname === "/api/whatsapp/status" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(whatsAppAgent.getStatus()));
      return;
    }

    if (url.pathname === "/api/whatsapp/connect" && req.method === "POST") {
      void whatsAppAgent.start(false);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(whatsAppAgent.getStatus()));
      return;
    }

    if (url.pathname === "/api/whatsapp/disconnect" && req.method === "POST") {
      await whatsAppAgent.disconnect();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(whatsAppAgent.getStatus()));
      return;
    }

    // Default: Serve the upgraded modern Agent Dashboard UI
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(this.getDashboardHtml());
  }

  private readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => {
        data += chunk;
      });
      req.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
  }

  private getDashboardHtml(): string {
    const status = agentDaemon.getStatus();
    const serverUrl = status.serverUrl || "https://printiva.co.in";
    const shopPortalUrl = `${serverUrl}/shop/dashboard`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Printiva — Hardware Print Agent</title>
  <style>
    :root {
      --brand-950: #064e3b;
      --brand-900: #065f46;
      --brand-800: #047857;
      --brand-700: #059669;
      --brand-600: #10b981;
      --brand-500: #34d399;
      --brand-100: #d1fae5;
      --brand-50: #f0fdf4;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --danger: #ef4444;
      --danger-light: #fef2f2;
      --success: #10b981;
      --warning: #f59e0b;
      --radius: 16px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text-main);
      line-height: 1.5;
      padding: 24px;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 1040px; margin: 0 auto; }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(135deg, #064e3b 0%, #065f46 60%, #047857 100%);
      padding: 20px 28px;
      border-radius: var(--radius);
      box-shadow: 0 10px 25px -5px rgba(6, 78, 59, 0.25), 0 8px 10px -6px rgba(6, 78, 59, 0.2);
      margin-bottom: 24px;
      color: white;
    }
    .logo-area { display: flex; flex-direction: column; gap: 4px; }
    .logo {
      font-size: 22px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 10px;
      letter-spacing: -0.02em;
    }
    .logo-badge {
      font-size: 11px;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.25);
      padding: 2px 8px;
      border-radius: 6px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .tagline { font-size: 13px; color: #a7f3d0; font-weight: 400; }
    
    .header-actions { display: flex; align-items: center; gap: 14px; }
    
    .btn-dashboard {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: #ffffff;
      color: #065f46;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    .btn-dashboard:hover {
      background: #ecfdf5;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .badge-online { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .badge-offline { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .badge-unpaired { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }
    .pulse-dot {
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
      gap: 20px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 22px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      display: flex;
      flex-direction: column;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #f1f5f9;
    }
    .card-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-top: 14px;
    }
    .stat-box {
      background: #f8fafc;
      padding: 14px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      transition: border-color 0.2s;
    }
    .stat-box:hover { border-color: #cbd5e1; }
    .stat-label { font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 700; letter-spacing: 0.04em; }
    .stat-value { font-size: 24px; font-weight: 800; color: #065f46; margin-top: 4px; }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 0;
      border-bottom: 1px solid #f8fafc;
      font-size: 13px;
    }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: var(--text-muted); font-weight: 500; }
    .info-val { font-weight: 600; color: var(--text-main); }
    
    .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 20px;
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: #ffffff;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
      width: 100%;
      box-shadow: 0 4px 10px rgba(5, 150, 105, 0.2);
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #047857 0%, #065f46 100%);
      transform: translateY(-1px);
      box-shadow: 0 6px 14px rgba(5, 150, 105, 0.3);
    }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    
    .btn-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 9px 16px;
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
      border-radius: 9px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-secondary:hover { background: #e2e8f0; }

    .btn-danger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 18px;
      background: var(--danger-light);
      color: var(--danger);
      border: 1px solid #fecaca;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
      width: 100%;
      margin-top: 14px;
    }
    .btn-danger:hover { background: #fee2e2; color: #b91c1c; }

    .input-field {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid var(--border);
      border-radius: 9px;
      font-size: 13px;
      margin-top: 5px;
      margin-bottom: 12px;
      background: #f8fafc;
      transition: all 0.2s;
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
      margin-bottom: 16px;
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
      transition: all 0.2s ease;
    }
    .tab-btn.active {
      color: #065f46;
      background: #ffffff;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
    }

    .printer-card {
      padding: 12px 14px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
      transition: border-color 0.2s;
    }
    .printer-card:hover { border-color: #cbd5e1; }
    
    .status-panel-paired {
      background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
      border: 1px solid #a7f3d0;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-area">
        <div class="logo">
          Printiva
          <span class="logo-badge">Desktop Agent</span>
        </div>
        <div class="tagline">Zero-Touch Hardware Print Spooler</div>
      </div>
      <div class="header-actions">
        <div id="statusBadge" class="badge badge-offline">
          <span class="status-dot"></span> Checking Status...
        </div>
        <a id="headerPortalLink" class="btn-dashboard" href="${shopPortalUrl}" target="_blank" rel="noopener">
          <span>📊</span> Open Shop Dashboard
        </a>
      </div>
    </header>

    <!-- Counter Print Request Queue Card (Prominently Placed at the Top) -->
    <div class="card" id="counterQueueCard" style="margin-bottom: 24px; border: 2px solid #a7f3d0; background: #ffffff;">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="card-title" style="font-size:16px;"><span>🏷️</span> Counter Print Request Queue</span>
          <span id="counterQueueBadge" class="badge" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">0 waiting</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <input
            type="text"
            id="agentTokenSearchInput"
            placeholder="Search token # (e.g. 5)..."
            oninput="renderAgentQueueWithFilter()"
            style="padding:6px 10px; font-size:12px; border:1px solid #cbd5e1; border-radius:8px; outline:none; background:#f8fafc; width:180px;"
          />
        </div>
      </div>
      <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
        Showing today&apos;s requests (cleared daily at midnight). Click <b>Print &amp; Approve</b> to dispatch to default Windows printer.
      </p>
      <div id="counterQueueList" style="max-height:520px; overflow-y:auto; padding-right:4px;">
        <p style="font-size:13px; color:var(--text-muted); padding:10px 0;">No active counter requests.</p>
      </div>
    </div>

    <div class="grid">
      <!-- Connection & Authentication Card -->
      <div class="card" id="connectionCard">
        <div class="card-header">
          <span class="card-title"><span>🔗</span> Cloud Connection</span>
        </div>
        <div id="connectionDetails">
          <p style="font-size:13px; color:var(--text-muted);">Checking local pairing credentials...</p>
        </div>
      </div>

      <!-- WhatsApp Print Agent Card -->
      <div class="card" id="whatsappCard" style="border: 2px solid #6ee7b7; background: #ffffff;">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <span class="card-title"><span>💬</span> WhatsApp Direct Print Agent</span>
          <span id="whatsappStatusBadge" class="badge" style="background:#f1f5f9; color:#475569;">Checking...</span>
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
          Customers directly send documents to your shop WhatsApp. The agent automatically receives the file, creates a draft order, and replies with the page configuration &amp; print link!
        </p>
        <div id="whatsappBody">
          <p style="font-size:13px; color:var(--text-muted);">Loading WhatsApp status...</p>
        </div>
      </div>

      <!-- Connected Printers Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><span>🖨️</span> Hardware Printers</span>
          <span id="printerCount" class="badge" style="background:#f1f5f9; color:#475569; border:1px solid #e2e8f0;">0 detected</span>
        </div>
        <div id="printersList">
          <p style="font-size:13px; color:var(--text-muted); padding:10px 0;">Scanning Windows print queues...</p>
        </div>
      </div>

      <!-- Auto-Print Engine Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><span>⚡</span> Auto-Print Monitor</span>
        </div>
        <div id="activeJobSection" style="margin-bottom: 12px;"></div>
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
    </div>
  </div>

  <script>
    let activeAuthTab = 'pair';
    function escapeHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    }
    let lastRenderedPairedState = null;

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
      } catch (e) {
        // Clipboard access fallback
      }
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

      const activeServerUrl = status.serverUrl || 'https://printiva.co.in';
      const portalLink = document.getElementById('headerPortalLink');
      if (portalLink) portalLink.href = \`\${activeServerUrl}/shop/dashboard\`;

      status.printers = Array.isArray(status.printers)
        ? status.printers.filter(p => !/onenote|print to pdf|xps|fax|pdfcreator|cutepdf/i.test(p.name + ' ' + (p.driverName || '')) && !/^(nul:|portprompt:|file:)$/i.test(p.portName || ''))
        : [];
      const printerReady = status.printers.some(p => ['online', 'printing'].includes(p.status));

      // Status Badge
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

      // Render Connection Card
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
                <span class="status-dot pulse-dot" style="background:#10b981; width:10px; height:10px;"></span>
                <b style="color:#065f46; font-size:15px;">\${escapeHtml(status.shopName || 'Shop Connected')}</b>
              </div>
              <p style="font-size:12px; color:#047857; margin-top:4px;">Permanently Paired &bull; Automatic Cloud Spooling Active</p>
            </div>
            <div class="info-row"><span class="info-label">Shop Name</span><span class="info-val">\${escapeHtml(status.shopName || 'Connected')}</span></div>
            <div class="info-row"><span class="info-label">Station Name</span><span class="info-val">\${escapeHtml(status.agentName || 'Windows PC')}</span></div>
            <div class="info-row">
              <span class="info-label">Cloud Server</span>
              <span class="info-val" style="font-size:12px; color:#065f46; display:flex; align-items:center; gap:6px;">
                <span>\${escapeHtml(activeServerUrl)}</span>
                <button type="button" class="btn-secondary" style="padding:2px 8px; font-size:10px;" onclick="changeServerUrl()">Switch</button>
              </span>
            </div>
            <div class="info-row"><span class="info-label">Last Heartbeat</span><span class="info-val" style="font-size:12px;">\${status.lastHeartbeat ? new Date(status.lastHeartbeat).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) + ' IST' : 'Active'}</span></div>
            <button class="btn-danger" onclick="unpairAgent(this)">Disconnect Agent</button>
          \`;
        }
      }

      // Render Printers Card
      document.getElementById('printerCount').innerText = \`\${status.printers.length} detected\`;
      const pList = document.getElementById('printersList');
      if (status.printers.length === 0) {
        pList.innerHTML = '<p style="font-size:13px; color:var(--text-muted); padding:10px 0;">No physical printers detected. Plug in your USB printer or turn on network printer.</p>';
      } else {
        pList.innerHTML = \`
          <div style="font-size:11px; color:#065f46; background:#f0fdf4; border:1px solid #bbf7d0; padding:8px 12px; border-radius:8px; margin-bottom:12px; line-height:1.4;">
            ⚡ <b>Smart Auto-Spool:</b> Jobs are routed automatically to matching paper &amp; color hardware.
          </div>
        \` + status.printers.map(p => {
          const isColor = Boolean(p.capabilities && p.capabilities.colorSupport);
          const isOnline = ['online', 'printing'].includes(p.status);
          return \`
          <div class="printer-card">
            <div>
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:13px; font-weight:700; color:var(--text-main);">\${escapeHtml(p.name)}</span>
                <span class="badge" style="font-size:9px; \${isColor ? 'background:#ecfdf5; color:#047857; border:1px solid #a7f3d0;' : 'background:#f1f5f9; color:#475569; border:1px solid #e2e8f0;'}">
                  \${isColor ? '🎨 Color' : '📄 B&W'}
                </span>
                \${p.isDefault ? '<span class="badge badge-online" style="font-size:9px;">DEFAULT</span>' : ''}
              </div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">\${escapeHtml(p.driverName || 'Windows Spooler')}</div>
            </div>
            <div>
              <span class="badge \${isOnline ? 'badge-online' : 'badge-offline'}" style="font-size:10px;">
                \${isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        \`;
        }).join('');
      }

      // Stats & Active Job
      document.getElementById('statProcessed').innerText = status.stats.jobsProcessed;
      document.getElementById('statSubmitted').innerText = status.stats.jobsSubmitted;
      document.getElementById('statFailed').innerText = status.stats.jobsFailed;
      document.getElementById('statPages').innerText = status.stats.totalPagesSubmitted;

      const jobSec = document.getElementById('activeJobSection');
      if (status.currentJob) {
        jobSec.innerHTML = \`
          <div style="background:#ecfdf5; border:1px solid #6ee7b7; border-radius:10px; padding:12px;">
            <div style="font-size:11px; font-weight:800; color:#047857; letter-spacing:0.04em;">🔄 PRINTING IN PROGRESS</div>
            <div style="font-size:13px; font-weight:700; color:var(--text-main); margin-top:2px;">\${escapeHtml(status.currentJob.document.originalFilename)}</div>
            <div style="font-size:11px; color:#065f46; margin-top:2px;">\${status.currentJob.totalPages} page(s) &bull; Job #\${status.currentJob.id.slice(0,8)}</div>
          </div>
        \`;
      } else {
        jobSec.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:4px 0;">🟢 Idle &bull; Ready &amp; listening for paid customer print jobs...</div>';
      }

      // Counter Queue Section
      const qCard = document.getElementById('counterQueueCard');
      if (qCard) {
        if (qCard.style) qCard.style.display = 'block';
        void refreshCounterQueue();
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

    async function fetchCounterQueue() {
      try {
        const res = await fetch('/api/counter-queue');
        if (!res.ok) return null;
        return await res.json();
      } catch (err) {
        return null;
      }
    }

    let cachedCounterQueue = [];
    let confirmingCancelOrderId = null;
    let cancellingOrderIds = new Set();
    let queueErrorNotice = null;

    function updateQueueBadge() {
      const active = cachedCounterQueue.filter(i => i.status === 'awaiting_payment' && !i.isExpired);
      const badge = document.getElementById('counterQueueBadge');
      if (badge) {
        badge.innerText = active.length + ' waiting';
        if (badge.style) {
          badge.style.background = active.length > 0 ? '#fef3c7' : '#f1f5f9';
          badge.style.color = active.length > 0 ? '#92400e' : '#475569';
        }
      }
    }

    async function approveCounterOrder(orderId, btnEl) {
      queueErrorNotice = null;
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '🔄 Printing...';
      }
      try {
        const res = await fetch('/api/approve-counter-order', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ orderId })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && (data.success || !data.error)) {
          if (btnEl) {
            btnEl.innerHTML = '✅ Sent to Printer!';
          }
          const item = cachedCounterQueue.find(i => i.id === orderId);
          if (item) {
            item.status = 'paid';
          }
          updateQueueBadge();
          await refreshCounterQueue();
          await refreshStatus(false);
        } else {
          queueErrorNotice = 'Approval failed: ' + (data.error || 'Server error');
          renderAgentQueueWithFilter();
          if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = '🖨️ Print &amp; Approve';
          }
        }
      } catch (e) {
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

    async function executeCancelOrder(orderId) {
      confirmingCancelOrderId = null;
      cancellingOrderIds.add(orderId);
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
          // Optimistically update cached queue
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

      let items = cachedCounterQueue;
      if (query) {
        items = items.filter(function(item) {
          var tokenStr = String(item.tokenNumber || '');
          var publicIdStr = String(item.publicId || '').toLowerCase();
          return tokenStr === query || tokenStr.startsWith(query) || publicIdStr.includes(query);
        });
      }

      if (items.length === 0) {
        if (query) {
          list.innerHTML = errorNoticeHtml + '<p style="font-size:13px; color:var(--text-muted); padding:10px 0;">No counter orders found matching Token #' + escapeHtml(query) + '.</p>';
        } else {
          list.innerHTML = errorNoticeHtml + '<p style="font-size:13px; color:var(--text-muted); padding:10px 0;">No active counter requests right now.</p>';
        }
        return;
      }

      list.innerHTML = errorNoticeHtml + items.map(function(item) {
        var minutesLeft = Math.floor(item.remainingSeconds / 60);
        var isPaid = item.status === "paid" || item.status === "completed" || item.status === "printing";
        var isCancelled = item.status === "cancelled";
        var docNames = (item.documents || []).map(function(d) { return escapeHtml(d.filename); }).join(", ");
        var tokenLabel = item.tokenNumber ? ("#" + item.tokenNumber) : ("#" + (item.publicId || '').slice(0, 4));
        var statusText = isPaid
          ? "Approved / Printed"
          : isCancelled
          ? "Cancelled"
          : item.isExpired
          ? "Expired (1 hr)"
          : (minutesLeft + "m valid");
        var statusColor = isPaid
          ? "#059669"
          : isCancelled
          ? "#dc2626"
          : item.isExpired
          ? "#dc2626"
          : "#d97706";
        var borderCol = isPaid
          ? "#a7f3d0"
          : isCancelled
          ? "#fee2e2"
          : item.isExpired
          ? "#e2e8f0"
          : "#fde68a";
        var bgCol = isPaid
          ? "#ecfdf5"
          : isCancelled
          ? "#fef2f2"
          : item.isExpired
          ? "#f8fafc"
          : "#fffbeb";
        var tokenCol = isPaid
          ? "#065f46"
          : isCancelled
          ? "#991b1b"
          : item.isExpired
          ? "#64748b"
          : "#b45309";

        var isConfirmingCancel = confirmingCancelOrderId === item.id;
        var isCancelling = cancellingOrderIds.has(item.id);

        var actionHtml = "";
        if (isCancelling) {
          actionHtml = '<span style="font-size:12px; font-weight:700; color:#dc2626; padding:6px 10px;">⏳ Cancelling...</span>';
        } else if (isConfirmingCancel) {
          actionHtml = [
            '<span style="font-size:12px; font-weight:700; color:#dc2626; display:flex; align-items:center; margin-right:4px;">Cancel order?</span>',
            '<button type="button" class="btn-secondary" style="background:#dc2626; color:#ffffff; border-color:#dc2626; font-size:12px; font-weight:700; padding:6px 12px; cursor:pointer;" onclick="executeCancelOrder(',
            "'", item.id, "'",
            ')">Yes, Cancel</button>',
            '<button type="button" class="btn-secondary" style="font-size:12px; padding:6px 10px; cursor:pointer;" onclick="abortCancelCounterOrder()">Keep</button>'
          ].join("");
        } else if (!isPaid && !isCancelled && !item.isExpired) {
          actionHtml = [
            '<button type="button" class="btn-primary" style="width:auto; padding:7px 14px; font-size:12px;" onclick="approveCounterOrder(',
            "'", item.id, "', this",
            ')">🖨️ Print &amp; Approve</button>',
            '<button type="button" class="btn-secondary" style="color:#dc2626; border-color:#fca5a5; cursor:pointer;" onclick="promptCancelCounterOrder(',
            "'", item.id, "'",
            ')">Cancel</button>'
          ].join("");
        } else if (isPaid) {
          actionHtml = '<span style="font-size:12px; font-weight:700; color:#059669; padding:6px 10px;">✅ Printed via Agent</span>';
        } else if (isCancelled) {
          actionHtml = '<span style="font-size:12px; font-weight:700; color:#dc2626; padding:6px 10px;">❌ Cancelled</span>';
        } else {
          actionHtml = '<span style="font-size:12px; color:var(--text-muted); padding:6px 10px;">Expired</span>';
        }

        return [
          '<div style="display:flex; align-items:center; justify-content:space-between; padding:12px; margin-bottom:8px; border-radius:10px; border:1px solid ' + borderCol + '; background:' + bgCol + ';">',
            '<div style="display:flex; align-items:center; gap:12px;">',
              '<div style="font-family:monospace; font-weight:800; font-size:18px; color:' + tokenCol + '; background:#ffffff; padding:6px 12px; border-radius:8px; border:1px solid #e2e8f0;">' + tokenLabel + '</div>',
              '<div>',
                '<div style="font-size:13px; font-weight:700; color:var(--text-main);">',
                  'Token ' + tokenLabel + ' &bull; ' + item.totalPages + ' Pages (' + item.blackAndWhitePages + ' B&amp;W, ' + item.colorPages + ' Color)',
                '</div>',
                '<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">',
                  '₹' + Number(item.totalAmount).toFixed(2) + ' &bull; ' + docNames + ' &bull; ',
                  '<span style="font-weight:600; color:' + statusColor + ';">' + statusText + '</span>',
                '</div>',
              '</div>',
            '</div>',
            '<div style="display:flex; gap:8px; align-items:center;">' + actionHtml + '</div>',
          '</div>'
        ].join("");
      }).join("");
    }

    async function refreshCounterQueue() {
      const qCard = document.getElementById('counterQueueCard');
      if (!qCard) return;
      const data = await fetchCounterQueue();
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

          let eventsHtml = '';
          if (data.recentEvents && data.recentEvents.length > 0) {
            eventsHtml = '<div style="margin-top:14px; border-top:1px solid #e2e8f0; padding-top:8px;">' +
              '<p style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:8px;">Recent WhatsApp Orders</p>' +
              '<div style="max-height:160px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">' +
              data.recentEvents.map(function(e) {
                return '<div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 10px; font-size:12px;">' +
                  '<div>' +
                    '<b>' + escapeHtml(e.senderName) + '</b> (' + escapeHtml(e.senderPhone) + ') · <span style="color:#059669; font-weight:600;">' + escapeHtml(e.filename) + '</span> (' + e.pageCount + 'p)' +
                  '</div>' +
                  '<div style="display:flex; align-items:center; gap:8px;">' +
                    '<span style="font-size:11px; color:#64748b;">' + escapeHtml(e.timestamp) + '</span>' +
                    (e.configUrl ? '<a href="' + escapeHtml(e.configUrl) + '" target="_blank" style="font-size:11px; color:#059669; font-weight:600; text-decoration:underline;">Open Config</a>' : '<span style="color:#ef4444; font-size:11px;">Failed</span>') +
                  '</div>' +
                '</div>';
              }).join('') +
              '</div></div>';
          }

          body.innerHTML = [
            '<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px; font-size:13px; color:#14532d; display:flex; justify-content:space-between; align-items:center;">',
              '<div>',
                '<b>✅ WhatsApp Connected:</b> Listening for customer documents on <b>' + escapeHtml(data.connectedPhone || 'Your WhatsApp') + '</b>.<br/>',
                '<span style="font-size:11.5px; color:#166534;">Auto-reply with document configuration link is live.</span>',
              '</div>',
              '<button type="button" class="btn-secondary" style="font-size:11px; color:#b91c1c; border-color:#fca5a5;" onclick="disconnectWhatsApp()">Disconnect</button>',
            '</div>',
            eventsHtml
          ].join('');
        } else if (data.state === 'qr_ready' && data.qrCodeDataUrl) {
          badge.className = 'badge';
          badge.style.background = '#fef3c7';
          badge.style.color = '#92400e';
          badge.innerText = 'Scan QR to Link';

          body.innerHTML = [
            '<div style="display:flex; flex-direction:column; align-items:center; text-align:center; padding:12px 0;">',
              '<img src="' + data.qrCodeDataUrl + '" style="width:200px; height:200px; border-radius:12px; border:1px solid #cbd5e1; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); margin-bottom:12px;" alt="WhatsApp QR Code" />',
              '<p style="font-size:13px; font-weight:700; color:#0f172a; margin-bottom:4px;">Scan with your WhatsApp</p>',
              '<p style="font-size:12px; color:#64748b; max-width:320px; line-height:1.4;">',
                '1. Open WhatsApp on your phone<br/>',
                '2. Go to <b>Linked Devices</b> &gt; <b>Link a device</b><br/>',
                '3. Scan this QR code to connect your shop number',
              '</p>',
              '<div style="display:flex; gap:8px; margin-top:12px;">',
                '<button type="button" class="btn-primary" style="font-size:11px;" onclick="connectWhatsApp()">🔄 Refresh QR Code</button>',
                '<button type="button" class="btn-secondary" style="font-size:11px;" onclick="disconnectWhatsApp()">Cancel</button>',
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
              '<button type="button" class="btn-secondary" style="margin-top:12px; font-size:11px;" onclick="disconnectWhatsApp()">Cancel / Reset</button>',
            '</div>'
          ].join('');
        } else {
          badge.className = 'badge badge-offline';
          badge.innerHTML = '<span class="status-dot"></span> Disconnected';

          var errBanner = data.lastError ? '<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px 12px; margin-bottom:10px; font-size:12px; color:#991b1b;">⚠️ ' + escapeHtml(data.lastError) + '</div>' : '';

          body.innerHTML = [
            errBanner,
            '<div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px;">',
              '<div>',
                '<p style="font-size:13px; font-weight:700; color:#0f172a;">Connect Your Shop WhatsApp</p>',
                '<p style="font-size:12px; color:#64748b; margin-top:2px;">Scan QR with your shop phone to start accepting documents directly from WhatsApp.</p>',
              '</div>',
              '<button type="button" class="btn-primary" style="font-size:12px; white-space:nowrap;" onclick="connectWhatsApp()">🟢 Connect WhatsApp</button>',
            '</div>'
          ].join('');
        }
      } catch (e) {
        // ignore
      }
    }

    async function connectWhatsApp() {
      try {
        await fetch('/api/whatsapp/connect', { method: 'POST' });
        await refreshWhatsApp();
      } catch (e) {
        alert('Failed to connect WhatsApp.');
      }
    }

    async function disconnectWhatsApp() {
      if (!confirm('Are you sure you want to disconnect WhatsApp from Printiva?')) return;
      try {
        await fetch('/api/whatsapp/disconnect', { method: 'POST' });
        await refreshWhatsApp();
      } catch (e) {
        alert('Failed to disconnect WhatsApp.');
      }
    }

    refreshStatus(true);
    refreshWhatsApp();
    setInterval(() => refreshStatus(false), 3000);
    setInterval(() => refreshCounterQueue(), 2500);
    setInterval(() => refreshWhatsApp(), 2500);
  </script>
</body>
</html>`;
  }
}
