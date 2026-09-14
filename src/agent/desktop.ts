import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import { agentDaemon } from "./daemon";
import { AgentWebServer } from "./ui";
import { logger } from "./logger";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let webServer: AgentWebServer | null = null;
let dashboardUrl = "";
let isQuitting = false;

async function startDesktopAgent() {
  await app.whenReady();
  app.setAppUserModelId("com.printsaathi.agent");

  await agentDaemon.start();
  webServer = new AgentWebServer(4321);
  const port = await webServer.start();
  dashboardUrl = `http://127.0.0.1:${port}`;

  createTray();
  createWindow();

  app.on("activate", () => {
    if (!mainWindow) createWindow();
    else mainWindow.show();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    title: "PrintSaathi Desktop Agent",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
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
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("PrintSaathi Desktop Agent");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open PrintSaathi", click: () => mainWindow?.show() },
      { label: "Shop Dashboard", click: () => void mainWindow?.loadURL(`${agentDaemon.getStatus().serverUrl}/shop/dashboard`) },
      { type: "separator" },
      { label: "Quit", click: () => quitDesktopAgent() },
    ]),
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
