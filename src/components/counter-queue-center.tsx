"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Ticket,
  Printer,
  XCircle,
  Clock3,
  Search,
  CheckCircle2,
  LoaderCircle,
  BellRing,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type QueueItem = {
  id: string;
  publicId: string;
  tokenNumber: number | null;
  status: string;
  totalAmount: number;
  totalPages: number;
  colorPages: number;
  blackAndWhitePages: number;
  expiresAt: string | null;
  remainingSeconds: number;
  isExpired: boolean;
  createdAt: string;
  documents: Array<{
    id: string;
    filename: string;
    pageCount: number;
  }>;
  jobs: Array<{
    id: string;
    status: string;
    totalPages: number;
  }>;
};

export function CounterQueueCenter({ shopName }: { shopName: string }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dismissedPopups, setDismissedPopups] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Audio chime notification for new requests
  const prevCountRef = useRef<number>(0);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/shop/counter-queue", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const items: QueueItem[] = data.queue || [];

      // Check if a new active request arrived
      const activePending = items.filter((i) => i.status === "awaiting_payment" && !i.isExpired);
      if (activePending.length > prevCountRef.current && prevCountRef.current > 0) {
        // Try audio notification if browser allows
        try {
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
          osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
          osc.start();
          osc.stop(ctx.currentTime + 0.4);
        } catch {
          // Audio not permitted
        }
      }
      prevCountRef.current = activePending.length;
      setQueue(items);
    } catch {
      // Fetch error fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQueue();
    const timer = setInterval(() => {
      void fetchQueue();
    }, 4000);
    return () => clearInterval(timer);
  }, [fetchQueue]);

  // Handle Approve & Print directly through Desktop Agent
  const handleApprovePrint = async (orderId: string, _jobId?: string) => {
    setActionLoading(orderId);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/shop/counter-order/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed");

      setStatusMessage({
        text: `${data.message || "Order approved!"} Dispatched directly to Desktop Agent — printing automatically.`,
        type: "success",
      });

      // Signal local desktop agent to claim and print instantly (no wait for poll timer)
      try {
        fetch("http://127.0.0.1:4321/api/trigger-poll", {
          method: "POST",
          mode: "cors",
        }).catch(() => {});
      } catch {
        // Agent might be running on a different port or machine
      }

      await fetchQueue();
    } catch (err) {
      setStatusMessage({ text: err instanceof Error ? err.message : "Could not approve order", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Handle Cancel Order
  const handleCancelOrder = async (orderId: string) => {
    if (!confirm("Are you sure you want to cancel this print request?")) return;
    setActionLoading(orderId);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/shop/counter-order/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) throw new Error("Cancel failed");
      setStatusMessage({ text: "Print request cancelled.", type: "success" });
      await fetchQueue();
    } catch {
      setStatusMessage({ text: "Could not cancel request.", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Dismiss popup
  const handleDismissPopup = (orderId: string) => {
    setDismissedPopups((prev) => new Set([...prev, orderId]));
  };

  // Filter active pending orders that need immediate attention and are not dismissed
  const activePendingOrders = queue.filter(
    (item) => item.status === "awaiting_payment" && !item.isExpired
  );
  const popupOrders = activePendingOrders.filter((item) => !dismissedPopups.has(item.id));

  // Search filter for the sequential queue: shop owner types token number (e.g., '1', '5', '#5')
  const filteredQueue = queue.filter((item) => {
    if (!searchQuery.trim()) return true;
    const cleanQuery = searchQuery.replace(/^#/, "").trim().toLowerCase();
    const tokenStr = item.tokenNumber != null ? String(item.tokenNumber) : "";
    const publicIdStr = item.publicId.toLowerCase();
    return (
      tokenStr === cleanQuery ||
      tokenStr.includes(cleanQuery) ||
      publicIdStr.startsWith(cleanQuery) ||
      item.documents.some((d) => d.filename.toLowerCase().includes(cleanQuery))
    );
  });

  return (
    <div className="space-y-6">
      {/* 1. REAL-TIME POPUP CARD FOR NEW INCOMING REQUESTS */}
      {popupOrders.length > 0 ? (
        <div className="space-y-3">
          {popupOrders.slice(0, 2).map((item) => {
            const minutesLeft = Math.floor(item.remainingSeconds / 60);
            return (
              <div
                key={`popup-${item.id}`}
                className="relative overflow-hidden rounded-2xl border-2 border-emerald-500 bg-white p-5 shadow-2xl shadow-emerald-950/15 animate-in slide-in-from-top-4 duration-300"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-700/20">
                      <BellRing className="size-7 animate-bounce" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                          New Counter Request
                        </span>
                        <span className="text-xs text-muted flex items-center gap-1 font-mono">
                          <Clock3 className="size-3.5 text-emerald-600" />
                          Valid {minutesLeft}m
                        </span>
                      </div>

                      {/* Prominent Token Number */}
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl sm:text-4xl font-black text-emerald-700 font-mono">
                          Token #{item.tokenNumber ?? item.publicId.slice(0, 6)}
                        </span>
                        <span className="text-lg font-bold text-brand-950">
                          · ₹{item.totalAmount.toFixed(2)}
                        </span>
                      </div>

                      {/* Total number of pages to be printed below token number */}
                      <p className="mt-1 text-sm font-bold text-brand-950">
                        📄 {item.totalPages} Pages to be printed ({item.blackAndWhitePages} B&amp;W, {item.colorPages} Color)
                      </p>
                      <p className="text-xs text-muted">
                        {item.documents.map((d) => d.filename).join(", ")}
                      </p>
                    </div>
                  </div>

                  {/* Actions: Print or Cancel or Keep in Queue */}
                  <div className="flex flex-wrap items-center gap-2 self-center sm:self-auto">
                    <Button
                      variant="primary"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-5 shadow-md shadow-emerald-700/20"
                      loading={actionLoading === item.id}
                      onClick={() => handleApprovePrint(item.id, item.jobs[0]?.id)}
                    >
                      <Printer className="size-4" />
                      Print Document
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDismissPopup(item.id)}
                      title="Keep this request in queue and attend to it later"
                    >
                      Keep in Queue
                    </Button>

                    <button
                      type="button"
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                      title="Cancel print request"
                      onClick={() => handleCancelOrder(item.id)}
                    >
                      <XCircle className="size-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {statusMessage && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm flex items-center justify-between",
            statusMessage.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          )}
        >
          <span>{statusMessage.text}</span>
          <button type="button" onClick={() => setStatusMessage(null)} className="text-xs font-bold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* 2. SEQUENTIAL QUEUE CENTER */}
      <Card className="border-brand-200 shadow-md">
        <CardHeader className="border-b border-line pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
                <Ticket className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-brand-950">Counter Print Queue</h2>
                <p className="text-xs text-muted">
                  Showing today&apos;s requests (resets daily at midnight). Valid for 1 hour; print in any order.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge tone={activePendingOrders.length > 0 ? "warning" : "neutral"}>
                {activePendingOrders.length} Waiting at Counter
              </Badge>

              {/* Quick Search by Token Number */}
              <div className="relative w-44 sm:w-56">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Enter token # (e.g. 5)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-line bg-brand-50/50 py-1.5 pl-8 pr-3 text-xs font-medium text-brand-950 focus:border-brand-600 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted">
              <LoaderCircle className="size-5 animate-spin mr-2" />
              Loading counter queue...
            </div>
          ) : filteredQueue.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted">
              <Ticket className="size-8 mx-auto mb-2 text-slate-300" />
              {searchQuery ? `No counter orders matching token #${searchQuery}.` : "No counter requests queued for today."}
            </div>
          ) : (
            <div className="divide-y divide-line/60 max-h-[540px] overflow-y-auto pr-1">
              {filteredQueue.map((item) => {
                const minutesLeft = Math.floor(item.remainingSeconds / 60);
                const isPaid = item.status === "paid" || item.status === "completed" || item.status === "printing";
                const isCancelled = item.status === "cancelled";

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5 transition hover:bg-brand-50/30",
                      item.status === "awaiting_payment" && !item.isExpired ? "bg-white" : "bg-slate-50/60 opacity-80"
                    )}
                  >
                    {/* Left: Token Number, Pages, Details */}
                    <div className="flex items-start gap-4 min-w-0">
                      <div
                        className={cn(
                          "flex size-12 shrink-0 items-center justify-center rounded-2xl font-mono text-lg font-black shadow-inner",
                          isPaid
                            ? "bg-emerald-100 text-emerald-800"
                            : item.isExpired
                            ? "bg-slate-200 text-slate-500"
                            : "bg-emerald-600 text-white shadow-emerald-700/20"
                        )}
                      >
                        #{item.tokenNumber ?? item.publicId.slice(0, 4)}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-brand-950 text-sm">
                            Token #{item.tokenNumber ?? item.publicId.slice(0, 8)}
                          </span>

                          <Badge
                            tone={
                              isPaid
                                ? "success"
                                : item.isExpired
                                ? "danger"
                                : isCancelled
                                ? "danger"
                                : "warning"
                            }
                          >
                            {isPaid
                              ? "PRINTED / PAID"
                              : item.isExpired
                              ? "EXPIRED (1 HR)"
                              : isCancelled
                              ? "CANCELLED"
                              : "WAITING AT COUNTER"}
                          </Badge>

                          {!isPaid && !item.isExpired && !isCancelled ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <Clock3 className="size-3" /> {minutesLeft}m left
                            </span>
                          ) : null}
                        </div>

                        {/* Total pages to be printed clearly below token number */}
                        <p className="mt-1 text-xs font-bold text-brand-900">
                          {item.totalPages} Pages ({item.blackAndWhitePages} B&amp;W, {item.colorPages} Color) · ₹{item.totalAmount.toFixed(2)}
                        </p>

                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted truncate max-w-md">
                          {item.documents.map((d, i) => (
                            <span key={d.id} className="truncate">
                              {d.filename} ({d.pageCount}p){i < item.documents.length - 1 ? " · " : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                      {!isPaid && !isCancelled && !item.isExpired ? (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            loading={actionLoading === item.id}
                            onClick={() => handleApprovePrint(item.id, item.jobs[0]?.id)}
                          >
                            <Printer className="size-3.5" />
                            Print
                          </Button>

                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => handleCancelOrder(item.id)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : isPaid ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                            <CheckCircle2 className="size-3.5" /> Approved
                          </span>
                          {item.jobs[0]?.id && (
                            <a
                              href={`/api/shop/print-document?jobId=${item.jobs[0].id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-line bg-white px-2 py-1 text-xs text-brand-700 hover:bg-slate-50"
                            >
                              <Printer className="size-3" /> Reprint
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted italic">
                          {item.isExpired ? "Request expired after 1 hr" : "Cancelled"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
