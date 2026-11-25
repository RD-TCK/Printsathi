"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, FileText, Laptop, Layers, Printer, QrCode, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrintJob {
  filename: string;
  pages: number;
  type: "B&W" | "Color";
  amount: number;
  customer: string;
  printer: string;
  timeAgo: string;
  app: "GPay" | "PhonePe" | "Paytm";
}

const SAMPLE_JOBS: PrintJob[] = [
  {
    filename: "Project_Report_Final.pdf",
    pages: 12,
    type: "B&W",
    amount: 24,
    customer: "Priya Sharma",
    printer: "Canon imageRUNNER",
    timeAgo: "2s ago",
    app: "PhonePe",
  },
  {
    filename: "Semester_5_Admit_Card.pdf",
    pages: 2,
    type: "B&W",
    amount: 10,
    customer: "Rohit K.",
    printer: "HP LaserJet M126nw",
    timeAgo: "Just now",
    app: "GPay",
  },
  {
    filename: "Aadhaar_Card_Print.pdf",
    pages: 1,
    type: "Color",
    amount: 15,
    customer: "Amit Patel",
    printer: "Epson L3250",
    timeAgo: "6s ago",
    app: "Paytm",
  },
];

export function HeroPrintLoopAnimation() {
  const [viewMode, setViewMode] = useState<"scene" | "terminal">("scene");
  const [jobIndex, setJobIndex] = useState(0);
  const [status, setStatus] = useState<"scanning" | "paying" | "printing" | "completed">("scanning");

  // Cycle jobs and live stages
  useEffect(() => {
    let isMounted = true;

    const cycle = () => {
      if (!isMounted) return;

      setStatus("scanning");

      const t1 = setTimeout(() => {
        if (!isMounted) return;
        setStatus("paying");
      }, 1400);

      const t2 = setTimeout(() => {
        if (!isMounted) return;
        setStatus("printing");
      }, 2600);

      const t3 = setTimeout(() => {
        if (!isMounted) return;
        setStatus("completed");
      }, 4400);

      const t4 = setTimeout(() => {
        if (!isMounted) return;
        setJobIndex((prev) => (prev + 1) % SAMPLE_JOBS.length);
        cycle();
      }, 6200);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    };

    const cleanup = cycle();
    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, []);

  const currentJob = SAMPLE_JOBS[jobIndex];

  return (
    <div className="relative w-full max-w-[560px] mx-auto select-none py-1">
      {/* Warm natural ambient glow behind card */}
      <div className="absolute -top-8 -left-8 size-64 rounded-full bg-emerald-100/40 blur-3xl -z-10" />
      <div className="absolute -bottom-8 -right-8 size-64 rounded-full bg-amber-100/30 blur-3xl -z-10" />

      {/* Main Container Card */}
      <div className="relative rounded-2xl bg-white border border-line shadow-[0_16px_48px_-12px_rgba(15,26,18,0.12)] overflow-hidden transition-all duration-300">
        
        {/* Card Header with View Switcher */}
        <div className="flex items-center justify-between border-b border-line bg-slate-50/90 px-3.5 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-semibold text-slate-800 text-[11.5px] sm:text-xs">
              Counter #1 · {viewMode === "scene" ? "3D Shop Automation" : "Live Auto-Spool"}
            </span>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-line text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setViewMode("scene")}
              className={cn(
                "px-2.5 py-1 rounded-md transition-all flex items-center gap-1",
                viewMode === "scene"
                  ? "bg-emerald-600 text-white shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <span>Counter Scene</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("terminal")}
              className={cn(
                "px-2.5 py-1 rounded-md transition-all flex items-center gap-1",
                viewMode === "terminal"
                  ? "bg-emerald-600 text-white shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Laptop className="size-3" />
              <span>Live Terminal</span>
            </button>
          </div>
        </div>

        {/* ━━━━ VIEW 1: 3D Rendered Automation Scene (DEFAULT) ━━━━ */}
        {viewMode === "scene" && (
          <div className="relative flex flex-col">
            {/* Image Stage Container */}
            <div className="relative w-full aspect-[16/10] sm:aspect-[16/9.5] bg-slate-900 overflow-hidden group">
              <Image
                src="/hero-print-shop-scene.webp"
                alt="Automated Print Shop Counter: Student scans QR standee, HP printer auto-prints document, relaxed shopkeeper sits on chair with tea and hands print over"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 560px"
                className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
              />

              {/* Gradient Vignette for readable overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/20 pointer-events-none" />

              {/* Hotspot Badge 1: Student scanning QR (Left) */}
              <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-10">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-md border border-white/60 shadow-md text-[10.5px] font-bold text-slate-800 transition-all hover:scale-105">
                  <span className="size-2 rounded-full bg-indigo-500" />
                  <span>1. Student scans &amp; pays</span>
                </div>
              </div>

              {/* Hotspot Badge 2: Shopkeeper with tea (Right) */}
              <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-md border border-white/60 shadow-md text-[10.5px] font-bold text-slate-800 transition-all hover:scale-105">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  <span>3. Auto-dispatched to tray</span>
                </div>
              </div>

              {/* Hotspot Badge 3: Center Auto-Print (Bottom center floating) */}
              <div className="absolute bottom-3 left-3 right-3 z-10">
                <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/85 backdrop-blur-md border border-white/10 text-white shadow-lg">
                  <div className="flex items-center gap-2 text-xs truncate">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-xs">
                      <Zap className="size-3.5 fill-current" />
                    </span>
                    <div className="truncate">
                      <p className="font-bold text-[11px] truncate flex items-center gap-1.5">
                        <span>2. 2-Second Auto-Spool</span>
                        <span className="text-[10px] font-mono text-emerald-400 font-normal">
                          ({currentJob.printer})
                        </span>
                      </p>
                      <p className="text-[10px] text-slate-300 truncate">
                        {currentJob.filename} · {currentJob.pages} pgs · ₹{currentJob.amount} via {currentJob.app}
                      </p>
                    </div>
                  </div>

                  <span className="shrink-0 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono text-[9.5px] font-bold">
                    PRINTED
                  </span>
                </div>
              </div>
            </div>

            {/* 3 Story Footnotes */}
            <div className="p-3 bg-white border-t border-line grid grid-cols-3 divide-x divide-line text-center text-[10.5px]">
              <div className="px-1.5">
                <p className="font-bold text-slate-900">Zero WhatsApp</p>
                <p className="text-[10px] text-muted">Customer scans &amp; pays</p>
              </div>
              <div className="px-1.5">
                <p className="font-bold text-emerald-700">2-Sec Windows Spool</p>
                <p className="text-[10px] text-muted">Zero PC clicks required</p>
              </div>
              <div className="px-1.5">
                <p className="font-bold text-slate-900">Relaxed Counter</p>
                <p className="text-[10px] text-muted">No line chaos or yelling</p>
              </div>
            </div>
          </div>
        )}

        {/* ━━━━ VIEW 2: Live Job Execution Terminal ━━━━ */}
        {viewMode === "terminal" && (
          <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            {/* LEFT: Physical Counter QR Acrylic Stand (5 cols) */}
            <div className="sm:col-span-5 flex flex-col items-center">
              <div className="relative w-full max-w-[190px] rounded-xl bg-gradient-to-b from-white to-slate-50 border-2 border-slate-200 shadow-md p-3 text-center">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-[10px] font-bold text-brand-800 border border-brand-200 mb-2">
                  <QrCode className="size-3 text-brand-600" />
                  <span>SCAN TO PRINT</span>
                </div>

                <div className="relative mx-auto size-32 rounded-lg bg-white p-2 border border-slate-200/90 shadow-2xs">
                  <svg viewBox="0 0 100 100" className="w-full h-full text-slate-900 fill-current">
                    <rect x="6" y="6" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="5" />
                    <rect x="13" y="13" width="12" height="12" rx="2" />
                    <rect x="68" y="6" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="5" />
                    <rect x="75" y="13" width="12" height="12" rx="2" />
                    <rect x="6" y="68" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="5" />
                    <rect x="13" y="75" width="12" height="12" rx="2" />
                    <rect x="42" y="10" width="8" height="8" rx="1.5" />
                    <rect x="52" y="18" width="8" height="8" rx="1.5" />
                    <rect x="42" y="44" width="16" height="16" rx="3" />
                    <rect x="68" y="68" width="8" height="8" rx="1.5" />
                    <rect x="78" y="78" width="12" height="12" rx="2" />
                  </svg>

                  <div
                    className={cn(
                      "absolute left-1 right-1 h-[2px] bg-emerald-500 shadow-[0_0_8px_#10b981] transition-all duration-700 pointer-events-none",
                      status === "scanning" ? "top-[80%] opacity-100" : "top-[20%] opacity-30"
                    )}
                  />
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex items-center justify-center gap-1.5 text-[9px] font-semibold text-slate-500">
                  <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">GPay</span>
                  <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-indigo-700">PhonePe</span>
                  <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-sky-700">Paytm</span>
                </div>
              </div>
              <span className="text-[10px] text-muted mt-1.5 font-medium">Counter Acrylic Standee</span>
            </div>

            {/* RIGHT: Live Job Execution Terminal (7 cols) */}
            <div className="sm:col-span-7 space-y-3">
              <div className="rounded-xl border border-line bg-slate-50/70 p-3 shadow-2xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white border border-line text-brand-600 shadow-2xs">
                      <FileText className="size-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-brand-950 truncate max-w-[160px]">
                        {currentJob.filename}
                      </p>
                      <p className="text-[11px] text-muted">
                        {currentJob.pages} pages • {currentJob.type} • {currentJob.customer}
                      </p>
                    </div>
                  </div>
                  <span className="rounded bg-white px-2 py-0.5 text-xs font-bold text-brand-900 border border-line shadow-2xs">
                    ₹{currentJob.amount}
                  </span>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 font-medium">
                    {status === "scanning" && (
                      <span className="text-slate-600 flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Customer uploading file...
                      </span>
                    )}
                    {status === "paying" && (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <Check className="size-3 text-emerald-600 stroke-[3]" />
                        UPI ₹{currentJob.amount} Paid via {currentJob.app}
                      </span>
                    )}
                    {status === "printing" && (
                      <span className="text-brand-700 font-semibold flex items-center gap-1">
                        <Printer className="size-3.5 text-brand-600 animate-bounce" />
                        Printing on {currentJob.printer}...
                      </span>
                    )}
                    {status === "completed" && (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <Check className="size-3.5 text-emerald-600 stroke-[3]" />
                        Job Dispatched &amp; Printed (1.8s)
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] font-mono text-muted">{currentJob.timeAgo}</span>
                </div>
              </div>

              <div className={cn(
                "rounded-xl border p-2.5 transition-all duration-300 flex items-center justify-between shadow-2xs",
                status === "printing" || status === "completed"
                  ? "bg-emerald-50/80 border-emerald-200 text-emerald-950"
                  : "bg-white border-line text-slate-600"
              )}>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "size-7 rounded-lg flex items-center justify-center shrink-0 border",
                    status === "completed"
                      ? "bg-emerald-500 border-emerald-600 text-white"
                      : "bg-slate-100 border-slate-200 text-slate-700"
                  )}>
                    <Printer className="size-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900">{currentJob.printer}</span>
                      <span className="rounded bg-white px-1.5 py-0.2 text-[9px] font-mono font-medium text-slate-600 border border-slate-200">
                        USB 2.0
                      </span>
                    </div>
                    <p className="text-[10px] text-muted">
                      Zero manual clicks • No WhatsApp window needed
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full inline-block",
                    status === "completed"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-700"
                  )}>
                    {status === "completed" ? "Printed" : status === "printing" ? "Spooling..." : "Ready"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Hardware Compatibility Bar */}
        <div className="border-t border-line bg-brand-50/40 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-brand-950">Works with existing printers:</span>
            <span className="font-medium text-slate-600">HP LaserJet · Canon · Epson · Brother</span>
          </div>
          <span className="font-mono text-emerald-700 font-semibold flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            0.8s Driver Spool
          </span>
        </div>

      </div>
    </div>
  );
}
