import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AgentConfig } from "./types";

const DEFAULT_CONFIG: AgentConfig = {
  serverUrl: process.env.PRINTSAATHI_SERVER_URL || process.env.NEXT_PUBLIC_APP_URL || "https://printsathi.vercel.app",
  agentId: null,
  shopId: null,
  shopName: null,
  agentToken: null,
  agentName: `Windows Agent (${os.hostname() || "Local"})`,
  selectedPrinter: null,
  version: "1.3.0",
  pollIntervalMs: 2000,
  heartbeatIntervalMs: 10000,
};

export function getConfigDirectory(): string {
  const appData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local") || path.join(os.homedir(), ".printsaathi");
  const dir = path.join(appData, "PrintSaathiAgent");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getConfigFilePath(): string {
  return path.join(getConfigDirectory(), "config.json");
}

export function loadConfig(): AgentConfig {
  const filePath = getConfigFilePath();
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const serverUrl = process.env.PRINTSAATHI_SERVER_URL || parsed.serverUrl || DEFAULT_CONFIG.serverUrl;

    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      serverUrl,
      version: DEFAULT_CONFIG.version,
      pollIntervalMs: 2000,
      heartbeatIntervalMs: 10000,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(update: Partial<AgentConfig>): AgentConfig {
  const current = loadConfig();
  const updated: AgentConfig = { ...current, ...update };
  const filePath = getConfigFilePath();

  try {
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), { encoding: "utf8", mode: 0o600 });
  } catch (err) {
    console.error("Failed to save agent config:", err);
  }

  return updated;
}

export function clearConfig(): AgentConfig {
  const current = loadConfig();
  const reset: AgentConfig = {
    ...DEFAULT_CONFIG,
    serverUrl: current.serverUrl,
    agentName: current.agentName,
    selectedPrinter: current.selectedPrinter,
  };
  saveConfig(reset);
  return reset;
}

export function isConfigPaired(config: AgentConfig): boolean {
  return Boolean(config.agentId && config.shopId && config.agentToken);
}
