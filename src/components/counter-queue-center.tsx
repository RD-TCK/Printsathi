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
                  <div className="flex flex-wrap items-center gap-2 self-center sm:self-auto">
                    {isDouble ? (
                      !isOddDone ? (
                        <Button
                          variant="primary"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 shadow-md shadow-emerald-700/20"
                          loading={actionLoading === `${item.id}-odd`}
                          onClick={() => handleApprovePrint(item.id, "odd")}
                        >
                          <Printer className="size-4" />
                          Print Front Side (Odd Pages)
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-4 shadow-md shadow-amber-700/20"
                          loading={actionLoading === `${item.id}-even`}
                          onClick={() => handleApprovePrint(item.id, "even")}
                        >
                          <Printer className="size-4" />
                          Print Back Side (Even Pages)
                        </Button>
                      )
                    ) : (
                      <Button
                        variant="primary"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-5 shadow-md shadow-emerald-700/20"
                        loading={actionLoading === `${item.id}-all`}
                        onClick={() => handleApprovePrint(item.id, "all")}
                      >
                        <Printer className="size-4" />
                        Print Document
                      </Button>
                    )}

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
                                ? "CANCELLED"
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
                      <div className="flex flex-wrap items-center gap-2">
                        {!isPaid && !isCancelled && !item.isExpired ? (
                          <>
                            {isDouble ? (
                              !isOddDone ? (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm"
                                  loading={actionLoading === `${item.id}-odd`}
                                  onClick={() => handleApprovePrint(item.id, "odd")}
                                >
                                  <Printer className="size-3.5" />
                                  Print Front (Odd: {oddPages}p)
                                </Button>
                              ) : (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md shadow-amber-700/20 ring-2 ring-amber-300 animate-pulse"
                                  loading={actionLoading === `${item.id}-even`}
                                  onClick={() => handleApprovePrint(item.id, "even")}
                                >
                                  <RotateCw className="size-3.5" />
                                  Print Back (Even: {evenPages}p)
                                </Button>
                              )
                            ) : (
                              <Button
                                variant="primary"
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm"
                                loading={actionLoading === `${item.id}-all`}
                                onClick={() => handleApprovePrint(item.id, "all")}
                              >
                                <Printer className="size-3.5" />
                                Print Document
                              </Button>
                            )}

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
                              <div className="flex items-center gap-1">
                                {isDouble ? (
                                  <>
                                    <a
                                      href={`/api/shop/print-document?jobId=${item.jobs[0].id}&duplexStep=odd`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                                      title="Reprint Odd pages"
                                    >
                                      <Printer className="size-3" /> Odd (Front)
                                    </a>
                                    <a
                                      href={`/api/shop/print-document?jobId=${item.jobs[0].id}&duplexStep=even`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                                      title="Reprint Even pages"
                                    >
                                      <Printer className="size-3" /> Even (Back)
                                    </a>
                                  </>
                                ) : (
                                  <a
                                    href={`/api/shop/print-document?jobId=${item.jobs[0].id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1 text-xs text-brand-700 hover:bg-slate-50"
                                  >
                                    <Printer className="size-3" /> Reprint
                                  </a>
                                )}
                              </div>
                            )}
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
                            <b>Step 1 Complete:</b> {oddPages} Odd Pages printed on Front. <b>👉 Turn/flip sheets &amp; reload them in the printer tray</b>, then click <b>Print Back (Even: {evenPages}p)</b>.
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
                          Print Back Side
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
