import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from "electron";
import { agentDaemon } from "./daemon";
import { AgentWebServer } from "./ui";
import { logger } from "./logger";

// Prevent Windows Chromium GPU shader disk cache errors and access-denied locks
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let webServer: AgentWebServer | null = null;
let dashboardUrl = "";
let isQuitting = false;

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

async function startDesktopAgent() {
  await app.whenReady();
  app.setAppUserModelId("com.printiva.agent");

  try {
    await agentDaemon.start();
    webServer = new AgentWebServer(4321);
    const port = await webServer.start();
    dashboardUrl = `http://127.0.0.1:${port}`;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("already running")) throw error;
    for (let port = 4321; port <= 4330; port += 1) {
      try {
        const url = `http://127.0.0.1:${port}`;
        const response = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1000) });
        const status = await response.json();
        if (typeof status.isPaired === "boolean" && Array.isArray(status.printers)) {
          dashboardUrl = url;
          break;
        }
      } catch {
        /* Try the next dashboard port. */
      }
    }
    if (!dashboardUrl) throw error;
  }

  createTray();
  createWindow();

  app.on("activate", () => {
    if (!mainWindow) createWindow();
    else mainWindow.show();
  });
}

import fs from "node:fs";
import path from "node:path";

function getAssetIconPath(filename: string): string | null {
  const possiblePaths = [
    path.join(__dirname, "..", "..", "assets", filename),
    path.join(__dirname, "..", "assets", filename),
    path.join(process.cwd(), "assets", filename),
    path.join(process.cwd(), "dist", "assets", filename),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function createWindow() {
  const iconPath = getAssetIconPath("icon-256.png");
  const appIcon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;

  mainWindow = new BrowserWindow({
    width: 1120,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: "Printiva Desktop Agent",
    icon: appIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
        void shell.openExternal(url);
        return { action: "deny" };
      }
    }
    return { action: "allow" };
  });

  void mainWindow.loadURL(dashboardUrl);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  const trayIconPath = getAssetIconPath("icon-32.png") || getAssetIconPath("icon-256.png");
  const trayIcon = trayIconPath ? nativeImage.createFromPath(trayIconPath) : nativeImage.createEmpty();

  tray = new Tray(trayIcon);
  tray.setToolTip("Printiva Desktop Agent");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Printiva", click: () => mainWindow?.show() },
      {
        label: "Shop Dashboard (Web)",
        click: () =>
          void shell.openExternal(
            `${agentDaemon.getStatus().serverUrl || "https://printiva.co.in"}/shop/dashboard`
          ),
      },
      { type: "separator" },
      { label: "Quit", click: () => quitDesktopAgent() },
    ])
  );
  tray.on("double-click", () => mainWindow?.show());
}

function quitDesktopAgent() {
  isQuitting = true;
  agentDaemon.stop();
  webServer?.stop();
  tray?.destroy();
  app.quit();
}

app.on("window-all-closed", () => {
  // Keep the agent alive in the Windows tray after the window is closed.
});

app.on("before-quit", () => {
  agentDaemon.stop();
  webServer?.stop();
});

startDesktopAgent().catch((error) => {
  logger.error("Fatal desktop agent startup error:", {
    error: error instanceof Error ? error.message : String(error),
  });
  app.quit();
});
