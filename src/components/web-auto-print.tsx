"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Printer,
  Volume2,
  VolumeX,
  Play,
  Pause,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type PrintableJob = {
  id: string;
  order_id: string;
  document_id: string;
  status: string;
  total_pages: number;
  total_amount: number;
  currency: string;
  created_at: string;
  documents?: {
    id: string;
    original_filename: string;
  };
  orders?: {
    id: string;
    public_id: string;
    status: string;
    payments?: Array<{ id: string; status: string; provider_payment_id: string }>;
  };
};

type ActivityLog = {
  id: string;
  timestamp: string;
  text: string;
  type: "info" | "success" | "warning";
};

export function WebAutoPrintStation({ shopName }: { shopName: string }) {
  const [autoPrintActive, setAutoPrintActive] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [printedCount, setPrintedCount] = useState<number>(0);
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  const processedJobIdsRef = useRef<Set<string>>(new Set());
  const printIframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    setLogs([
      {
        id: "init",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        text: "⚡ Web Auto-Print Station initialized. Listening for customer paid orders...",
        type: "info",
      },
    ]);
  }, []);

  const addLog = useCallback((text: string, type: "info" | "success" | "warning" = "info") => {
    setLogs((prev) => [
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        text,
        type,
      },
      ...prev.slice(0, 19),
    ]);
  }, []);

  const playChime = useCallback(() => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Bell tone 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now); // D5
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.6);

      // Bell tone 2 (higher note harmonic)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880, now + 0.1); // A5
      gain2.gain.setValueAtTime(0.15, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.8);
    } catch {
      // AudioContext blocked by browser policy
    }
  }, [soundEnabled]);

  const dispatchAutoPrint = useCallback(
    async (job: PrintableJob) => {
      if (processedJobIdsRef.current.has(job.id)) return;
      processedJobIdsRef.current.add(job.id);

      const filename = job.documents?.original_filename || "Document.pdf";
      addLog(`🖨️ New paid job received: #${job.id.slice(0, 8)} (${job.total_pages} pages, ₹${Number(job.total_amount).toFixed(2)})`, "info");
      playChime();

      try {
        const documentUrl = `/api/shop/print-document?jobId=${job.id}`;

        // Create or reuse hidden iframe for zero-touch print triggering
        if (!printIframeRef.current) {
          const iframe = document.createElement("iframe");
          iframe.style.position = "fixed";
          iframe.style.right = "0";
          iframe.style.bottom = "0";
          iframe.style.width = "0";
          iframe.style.height = "0";
          iframe.style.border = "none";
          iframe.id = "auto-print-frame";
          document.body.appendChild(iframe);
          printIframeRef.current = iframe;
        }

        const iframe = printIframeRef.current;
        iframe.src = documentUrl;

        iframe.onload = () => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            // Popup fallback
            window.open(documentUrl, "_blank");
          }
        };

        // Mark completed automatically without human intervention
        await fetch("/api/shop/complete-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id, status: "completed" }),
        });

        setPrintedCount((c) => c + 1);
        addLog(`✅ Job #${job.id.slice(0, 8)} (${filename}) auto-printed & completed!`, "success");
      } catch (err) {
        addLog(`⚠️ Auto-print error for #${job.id.slice(0, 8)}: ${err instanceof Error ? err.message : "Print failed"}`, "warning");
      }
    },
    [addLog, playChime],
  );

  const pollPendingJobs = useCallback(async () => {
    if (!autoPrintActive) return;
    setIsPolling(true);
    try {
      const res = await fetch("/api/shop/pending-jobs");
      if (res.ok) {
        const data = await res.json();
        const pending: PrintableJob[] = data.jobs || [];
        for (const job of pending) {
          if (!processedJobIdsRef.current.has(job.id)) {
            await dispatchAutoPrint(job);
          }
        }
      }
    } catch {
      // Polling network retry
    } finally {
      setIsPolling(false);
    }
  }, [autoPrintActive, dispatchAutoPrint]);

  useEffect(() => {
    if (!autoPrintActive) return;
    const interval = setInterval(() => {
      pollPendingJobs();
    }, 4000);
    pollPendingJobs();
    return () => clearInterval(interval);
  }, [autoPrintActive, pollPendingJobs]);

  return (
    <Card className="border-brand-200 bg-gradient-to-br from-white via-brand-50/30 to-emerald-50/20 shadow-md">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/20">
              <Printer className="size-5" />
              {autoPrintActive && (
                <span className="absolute -top-1 -right-1 flex size-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex size-3 rounded-full bg-emerald-500"></span>
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-brand-950">Web Auto-Print Station</h3>
                <Badge tone={autoPrintActive ? "success" : "neutral"}>
                  {autoPrintActive ? "LIVE AUTO-PRINT ON" : "PAUSED"}
                </Badge>
              </div>
              <p className="text-xs text-muted">
                Zero-touch printing for {shopName}: customer paid orders print automatically without human intervention.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Mute audio alerts" : "Enable audio alerts"}
            >
              {soundEnabled ? <Volume2 className="size-4 text-brand-700" /> : <VolumeX className="size-4 text-muted" />}
              <span className="hidden sm:inline">{soundEnabled ? "Sound On" : "Muted"}</span>
            </Button>
            <Button
              variant={autoPrintActive ? "secondary" : "primary"}
              size="sm"
              onClick={() => {
                setAutoPrintActive(!autoPrintActive);
                addLog(autoPrintActive ? "⏸️ Auto-print station paused." : "▶️ Auto-print station resumed.", "info");
              }}
            >
              {autoPrintActive ? (
                <>
                  <Pause className="size-4 text-amber-600" />
                  <span>Pause Auto-Print</span>
                </>
              ) : (
                <>
                  <Play className="size-4 text-white" />
                  <span>Start Auto-Print</span>
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => pollPendingJobs()}
              loading={isPolling}
              title="Check for new orders now"
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-white p-3">
            <span className="text-xs font-medium text-muted">Auto-Printed Today</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-brand-900">{printedCount}</span>
              <span className="text-xs text-emerald-600 font-semibold">orders completed</span>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-white p-3">
            <span className="text-xs font-medium text-muted">Desktop Agent Required?</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm font-bold text-emerald-700">No (100% Web)</span>
              <span className="text-xs text-muted">Prints directly from browser</span>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-white p-3">
            <span className="text-xs font-medium text-muted">Automation Mode</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm font-bold text-brand-700">Hands-Free</span>
              <span className="text-xs text-muted">Auto-claims & auto-completes</span>
            </div>
          </div>
        </div>

        {/* Live Activity Log */}
        <div className="mt-3 rounded-lg border border-line bg-slate-950 p-3 text-xs font-mono text-slate-200">
          <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-1 text-slate-400">
            <span className="flex items-center gap-1.5 font-sans font-semibold text-emerald-400">
              <Sparkles className="size-3.5" />
              Live Print Activity Stream
            </span>
            <span className="text-[10px] text-slate-500">Auto-refreshing every 4s</span>
          </div>
          <div className="max-h-28 space-y-1 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 leading-tight">
                <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                <span
                  className={
                    log.type === "success"
                      ? "text-emerald-400 font-semibold"
                      : log.type === "warning"
                        ? "text-amber-300"
                        : "text-slate-300"
                  }
                >
                  {log.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Direct Manual Web Print Button component for tables and job cards
 */
export function WebPrintButton({
  jobId,
  documentName = "Document",
  status,
}: {
  jobId: string;
  documentName?: string;
  status: string;
}) {
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const url = `/api/shop/print-document?jobId=${jobId}`;
      const printWindow = window.open(url, "_blank");
      if (printWindow) {
        printWindow.focus();
      } else {
        // Iframe fallback if popup blocker is active
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = url;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          iframe.contentWindow?.print();
        };
      }

      // Mark completed if still pending
      if (status !== "completed") {
        await fetch("/api/shop/complete-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, status: "completed" }),
        });
      }
    } catch {
      // Manual print error
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handlePrint}
        disabled={printing}
        className="inline-flex items-center gap-1 rounded bg-brand-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        <Printer className="size-3.5" />
        {printing ? "Printing..." : "Print (Web)"}
      </button>
      <a
        href={`/api/shop/print-document?jobId=${jobId}`}
        target="_blank"
        rel="noopener noreferrer"
        download={documentName}
        className="inline-flex items-center rounded border border-line bg-white px-1.5 py-1 text-xs text-muted hover:bg-slate-50"
        title="Download file"
      >
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}
