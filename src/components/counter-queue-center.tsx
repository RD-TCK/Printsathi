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
  RotateCw,
  Layers,
  Sparkles,
  Trash2,
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
  sideMode?: "single_sided" | "double_sided";
  duplexStep?: "none" | "odd_pending" | "odd_printed" | "even_pending" | "completed";
  oddPagesCount?: number;
  evenPagesCount?: number;
  copiesSummary?: string;
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
    duplexStep?: string;
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
        try {
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sine";
          osc.frequency.setValueAtTime(587.33, ctx.currentTime);
          osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
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

  // Handle Approve & Print (Single-sided or Duplex Step)
  const handleApprovePrint = async (orderId: string, duplexStep?: "odd" | "even" | "all") => {
    setActionLoading(`${orderId}-${duplexStep || "all"}`);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/shop/counter-order/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, duplexStep }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed");

      setStatusMessage({
        text: data.message || "Print request submitted.",
        type: "success",
      });

      // Signal local desktop agent to claim and print instantly
      try {
        fetch("http://127.0.0.1:4321/api/trigger-poll", {
          method: "POST",
          mode: "cors",
        }).catch(() => {});
      } catch {
        // Desktop agent port fallback
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

  // Handle Discard Misprint / Customer Rejection
  const handleDiscardOrder = async (orderId: string, tokenNumber?: number | null, amount?: number) => {
    const tokenDisplay = tokenNumber != null ? `Token #${tokenNumber}` : `this print request`;
    const amountDisplay = amount != null ? ` (₹${amount.toFixed(2)})` : "";
    if (
      !confirm(
        `Discard ${tokenDisplay}${amountDisplay} as a customer-rejected misprint?\n\nThis will mark the job as discarded and completely exclude it from your shop's revenue and analytics calculation.`
      )
    ) {
      return;
    }

    setActionLoading(`discard-${orderId}`);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/shop/discard-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          reason: "Customer rejected misprint (Discarded by shop owner)",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Discard failed");
      setStatusMessage({
        text: `${tokenDisplay} discarded. Excluded from shop revenue & analytics calculation.`,
        type: "success",
      });
      await fetchQueue();
    } catch (err) {
      setStatusMessage({
        text: err instanceof Error ? err.message : "Could not discard print request.",
        type: "error",
      });
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
    (item) => (item.status === "awaiting_payment" || item.status === "partially_printed") && !item.isExpired
  );
  const popupOrders = activePendingOrders.filter((item) => !dismissedPopups.has(item.id));

  // Search filter for the sequential queue
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
            const isDouble = item.sideMode === "double_sided";
            const isOddDone = item.duplexStep === "odd_printed" || item.status === "partially_printed";
            const totalSheets = isDouble ? Math.ceil(item.totalPages / 2) : item.totalPages;

            return (
              <div
                key={`popup-${item.id}`}
                className={cn(
                  "relative overflow-hidden rounded-3xl border-2 p-5 shadow-2xl animate-in slide-in-from-top-4 duration-300",
                  isOddDone
                    ? "border-amber-500 bg-amber-50/40 shadow-amber-950/15"
                    : "border-emerald-500 bg-white shadow-emerald-950/15"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "flex size-16 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg",
                        isOddDone
                          ? "bg-amber-600 shadow-amber-700/20"
                          : "bg-emerald-600 shadow-emerald-700/20"
                      )}
                    >
                      {isOddDone ? (
                        <RotateCw className="size-8 animate-spin text-white" />
                      ) : (
                        <BellRing className="size-8 animate-bounce" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "text-xs font-extrabold uppercase tracking-wider px-3 py-0.5 rounded-full",
                            isOddDone
                              ? "text-amber-900 bg-amber-200/80 border border-amber-300"
                              : "text-emerald-800 bg-emerald-100 border border-emerald-200"
                          )}
                        >
                          {isOddDone ? "Step 2: Flip & Print Back Side" : "New Counter Request"}
                        </span>
                        <span className="text-xs text-muted flex items-center gap-1 font-mono">
                          <Clock3 className="size-3.5 text-emerald-600" />
                          Valid {minutesLeft}m
                        </span>
                        {isDouble && (
                          <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <Layers className="size-3" /> Double-Sided (Duplex)
                          </span>
                        )}
                      </div>

                      {/* Prominent Token Number */}
                      <div className="mt-1.5 flex items-baseline gap-3">
                        <span className="text-3xl sm:text-4xl font-black text-emerald-800 font-mono tracking-tight">
                          Token #{item.tokenNumber ?? item.publicId.slice(0, 6)}
                        </span>
                        <span className="text-xl font-extrabold text-slate-900 font-mono">
                          · ₹{item.totalAmount.toFixed(2)}
                        </span>
                      </div>

                      {/* Total pages and side details */}
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        📄 {item.totalPages} Pages ({totalSheets} Sheets) · {item.blackAndWhitePages} B&amp;W, {item.colorPages} Color
                      </p>

                      {item.copiesSummary && (
                        <p className="mt-1 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg inline-block">
                          📋 {item.copiesSummary}
                        </p>
                      )}

                      {/* Turn page prompt banner when odd pages are already printed */}
                      {isDouble && isOddDone && (
                        <div className="mt-2 rounded-xl bg-amber-100/90 border border-amber-300 p-2.5 text-xs font-bold text-amber-950 flex items-center gap-2">
                          <RotateCw className="size-4 shrink-0 text-amber-700" />
                          <span>
                            Front side printed ({item.oddPagesCount ?? Math.ceil(item.totalPages / 2)} sheets). <b>Turn/flip sheets &amp; reload in tray</b>, then click Print Back Side.
                          </span>
                        </div>
                      )}

                      <p className="mt-1 text-xs text-muted">
                        {item.documents.map((d) => d.filename).join(", ")}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2.5 self-center sm:self-auto">
                    {isDouble ? (
                      !isOddDone ? (
                        <button
                          type="button"
                          disabled={actionLoading === `${item.id}-odd`}
                          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-700 px-5 py-3 text-sm font-black uppercase tracking-wider text-white shadow-[0_4px_0_0_#064e3b,0_10px_20px_rgba(5,150,105,0.35)] border-t border-emerald-300/40 hover:from-emerald-400 hover:to-emerald-600 active:translate-y-[3px] active:shadow-[0_1px_0_0_#064e3b] disabled:opacity-50 transition-all cursor-pointer select-none"
                          onClick={() => handleApprovePrint(item.id, "odd")}
                        >
                          <Printer className="size-5 shrink-0 drop-shadow-xs" />
                          <span>{actionLoading === `${item.id}-odd` ? "Printing..." : "Print Front (Odd)"}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={actionLoading === `${item.id}-even`}
                          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-b from-amber-500 via-amber-600 to-amber-700 px-5 py-3 text-sm font-black uppercase tracking-wider text-white shadow-[0_4px_0_0_#78350f,0_10px_20px_rgba(217,119,6,0.4)] border-t border-amber-300/40 hover:from-amber-400 hover:to-amber-600 active:translate-y-[3px] active:shadow-[0_1px_0_0_#78350f] disabled:opacity-50 transition-all cursor-pointer select-none animate-pulse"
                          onClick={() => handleApprovePrint(item.id, "even")}
                        >
                          <RotateCw className="size-5 shrink-0 drop-shadow-xs" />
                          <span>{actionLoading === `${item.id}-even` ? "Printing..." : "Print Next Side"}</span>
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        disabled={actionLoading === `${item.id}-all`}
                        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-700 px-6 py-3 text-sm font-black uppercase tracking-wider text-white shadow-[0_4px_0_0_#064e3b,0_10px_20px_rgba(5,150,105,0.35)] border-t border-emerald-300/40 hover:from-emerald-400 hover:to-emerald-600 active:translate-y-[3px] active:shadow-[0_1px_0_0_#064e3b] disabled:opacity-50 transition-all cursor-pointer select-none"
                        onClick={() => handleApprovePrint(item.id, "all")}
                      >
                        <Printer className="size-5 shrink-0 drop-shadow-xs" />
                        <span>{actionLoading === `${item.id}-all` ? "Printing..." : "Print Document"}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDismissPopup(item.id)}
                      className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-b from-slate-100 to-slate-200 border border-slate-300 px-4 py-3 text-xs font-bold text-slate-700 shadow-[0_3px_0_0_#94a3b8] hover:bg-slate-200 active:translate-y-[2px] active:shadow-none transition-all cursor-pointer select-none"
                      title="Keep this request in queue and attend to it later"
                    >
                      Keep in Queue
                    </button>

                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-rose-50 to-rose-100 border border-rose-200 p-3 text-rose-600 shadow-[0_3px_0_0_#fda4af] hover:bg-rose-100 hover:text-rose-700 active:translate-y-[2px] active:shadow-none transition-all cursor-pointer select-none"
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
            "rounded-2xl border px-4 py-3 text-sm flex items-center justify-between shadow-xs",
            statusMessage.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950 font-medium"
              : "border-red-200 bg-red-50 text-red-950"
          )}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="size-4 text-red-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button type="button" onClick={() => setStatusMessage(null)} className="text-xs font-bold underline ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* 2. SEQUENTIAL QUEUE CENTER */}
      <Card className="border-brand-200 shadow-md rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-line bg-gradient-to-r from-slate-50 via-white to-slate-50 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-md shadow-brand-900/20">
                <Ticket className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-brand-950">Counter Print Queue</h2>
                  <Badge tone="neutral" className="text-[10px] font-mono uppercase">
                    {shopName}
                  </Badge>
                </div>
                <p className="text-xs text-muted">
                  Showing today&apos;s requests (resets daily at midnight IST). 1-hour validity per token.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge tone={activePendingOrders.length > 0 ? "warning" : "neutral"} className="px-3 py-1 font-bold">
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
                  className="w-full rounded-xl border border-line bg-white py-1.5 pl-8 pr-3 text-xs font-semibold text-brand-950 focus:border-brand-600 focus:outline-none shadow-xs"
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted">
              <LoaderCircle className="size-6 animate-spin mr-2 text-brand-600" />
              Loading counter queue...
            </div>
          ) : filteredQueue.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted">
              <Ticket className="size-10 mx-auto mb-2 text-slate-300" />
              {searchQuery ? `No counter orders matching token #${searchQuery}.` : "No counter requests queued for today."}
            </div>
          ) : (
            <div className="divide-y divide-line/60 max-h-[600px] overflow-y-auto pr-1">
              {filteredQueue.map((item) => {
                const minutesLeft = Math.floor(item.remainingSeconds / 60);
                const isPaid = item.status === "paid" || item.status === "completed";
                const isCancelled = item.status === "cancelled";
                const isDouble = item.sideMode === "double_sided";
                const isOddDone = item.duplexStep === "odd_printed" || item.status === "partially_printed";
                const totalSheets = isDouble ? Math.ceil(item.totalPages / 2) : item.totalPages;
                const oddPages = item.oddPagesCount ?? Math.ceil(item.totalPages / 2);
                const evenPages = item.evenPagesCount ?? Math.floor(item.totalPages / 2);

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex flex-col gap-3 p-4 sm:p-5 transition hover:bg-brand-50/40",
                      isOddDone
                        ? "bg-amber-50/40 border-l-4 border-l-amber-500"
                        : item.status === "awaiting_payment" && !item.isExpired
                        ? "bg-white border-l-4 border-l-emerald-500"
                        : "bg-slate-50/60 opacity-85"
                    )}
                  >
                    {/* Top Bar: Token Number, Badges, and Amount */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      {/* Left: Enhanced Token Number Badge */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={cn(
                            "flex size-14 shrink-0 items-center justify-center rounded-2xl font-mono text-xl font-black shadow-md",
                            isPaid
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : isOddDone
                              ? "bg-amber-500 text-white shadow-amber-600/30 ring-2 ring-amber-300"
                              : item.isExpired
                              ? "bg-slate-200 text-slate-500"
                              : "bg-emerald-600 text-white shadow-emerald-700/25 ring-2 ring-emerald-300"
                          )}
                        >
                          #{item.tokenNumber ?? item.publicId.slice(0, 4)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-extrabold text-slate-900 tracking-tight">
                              Token #{item.tokenNumber ?? item.publicId.slice(0, 8)}
                            </span>

                            <Badge
                              tone={
                                isPaid
                                  ? "success"
                                  : isOddDone
                                  ? "warning"
                                  : item.isExpired
                                  ? "danger"
                                  : isCancelled
                                  ? "danger"
                                  : "warning"
                              }
                            >
                              {isPaid
                                ? "PRINTED / PAID"
                                : isOddDone
                                ? "ODD PAGES PRINTED · RELOAD TRAY"
                                : item.isExpired
                                ? "EXPIRED (1 HR)"
                                : isCancelled
                                ? "DISCARDED (MISPRINT)"
                                : "WAITING AT COUNTER"}
                            </Badge>

                            {isDouble && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-200">
                                <Layers className="size-3" /> Double-Sided
                              </span>
                            )}

                            {!isPaid && !item.isExpired && !isCancelled && !isOddDone ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <Clock3 className="size-3" /> {minutesLeft}m left
                              </span>
                            ) : null}
                          </div>

                          {/* Pages breakdown */}
                          <p className="mt-0.5 text-xs font-bold text-slate-700">
                            📄 {item.totalPages} Pages {isDouble ? `(${totalSheets} Sheets: ${oddPages} Front, ${evenPages} Back)` : ""} · {item.blackAndWhitePages} B&amp;W, {item.colorPages} Color
                            <span className="text-slate-900 font-extrabold font-mono ml-2">· ₹{item.totalAmount.toFixed(2)}</span>
                          </p>

                          {item.copiesSummary && (
                            <p className="mt-0.5 text-[11px] font-bold text-emerald-800">
                              📋 {item.copiesSummary}
                            </p>
                          )}

                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted truncate max-w-lg">
                            {item.documents.map((d, i) => (
                              <span key={d.id} className="truncate">
                                {d.filename} ({d.pageCount}p){i < item.documents.length - 1 ? " · " : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions inside Token Bar */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {!isPaid && !isCancelled && !item.isExpired ? (
                          <>
                            {isDouble ? (
                              !isOddDone ? (
                                <button
                                  type="button"
                                  disabled={actionLoading === `${item.id}-odd`}
                                  className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-700 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-white shadow-[0_2.5px_0_0_#064e3b,0_4px_8px_rgba(5,150,105,0.25)] border-t border-emerald-300/40 hover:from-emerald-400 hover:to-emerald-600 active:translate-y-[2px] active:shadow-[0_1px_0_0_#064e3b] disabled:opacity-50 transition-all cursor-pointer select-none"
                                  onClick={() => handleApprovePrint(item.id, "odd")}
                                >
                                  <Printer className="size-3.5 shrink-0 drop-shadow-xs" />
                                  <span>{actionLoading === `${item.id}-odd` ? "Printing..." : `Print Front (Odd: ${oddPages}p)`}</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={actionLoading === `${item.id}-even`}
                                  className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-b from-amber-500 via-amber-600 to-amber-700 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-white shadow-[0_2.5px_0_0_#78350f,0_4px_8px_rgba(217,119,6,0.3)] border-t border-amber-300/40 hover:from-amber-400 hover:to-amber-600 active:translate-y-[2px] active:shadow-[0_1px_0_0_#78350f] disabled:opacity-50 transition-all cursor-pointer select-none animate-pulse"
                                  onClick={() => handleApprovePrint(item.id, "even")}
                                >
                                  <RotateCw className="size-3.5 shrink-0 drop-shadow-xs" />
                                  <span>{actionLoading === `${item.id}-even` ? "Printing..." : `Print Next Side (${evenPages}p)`}</span>
                                </button>
                              )
                            ) : (
                              <button
                                type="button"
                                disabled={actionLoading === `${item.id}-all`}
                                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-700 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-white shadow-[0_2.5px_0_0_#064e3b,0_4px_8px_rgba(5,150,105,0.25)] border-t border-emerald-300/40 hover:from-emerald-400 hover:to-emerald-600 active:translate-y-[2px] active:shadow-[0_1px_0_0_#064e3b] disabled:opacity-50 transition-all cursor-pointer select-none"
                                onClick={() => handleApprovePrint(item.id, "all")}
                              >
                                <Printer className="size-3.5 shrink-0 drop-shadow-xs" />
                                <span>{actionLoading === `${item.id}-all` ? "Printing..." : "Print Document"}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={actionLoading === item.id}
                              className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 border border-slate-300 shadow-[0_2px_0_0_#94a3b8] hover:from-slate-50 hover:to-slate-200 active:translate-y-[1px] active:shadow-none transition-all cursor-pointer select-none"
                              onClick={() => handleCancelOrder(item.id)}
                            >
                              <XCircle className="size-3 text-slate-500" />
                              <span>Cancel</span>
                            </button>
                          </>
                        ) : isPaid ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-800 shadow-2xs">
                              <CheckCircle2 className="size-3.5 text-emerald-600" /> Approved
                            </span>
                            <button
                              type="button"
                              disabled={actionLoading === `discard-${item.id}`}
                              className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-gradient-to-b from-rose-500 via-rose-600 to-rose-700 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wider text-white shadow-[0_2.5px_0_0_#881337,0_4px_8px_rgba(225,29,72,0.25)] border-t border-rose-300/40 hover:from-rose-400 hover:to-rose-600 active:translate-y-[2px] active:shadow-[0_1px_0_0_#881337] disabled:opacity-50 transition-all cursor-pointer select-none"
                              onClick={() => handleDiscardOrder(item.id, item.tokenNumber, item.totalAmount)}
                              title="Customer rejected print or defective misprint. Excludes amount from revenue."
                            >
                              <Trash2 className="size-3 shrink-0 drop-shadow-xs" />
                              <span>Discard Misprint</span>
                            </button>
                          </div>
                        ) : isCancelled ? (
                          <div className="flex flex-col items-end text-right">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-extrabold text-rose-700">
                              <Trash2 className="size-3 text-rose-500" /> Discarded Misprint
                            </span>
                            <span className="mt-0.5 text-[9px] text-rose-600 font-semibold">
                              Excluded from revenue (₹0.00 counted)
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted italic">
                            {item.isExpired ? "Request expired after 1 hr" : "Cancelled"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Step-by-Step Duplex Instruction Banner inside Token Bar */}
                    {isDouble && isOddDone && (
                      <div className="rounded-2xl border-2 border-dashed border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50/70 p-3 text-amber-950 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <RotateCw className="size-4 shrink-0 text-amber-700" />
                          <span>
                            <b>Step 1 Complete:</b> {oddPages} Odd Pages printed on Front. <b>👉 Turn/flip sheets &amp; reload them in the printer tray</b>, then click <b>Print Next Side ({evenPages}p)</b>.
                          </span>
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0 shadow-sm"
                          loading={actionLoading === `${item.id}-even`}
                          onClick={() => handleApprovePrint(item.id, "even")}
                        >
                          <Printer className="size-3.5" />
                          Print Next Side
                        </Button>
                      </div>
                    )}
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
