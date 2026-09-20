"use client";

import { useRef, useState, useCallback } from "react";
import { Printer, FileText, CheckCircle2 } from "lucide-react";

export function InteractivePrinter() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [paperOut, setPaperOut] = useState(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      setRotation({ x: y * -12, y: x * 12 });
    },
    [],
  );

  const handlePrint = () => {
    if (isPrinting) return;
    setIsPrinting(true);
    setPaperOut(false);
    setTimeout(() => setPaperOut(true), 1200);
    setTimeout(() => {
      setIsPrinting(false);
      setPaperOut(false);
    }, 3500);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-md mx-auto select-none"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setRotation({ x: 0, y: 0 });
      }}
      style={{ perspective: "1000px" }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 -z-10 rounded-full transition-all duration-700"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 60%, rgba(16,185,129,0.15), transparent)",
          filter: isHovered ? "blur(60px)" : "blur(80px)",
          transform: isHovered ? "scale(1.1)" : "scale(1)",
        }}
      />

      {/* 3D Printer body */}
      <div
        className="relative transition-transform duration-300 ease-out"
        style={{
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          transformStyle: "preserve-3d",
        }}
      >
        {/* Main printer body */}
        <div className="relative mx-auto w-72 sm:w-80">
          {/* Top lid / scanner */}
          <div
            className="relative z-20 mx-auto w-[90%] rounded-t-2xl border border-brand-200 bg-gradient-to-b from-white to-brand-50/80 p-3 shadow-sm"
            style={{ transform: "translateZ(20px)" }}
          >
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <div
                  className={`size-2 rounded-full transition-colors duration-300 ${
                    isPrinting
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-brand-300"
                  }`}
                />
                <span className="text-[10px] font-medium text-brand-700 tracking-wide uppercase">
                  {isPrinting ? "Printing…" : "Ready"}
                </span>
              </div>
              <Printer className="size-3.5 text-brand-400" />
            </div>
          </div>

          {/* Paper feed slot */}
          <div
            className="relative z-10 mx-auto w-[95%] overflow-hidden"
            style={{ transform: "translateZ(10px)" }}
          >
            <div className="h-3 bg-gradient-to-b from-brand-100 to-brand-200/60 border-x border-brand-200 flex items-center justify-center">
              <div className="w-16 h-[2px] rounded-full bg-brand-300/60" />
            </div>

            {/* Paper coming out */}
            <div
              className="relative overflow-hidden transition-all duration-700 ease-out"
              style={{
                height: paperOut ? "80px" : "0px",
                opacity: paperOut ? 1 : 0,
              }}
            >
              <div className="mx-auto w-[70%] border border-brand-200 bg-white rounded-b-sm shadow-md p-3">
                <div className="space-y-1.5">
                  <div className="h-[3px] w-full rounded bg-brand-200" />
                  <div className="h-[3px] w-4/5 rounded bg-brand-200" />
                  <div className="h-[3px] w-3/5 rounded bg-brand-300/60" />
                  <div className="h-[3px] w-2/3 rounded bg-brand-200" />
                </div>
                {paperOut && (
                  <div className="mt-2 flex items-center gap-1 text-[9px] text-emerald-600 font-medium">
                    <CheckCircle2 className="size-2.5" />
                    <span>Printed</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main body */}
          <div
            className="relative z-0 mx-auto rounded-b-2xl border border-brand-200 bg-gradient-to-b from-brand-50/60 via-white to-brand-50/40 shadow-lg shadow-emerald-950/[0.06] overflow-hidden"
            style={{ transform: "translateZ(0px)" }}
          >
            {/* Control panel */}
            <div className="p-5 pb-4">
              {/* Mini LCD screen */}
              <div className="rounded-xl border border-brand-200 bg-brand-950 p-3.5 shadow-inner">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium text-emerald-400/70 uppercase tracking-wider">
                      {isPrinting ? "Active Job" : "Queue"}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-white">
                      {isPrinting
                        ? "Report_Final.pdf"
                        : "3 jobs waiting"}
                    </p>
                  </div>
                  <div className="text-right">
                    {isPrinting ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-400 transition-all duration-[2500ms] ease-linear"
                            style={{
                              width: isPrinting ? "100%" : "0%",
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-emerald-400 font-mono">
                          18/24
                        </span>
                      </div>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                        Online
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Buttons row */}
              <div className="mt-3.5 flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="group flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-brand-600/25 transition-all hover:bg-brand-500 hover:shadow-lg hover:shadow-brand-600/30 active:scale-[0.97] active:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <FileText className="size-3.5" />
                  {isPrinting ? "Printing…" : "Print Demo"}
                </button>
                <div className="flex gap-1.5">
                  <div className="size-7 rounded-lg border border-brand-200 bg-white flex items-center justify-center text-brand-500 hover:bg-brand-50 transition-colors cursor-pointer">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                  <div className="size-7 rounded-lg border border-brand-200 bg-white flex items-center justify-center text-brand-500 hover:bg-brand-50 transition-colors cursor-pointer">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="19" cy="12" r="1" />
                      <circle cx="5" cy="12" r="1" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Paper tray indicator */}
            <div className="border-t border-brand-200/60 bg-brand-50/50 px-5 py-2.5 flex items-center justify-between text-[10px]">
              <span className="text-brand-500 font-medium uppercase tracking-wider">
                A4 Paper Tray
              </span>
              <span className="flex items-center gap-1.5 text-brand-600 font-medium">
                <span className="inline-block w-8 h-1 rounded-full bg-brand-200 overflow-hidden">
                  <span className="block h-full w-[85%] rounded-full bg-brand-400" />
                </span>
                85%
              </span>
            </div>
          </div>

          {/* Shadow / base */}
          <div
            className="mx-auto mt-1 h-3 w-[85%] rounded-b-2xl bg-gradient-to-b from-brand-200/40 to-transparent blur-sm"
            style={{ transform: "translateZ(-5px)" }}
          />
        </div>
      </div>

      {/* Interactive hint */}
      <p className="mt-6 text-center text-[11px] text-muted animate-pulse">
        ↕ Hover to rotate · Click &quot;Print Demo&quot; to see it in action
      </p>
    </div>
  );
}
