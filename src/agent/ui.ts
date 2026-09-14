import http from "node:http";
import { agentDaemon } from "./daemon";
import { logger } from "./logger";

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
          this.server?.listen(this.port);
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, "127.0.0.1", () => {
        logger.info(`PrintSathi Desktop Agent local dashboard running at http://127.0.0.1:${this.port}`);
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

    // CORS headers for local loopback
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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
      const code = String(body?.pairingCode || "").trim().toUpperCase().replace(/\s+/g, "");
      const name = body?.agentName ? String(body.agentName) : undefined;

      if (!code) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing pairingCode" }));
        return;
      }

      try {
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
      const printerName = String(body?.printerName || "");
      if (!printerName) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing printerName" }));
        return;
      }
      agentDaemon.selectPrinter(printerName);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, selectedPrinter: printerName }));
      return;
    }

    // Default: Serve HTML Dashboard
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
    const shopPortalUrl = `${status.serverUrl}/shop/dashboard`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PrintSathi — Desktop Print Agent</title>
  <style>
    :root {
      --primary: #0f766e;
      --primary-dark: #115e59;
      --primary-light: #f0fdf4;
      --accent: #10b981;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --danger: #ef4444;
      --success: #10b981;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text-main);
      line-height: 1.5;
      padding: 20px;
    }
    .container { max-width: 1060px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(135deg, #0f766e, #115e59);
      padding: 16px 24px;
      border-radius: 14px;
      box-shadow: 0 4px 16px rgba(15,118,110,0.2);
      margin-bottom: 20px;
      color: white;
    }
    .logo {
      font-size: 20px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logo span { color: #6ee7b7; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .btn-portal {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 18px;
      background: #10b981;
      color: #ffffff;
      border: none;
      border-radius: 9px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s, transform 0.1s;
      box-shadow: 0 2px 6px rgba(16,185,129,0.3);
    }
    .btn-portal:hover { background: #059669; transform: translateY(-1px); }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
      text-transform: uppercase;
    }
    .badge-online { background: #dcfce7; color: #15803d; }
    .badge-offline { background: #fee2e2; color: #b91c1c; }
    .badge-unpaired { background: #fef3c7; color: #b45309; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 18px;
      margin-bottom: 20px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .card-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--primary-dark);
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-top: 10px;
    }
    .stat-box {
      background: var(--primary-light);
      padding: 10px 14px;
      border-radius: 10px;
      border: 1px solid #d1fae5;
    }
    .stat-label { font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }
    .stat-value { font-size: 20px; font-weight: 800; color: var(--primary-dark); margin-top: 2px; }
    .row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .row-label { color: var(--text-muted); font-weight: 500; }
    .row-value { font-weight: 600; color: var(--text-main); }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 18px;
      background: var(--primary);
      color: #ffffff;
      border: none;
      border-radius: 9px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      width: 100%;
    }
    .btn:hover { background: var(--primary-dark); }
    .btn-secondary { background: #e2e8f0; color: #334155; }
    .btn-secondary:hover { background: #cbd5e1; }
    .btn-danger { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; margin-top: 12px; }
    .btn-danger:hover { background: #fca5a5; color: #7f1d1d; }
    .input-field {
      width: 100%;
      padding: 9px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 13px;
      margin-top: 4px;
      margin-bottom: 10px;
    }
    .input-field:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(15,118,110,0.15);
    }
    .tab-btn {
      flex: 1;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 700;
      border: none;
      background: transparent;
      cursor: pointer;
      color: var(--text-muted);
      border-bottom: 2px solid transparent;
      transition: all 0.15s;
    }
    .tab-btn.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
      background: #f0fdf4;
    }
    .printer-item {
      padding: 10px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 9px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: white;
    }
    .logs-box {
      background: #0f172a;
      color: #e2e8f0;
      border-radius: 10px;
      padding: 14px;
      font-family: "Consolas", "Courier New", monospace;
      font-size: 12px;
      height: 200px;
      overflow-y: auto;
      line-height: 1.6;
    }
    .log-INFO { color: #a7f3d0; }
    .log-WARN { color: #fde047; }
    .log-ERROR { color: #fca5a5; }
    .log-DEBUG { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <div class="logo">Print<span>Sathi</span> &middot; Windows Desktop Agent</div>
        <div style="font-size:12px; color:#a7f3d0; margin-top:2px;">Zero-Touch Hardware Print Spooler</div>
      </div>
      <div class="header-right">
        <div id="statusBadge" class="badge badge-offline">Checking...</div>
        <a id="headerPortalLink" class="btn-portal" href="${shopPortalUrl}" target="_blank" rel="noopener">
          📊 Open Shop Dashboard
        </a>
      </div>
    </header>

    <div class="grid">
      <!-- Connection / Auth Card -->
      <div class="card" id="connectionCard">
        <div class="card-title">
          <span id="connCardTitle">Shop Connection</span>
        </div>
        <div id="connectionDetails">Loading...</div>
      </div>

      <!-- Printers Card -->
      <div class="card">
        <div class="card-title">
          <span>Connected Printers</span>
          <span id="printerCount" class="badge" style="background:#e2e8f0; color:#334155;">0 detected</span>
        </div>
        <div id="printersList">Loading printers...</div>
      </div>

      <!-- Queue & Stats Card -->
      <div class="card">
        <div class="card-title">
          <span>Auto-Print Activity</span>
        </div>
        <div id="activeJobSection" style="margin-bottom:10px;"></div>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-label">Processed</div>
            <div class="stat-value" id="statProcessed">0</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Completed</div>
            <div class="stat-value" id="statCompleted">0</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Failed</div>
            <div class="stat-value" id="statFailed">0</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Pages Printed</div>
            <div class="stat-value" id="statPages">0</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Live Event Logs -->
    <div class="card">
      <div class="card-title">
        <span>Live Print Spooler Log</span>
        <button class="btn btn-secondary" style="width:auto; padding:4px 10px; font-size:11px;" onclick="refreshStatus(true)">Refresh</button>
      </div>
      <div class="logs-box" id="logsBox">Connecting to agent service...</div>
    </div>
  </div>

  <script>
    let activeAuthTab = 'signin';
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
      const btn = document.getElementById('loginBtn');
      if (btn) {
        btn.disabled = true;
        btn.innerText = 'Signing in & linking shop...';
      }
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ email, password, agentName: name })
        });
        const data = await res.json();
        if (res.ok) {
          lastRenderedPairedState = null;
          await refreshStatus(true);
        } else {
          alert('Sign in failed: ' + (data.error || 'Invalid credentials'));
        }
      } catch (err) {
        alert('Network error during sign in');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = 'Sign In & Connect Shop';
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
        // Clipboard fallback
      }
    }

    async function pairAgent(event) {
      event.preventDefault();
      const code = document.getElementById('pairingCodeInput').value.trim().toUpperCase().replace(/\\s+/g, '');
      const name = document.getElementById('agentNameInput').value;
      const btn = document.getElementById('pairBtn');
      if (btn) {
        btn.disabled = true;
        btn.innerText = 'Connecting...';
      }
      try {
        const res = await fetch('/api/pair', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ pairingCode: code, agentName: name })
        });
        const data = await res.json();
        if (res.ok) {
          lastRenderedPairedState = null;
          await refreshStatus(true);
        } else {
          alert('Error: ' + (data.error || 'Pairing failed'));
        }
      } catch (err) {
        alert('Network error during pairing');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = 'Connect with Pairing Code';
        }
      }
    }

    async function unpairAgent() {
      if (!confirm('Are you sure you want to disconnect this agent from the shop?')) return;
      await fetch('/api/unpair', { method: 'POST' });
      lastRenderedPairedState = null;
      await refreshStatus(true);
    }

    async function refreshStatus(force = false) {
      const status = await fetchStatus();
      if (!status) {
        document.getElementById('statusBadge').className = 'badge badge-offline';
        document.getElementById('statusBadge').innerText = 'AGENT OFFLINE';
        return;
      }

      // Badge
      const badge = document.getElementById('statusBadge');
      if (!status.isPaired) {
        badge.className = 'badge badge-unpaired';
        badge.innerText = 'SIGN IN REQUIRED';
      } else if (status.isConnected) {
        badge.className = 'badge badge-online';
        badge.innerText = 'CONNECTED & READY';
      } else {
        badge.className = 'badge badge-offline';
        badge.innerText = 'CONNECTING...';
      }

      // Render Connection Card ONLY on state change to avoid erasing user typing
      if (lastRenderedPairedState !== status.isPaired || force) {
        lastRenderedPairedState = status.isPaired;
        const connDiv = document.getElementById('connectionDetails');
        if (!status.isPaired) {
          connDiv.innerHTML = \`
            <div style="display:flex; border-bottom:1px solid #e2e8f0; margin-bottom:14px;">
              <button id="tabBtnSignin" class="tab-btn \${activeAuthTab === 'signin' ? 'active' : ''}" onclick="switchAuthTab('signin')">🔑 Sign In (Account)</button>
              <button id="tabBtnPair" class="tab-btn \${activeAuthTab === 'pair' ? 'active' : ''}" onclick="switchAuthTab('pair')">🔢 Pairing Code</button>
            </div>

            <!-- Tab 1: Direct Account Sign In -->
            <div id="signinFormContainer" style="display:\${activeAuthTab === 'signin' ? 'block' : 'none'}">
              <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
                Sign in with your <b>PrintSaathi Shop Owner account</b>. The agent will instantly link with your shop and detect your hardware printers automatically.
              </p>
              <form onsubmit="handleLogin(event)">
                <label style="font-size:12px; font-weight:600; color:var(--text-main);">Email Address</label>
                <input type="email" id="loginEmailInput" class="input-field" placeholder="owner@printshop.com" required />
                <label style="font-size:12px; font-weight:600; color:var(--text-main);">Password</label>
                <input type="password" id="loginPasswordInput" class="input-field" placeholder="••••••••" required />
                <input type="hidden" id="loginAgentNameInput" value="\${status.agentName || 'Shop Windows PC'}" />
                <button type="submit" id="loginBtn" class="btn" style="padding:11px; font-weight:700;">Sign In &amp; Connect Shop</button>
              </form>
            </div>

            <!-- Tab 2: Pairing Code Option -->
            <div id="pairFormContainer" style="display:\${activeAuthTab === 'pair' ? 'block' : 'none'}">
              <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">
                Enter the 6-character code from your <b>Shop Dashboard &rarr; Printer Settings</b>.
              </p>
              <form onsubmit="pairAgent(event)">
                <label style="font-size:12px; font-weight:700; color:var(--text-main); display:block; margin-bottom:4px;">Pairing Code</label>
                <div style="display:flex; gap:8px; margin-bottom:10px;">
                  <input type="text" id="pairingCodeInput" class="input-field" placeholder="e.g. XY98Z2" style="margin:0; font-family:monospace; font-size:15px; font-weight:700; letter-spacing:2px; text-transform:uppercase;" required />
                  <button type="button" class="btn btn-secondary" style="width:auto; padding:0 12px; font-size:12px;" onclick="pasteCode()">📋 Paste</button>
                </div>
                <input type="hidden" id="agentNameInput" value="\${status.agentName || 'Shop Windows PC'}" />
                <button type="submit" id="pairBtn" class="btn" style="padding:11px; font-weight:700;">Connect with Pairing Code</button>
              </form>
            </div>
          \`;
        } else {
          connDiv.innerHTML = \`
            <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; padding:12px; margin-bottom:14px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#10b981;"></span>
                <b style="color:#065f46; font-size:14px;">\${status.shopName || 'Shop Connected'}</b>
              </div>
              <p style="font-size:11px; color:#047857; margin-top:3px;">Zero-Touch Spooler Active &middot; Auto-Printing Online</p>
            </div>
            <div class="row"><span class="row-label">Shop Name</span><span class="row-value">\${status.shopName || 'Connected'}</span></div>
            <div class="row"><span class="row-label">Machine</span><span class="row-value" style="font-size:12px;">\${status.agentName || 'Windows PC'}</span></div>
            <div class="row"><span class="row-label">Server</span><span class="row-value" style="font-size:12px;">\${status.serverUrl}</span></div>
            <div class="row"><span class="row-label">Heartbeat</span><span class="row-value" style="font-size:12px;">\${status.lastHeartbeat ? new Date(status.lastHeartbeat).toLocaleTimeString() : 'Active'}</span></div>
            <button class="btn btn-danger" onclick="unpairAgent()">Sign Out / Disconnect</button>
          \`;
        }
      }

      // Printers Card
      document.getElementById('printerCount').innerText = \`\${status.printers.length} detected\`;
      const pList = document.getElementById('printersList');
      if (status.printers.length === 0) {
        pList.innerHTML = '<p style="font-size:13px; color:var(--text-muted); padding:10px 0;">No printers detected yet.</p>';
      } else {
        pList.innerHTML = \`
          <div style="font-size:11px; color:var(--primary); background:#f0fdf4; border:1px solid #bbf7d0; padding:7px 10px; border-radius:6px; margin-bottom:10px;">
            ⚡ <b>Smart Auto-Routing:</b> Paid orders print automatically to your default printer without human intervention.
          </div>
        \` + status.printers.map(p => {
          const isColor = Boolean(p.capabilities && p.capabilities.colorSupport);
          return \`
          <div class="printer-item">
            <div>
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:13px; font-weight:700;">\${p.name}</span>
                <span class="badge \${isColor ? 'badge-online' : ''}" style="font-size:9px; \${!isColor ? 'background:#e2e8f0; color:#334155;' : ''}">
                  \${isColor ? '🎨 Color' : '📄 B&W'}
                </span>
                \${p.isDefault ? '<span class="badge badge-online" style="font-size:9px;">DEFAULT</span>' : ''}
              </div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">\${p.driverName || 'Windows Driver'} &middot; \${p.status}</div>
            </div>
            <div>
              <span class="badge badge-online" style="font-size:10px;">READY</span>
            </div>
          </div>
        \`;
        }).join('');
      }

      // Stats & Active Job
      document.getElementById('statProcessed').innerText = status.stats.jobsProcessed;
      document.getElementById('statCompleted').innerText = status.stats.jobsCompleted;
      document.getElementById('statFailed').innerText = status.stats.jobsFailed;
      document.getElementById('statPages').innerText = status.stats.totalPagesPrinted;

      const jobSec = document.getElementById('activeJobSection');
      if (status.currentJob) {
        jobSec.innerHTML = \`
          <div style="background:#dcfce7; border:1px solid #86efac; border-radius:9px; padding:10px;">
            <div style="font-size:11px; font-weight:700; color:#166534;">PRINTING IN PROGRESS</div>
            <div style="font-size:13px; font-weight:600; margin-top:2px;">\${status.currentJob.document.originalFilename}</div>
            <div style="font-size:11px; color:#15803d;">\${status.currentJob.totalPages} pages &middot; Job #\${status.currentJob.id.slice(0,8)}</div>
          </div>
        \`;
      } else {
        jobSec.innerHTML = '<div style="font-size:12px; color:var(--text-muted);">Idle &middot; Listening for paid print jobs...</div>';
      }

      // Logs
      const logsBox = document.getElementById('logsBox');
      logsBox.innerHTML = status.recentLogs.map(l => \`
        <div><span style="color:#64748b;">[\${new Date(l.timestamp).toLocaleTimeString()}]</span> <span class="log-\${l.level}">[\${l.level}]</span> \${l.message}</div>
      \`).join('');
      logsBox.scrollTop = logsBox.scrollHeight;
    }

    refreshStatus(true);
    setInterval(() => refreshStatus(false), 3000);
  </script>
</body>
</html>`;
  }
}
