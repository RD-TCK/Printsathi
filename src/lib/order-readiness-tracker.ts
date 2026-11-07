/**
 * Order Readiness & Desktop Agent Pre-cache Tracker
 * Tracks when a local desktop agent has fully downloaded and cached
 * the printable PDF files in its local SSD cache (0s printing latency).
 */

interface PrecacheEntry {
  cachedDocIds: Set<string>;
  lastUpdated: number;
}

// In-process cache mapping orderId -> set of pre-cached document IDs
const precacheRegistry = new Map<string, PrecacheEntry>();

// Keep memory bounded (clean up entries older than 2 hours)
const ENTRY_TTL_MS = 2 * 60 * 60 * 1000;

function cleanupStaleEntries() {
  const now = Date.now();
  for (const [orderId, entry] of precacheRegistry.entries()) {
    if (now - entry.lastUpdated > ENTRY_TTL_MS) {
      precacheRegistry.delete(orderId);
    }
  }
}

/**
 * Record that a desktop agent has pre-cached a document in local SSD.
 */
export function recordAgentDocumentPrecached(orderId: string, documentId: string): void {
  cleanupStaleEntries();
  const existing = precacheRegistry.get(orderId);
  if (existing) {
    existing.cachedDocIds.add(documentId);
    existing.lastUpdated = Date.now();
  } else {
    precacheRegistry.set(orderId, {
      cachedDocIds: new Set([documentId]),
      lastUpdated: Date.now(),
    });
  }
}

/**
 * Check whether all required documents for an order have been pre-cached by the agent.
 */
export function areOrderDocumentsPrecached(orderId: string, requiredDocIds: string[]): boolean {
  if (requiredDocIds.length === 0) return true;
  const entry = precacheRegistry.get(orderId);
  if (!entry) return false;
  return requiredDocIds.every((id) => entry.cachedDocIds.has(id));
}

/**
 * Get count of pre-cached documents for an order.
 */
export function getPrecachedDocumentsCount(orderId: string): number {
  return precacheRegistry.get(orderId)?.cachedDocIds.size ?? 0;
}
