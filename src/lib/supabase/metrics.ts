/**
 * Dev-only Supabase Request Metrics Counter
 * Enable by setting SUPABASE_METRICS=true in your environment.
 * Off by default. Tracks queries and endpoints per minute.
 */

type RequestRecord = {
  timestamp: number;
  url: string;
  method: string;
  tableOrEndpoint: string;
};

const records: RequestRecord[] = [];
const ENABLED = process.env.SUPABASE_METRICS === "true";

function extractTableOrEndpoint(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    const pathname = parsed.pathname;
    // e.g. /rest/v1/shops -> table "shops"
    const restMatch = pathname.match(/\/rest\/v1\/([^?/#]+)/);
    if (restMatch) return `table:${restMatch[1]}`;
    // e.g. /auth/v1/user -> auth endpoint
    const authMatch = pathname.match(/\/auth\/v1\/([^?/#]+)/);
    if (authMatch) return `auth:${authMatch[1]}`;
    // e.g. /storage/v1/object/... -> storage
    const storageMatch = pathname.match(/\/storage\/v1\/([^?/#]+)/);
    if (storageMatch) return `storage:${storageMatch[1]}`;
    return pathname;
  } catch {
    return urlStr.split("?")[0] || "unknown";
  }
}

export function devMetricsFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (ENABLED) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || (typeof input === "object" && "method" in input ? (input as Request).method : "GET");
    const tableOrEndpoint = extractTableOrEndpoint(url);

    records.push({
      timestamp: Date.now(),
      url,
      method,
      tableOrEndpoint,
    });

    // Keep records only for the last 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    while (records.length > 0 && records[0].timestamp < fiveMinutesAgo) {
      records.shift();
    }
  }

  return fetch(input, init);
}

export function getDevMetricsSummary(): {
  requestsLastMinute: number;
  breakdown: Record<string, number>;
} {
  const oneMinuteAgo = Date.now() - 60 * 1000;
  const recent = records.filter((r) => r.timestamp >= oneMinuteAgo);
  const breakdown: Record<string, number> = {};

  for (const r of recent) {
    breakdown[r.tableOrEndpoint] = (breakdown[r.tableOrEndpoint] || 0) + 1;
  }

  return {
    requestsLastMinute: recent.length,
    breakdown,
  };
}
