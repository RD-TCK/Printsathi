import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AgentConfig } from "./types";

export const DEFAULT_CONFIG: AgentConfig = {
  serverUrl: process.env.PRINTIVA_SERVER_URL || process.env.NEXT_PUBLIC_APP_URL || "https://printiva.co.in",
  agentId: null,
  shopId: null,
  shopName: null,
  agentToken: null,
  agentName: `Windows Agent (${os.hostname() || "Local"})`,
  selectedPrinter: null,
  version: "1.8.4",
  pollIntervalMs: 2000,
  heartbeatIntervalMs: 45000,
};

export function getConfigDirectory(): string {
  const appData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local") || path.join(os.homedir(), ".printiva");
  const dir = path.join(appData, "PrintivaAgent");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getConfigFilePath(): string {
  return path.join(getConfigDirectory(), "config.json");
}

export function getDocumentCacheDirectory(): string {
  const dir = path.join(getConfigDirectory(), "document_cache");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function cleanDocumentCache(
  maxAgeMs = 48 * 3600 * 1000, // 48 hours TTL
  maxTotalBytes = 5 * 1024 * 1024 * 1024, // 5 GB max cache size
): void {
  try {
    const dir = getDocumentCacheDirectory();
    const files = fs.readdirSync(dir);
    const now = Date.now();
    const statsList: Array<{ filePath: string; mtimeMs: number; size: number }> = [];

    let totalSize = 0;
    for (const file of files) {
      try {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;

        // Purge if older than maxAge
        if (now - stat.mtimeMs > maxAgeMs) {
          try {
            fs.unlinkSync(filePath);
          } catch {
            // ignore
          }
          continue;
        }

        statsList.push({ filePath, mtimeMs: stat.mtimeMs, size: stat.size });
        totalSize += stat.size;
      } catch {
        // ignore
      }
    }

    // If still exceeds max capacity, prune oldest files first (FIFO)
    if (totalSize > maxTotalBytes) {
      statsList.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const item of statsList) {
        if (totalSize <= maxTotalBytes) break;
        try {
          fs.unlinkSync(item.filePath);
          totalSize -= item.size;
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
}

export function loadConfig(): AgentConfig {
  const filePath = getConfigFilePath();
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const serverUrl = process.env.PRINTIVA_SERVER_URL || parsed.serverUrl || DEFAULT_CONFIG.serverUrl;

    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      serverUrl,
      version: DEFAULT_CONFIG.version,
      pollIntervalMs: parsed.pollIntervalMs ? Math.max(1000, Math.min(parsed.pollIntervalMs, 5000)) : 2000,
      heartbeatIntervalMs: parsed.heartbeatIntervalMs ? Math.max(10000, Math.min(parsed.heartbeatIntervalMs, 60000)) : 45000,
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
