import fs from "node:fs";
import type { ClaimedJob, DiscoveredPrinter } from "./types";
import { logger } from "./logger";

export class AgentApiClient {
  private serverUrl: string;
  private token: string | null;

  constructor(serverUrl: string, token: string | null = null) {
    this.serverUrl = serverUrl.replace(/\/+$/, "");
    this.token = token;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  setServerUrl(serverUrl: string) {
    this.serverUrl = serverUrl.replace(/\/+$/, "");
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "PrintSaathi-WindowsAgent/1.0",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
      headers["x-agent-token"] = this.token;
    }
    return headers;
  }

  async pairWithCode(params: {
    pairingCode: string;
    agentName?: string;
    version?: string;
    machineInfo?: Record<string, unknown>;
  }): Promise<{
    success: boolean;
    agentId: string;
    shopId: string;
    shopName: string;
    agentToken: string;
  }> {
    const url = `${this.serverUrl}/api/agent/pair`;
    logger.info(`Sending pairing request to ${url}...`);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || `Pairing failed with HTTP status ${response.status}`);
    }

    this.token = data.agentToken;
    return data;
  }

  async loginWithCredentials(params: {
    email: string;
    password: string;
    agentName?: string;
    version?: string;
    machineInfo?: Record<string, unknown>;
  }): Promise<{
    success: boolean;
    agentId: string;
    shopId: string;
    shopName: string;
    agentToken: string;
  }> {
    const url = `${this.serverUrl}/api/agent/login`;
    logger.info(`Sending direct login request to ${url}...`);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || `Login failed with HTTP status ${response.status}`);
    }

    this.token = data.agentToken;
    return data;
  }

  async sendHeartbeat(params: {
    printers: DiscoveredPrinter[];
    currentJobId?: string | null;
    version?: string;
    machineInfo?: Record<string, unknown>;
  }): Promise<{ success: boolean; timestamp: string }> {
    if (!this.token) {
      throw new Error("Agent is not authenticated.");
    }

    const url = `${this.serverUrl}/api/agent/heartbeat`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("AGENT_UNAUTHORIZED_OR_REVOKED");
      }
      throw new Error(data.error || `Heartbeat failed with HTTP status ${response.status}`);
    }

    return data;
  }

  async claimNextJob(leaseSeconds: number = 300): Promise<ClaimedJob | null> {
    if (!this.token) {
      throw new Error("Agent is not authenticated.");
    }

    const url = `${this.serverUrl}/api/agent/claim`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ leaseSeconds }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("AGENT_UNAUTHORIZED_OR_REVOKED");
      }
      throw new Error(data.error || `Claim request failed with HTTP status ${response.status}`);
    }

    return (data.job as ClaimedJob) || null;
  }

  async downloadDocument(documentId: string, jobId: string, destinationFilePath: string): Promise<void> {
    if (!this.token) {
      throw new Error("Agent is not authenticated.");
    }

    const url = `${this.serverUrl}/api/agent/document?documentId=${encodeURIComponent(
      documentId,
    )}&jobId=${encodeURIComponent(jobId)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      let errorMsg = `Download failed with HTTP status ${response.status}`;
      try {
        const json = await response.json();
        errorMsg = json.error || errorMsg;
      } catch {
        // Not JSON
      }
      throw new Error(errorMsg);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(destinationFilePath, buffer);
  }

  async reportSubmit(jobId: string): Promise<boolean> {
    if (!this.token) {
      throw new Error("Agent is not authenticated.");
    }

    const url = `${this.serverUrl}/api/agent/submit`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ jobId }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || `Job submission report failed with status ${response.status}`);
    }

    return true;
  }

  async reportComplete(jobId: string): Promise<boolean> {
    if (!this.token) {
      throw new Error("Agent is not authenticated.");
    }

    const url = `${this.serverUrl}/api/agent/complete`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ jobId }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || `Job completion report failed with status ${response.status}`);
    }

    return true;
  }

  async reportFailure(jobId: string, reason: string, isRetryable: boolean = true): Promise<boolean> {
    if (!this.token) {
      throw new Error("Agent is not authenticated.");
    }

    const url = `${this.serverUrl}/api/agent/fail`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ jobId, reason, isRetryable }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || `Job failure report failed with status ${response.status}`);
    }

    return true;
  }
}
