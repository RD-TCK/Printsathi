import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { LogEntry } from "./types";

class AgentLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 150;
  private logFilePath: string | null = null;
  private maxLogFileBytes = 5 * 1024 * 1024;
  private logWriteCount = 0;

  constructor() {
    this.initFileLogger();
  }

  private initFileLogger() {
    try {
      const appData =
        process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local") || path.join(os.homedir(), ".printiva");
      const logDir = path.join(appData, "PrintivaAgent", "logs");
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      this.logFilePath = path.join(logDir, "agent.log");
    } catch {
      this.logFilePath = null;
    }
  }

  private sanitize(message: string): string {
    // Redact any tokens, secrets, or keys
    return message
      .replace(/ps_agent_[a-zA-Z0-9_]+/g, "ps_agent_***")
      .replace(/Bearer\s+[a-zA-Z0-9_\-.]+/gi, "Bearer ***")
      .replace(/rzp_[a-zA-Z0-9_]+/gi, "rzp_***");
  }

  private log(level: LogEntry["level"], message: string, context?: Record<string, unknown>) {
    const sanitizedMsg = this.sanitize(message);
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: sanitizedMsg,
      context,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    const formatted = `[${entry.timestamp}] [${level}] ${sanitizedMsg}`;
    if (level === "ERROR") {
      console.error(formatted, context ? JSON.stringify(context) : "");
    } else if (level === "WARN") {
      console.warn(formatted, context ? JSON.stringify(context) : "");
    } else {
      console.log(formatted, context ? JSON.stringify(context) : "");
    }

    const ctxStr = context ? " " + JSON.stringify(context) : "";
    if (this.logFilePath) {
      try {
        this.logWriteCount += 1;
        if (this.logWriteCount % 50 === 0 && fs.existsSync(this.logFilePath)) {
          const stat = fs.statSync(this.logFilePath);
          if (stat.size >= this.maxLogFileBytes) {
            const rot1 = `${this.logFilePath}.1`;
            const rot2 = `${this.logFilePath}.2`;
            if (fs.existsSync(rot2)) fs.unlinkSync(rot2);
            if (fs.existsSync(rot1)) fs.renameSync(rot1, rot2);
            fs.renameSync(this.logFilePath, rot1);
          }
        }
        fs.appendFileSync(this.logFilePath, `${formatted}${ctxStr}\n`, "utf8");
      } catch {
        // Ignore file logging errors
      }
    }
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log("INFO", message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log("WARN", message, context);
  }

  error(message: string, context?: Record<string, unknown>) {
    this.log("ERROR", message, context);
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log("DEBUG", message, context);
  }

  getRecentLogs(): LogEntry[] {
    return [...this.logs];
  }
}

export const logger = new AgentLogger();
