export interface AgentConfig {
  serverUrl: string;
  agentId: string | null;
  shopId: string | null;
  shopName: string | null;
  agentToken: string | null;
  agentName: string;
  selectedPrinter: string | null;
  version: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
}

export interface DiscoveredPrinter {
  name: string;
  systemIdentifier: string;
  status: "online" | "offline" | "printing" | "error" | "no_printer";
  isDefault: boolean;
  driverName?: string;
  portName?: string;
  capabilities?: {
    colorSupport?: boolean;
    duplexSupport?: boolean;
    paperSizes?: string[];
  };
}

export interface ClaimedJob {
  id: string;
  orderId: string;
  documentId: string;
  shopId: string;
  totalPages: number;
  totalAmount: number;
  currency: string;
  printAttempts: number;
  maxAttempts: number;
  claimedAt: string;
  claimExpiresAt: string;
  defaultPrinter: string | null;
  document: {
    id: string;
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    pageCount: number;
  };
  pagesConfig: Array<{
    startPage: number;
    endPage: number;
    colorMode: "black_and_white" | "color";
    paperSize: "a4" | "a3" | "letter" | "legal";
    sideMode?: "single_sided" | "double_sided";
    copies?: number;
  }>;
  duplexStep?: "none" | "odd" | "even" | "all";
}

export interface LogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  message: string;
  context?: Record<string, unknown>;
}

export interface AgentStatusSnapshot {
  agentName: string;
  agentId: string | null;
  shopId: string | null;
  shopName: string | null;
  serverUrl: string;
  isPaired: boolean;
  isConnected: boolean;
  lastHeartbeat: string | null;
  version: string;
  printers: DiscoveredPrinter[];
  selectedPrinter: string | null;
  currentJob: ClaimedJob | null;
  stats: {
    jobsProcessed: number;
    jobsSubmitted: number;
    jobsFailed: number;
    totalPagesSubmitted: number;
  };
  recentLogs: LogEntry[];
}
