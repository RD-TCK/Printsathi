"use client";

import React from "react";

interface PrinterLoaderProps {
  label?: string;
  className?: string;
  compact?: boolean;
}

export function PrinterLoader({ label = "Loading...", className = "", compact = false }: PrinterLoaderProps) {
  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <div className="relative flex size-6 items-center justify-center">
          <svg className="size-5 text-emerald-600 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 14h12v8H6z" />
          </svg>
        </div>
        {label ? <span className="text-xs font-semibold text-emerald-800">{label}</span> : null}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
      {/* Animated Green Printer Container */}
      <div className="relative mb-4 flex flex-col items-center justify-center">
        {/* Top Paper Feeding In */}
        <div className="h-4 w-12 overflow-hidden rounded-t bg-emerald-100/80 border-t border-x border-emerald-300 relative">
          <div className="h-full w-full bg-emerald-200/50 animate-pulse" />
        </div>

        {/* Printer Main Body */}
        <div className="relative z-10 flex h-14 w-24 items-center justify-between rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-800 p-2 shadow-lg shadow-emerald-900/20 border border-emerald-500">
          {/* Status LED Light */}
          <div className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-300 animate-ping" />
            <span className="size-2 rounded-full bg-emerald-300" />
          </div>

          {/* Output Paper Slot */}
          <div className="h-1.5 w-16 rounded-full bg-emerald-950/80 shadow-inner" />

          {/* Control Button Mockup */}
          <div className="size-2 rounded-full bg-emerald-400/80" />
        </div>

        {/* Printed Document Sliding Out */}
        <div className="relative z-0 -mt-2 h-14 w-16 overflow-hidden rounded-b-md border border-t-0 border-emerald-300 bg-white p-1.5 shadow-md">
          {/* Sliding Paper Animation */}
          <div className="animate-paper-feed space-y-1">
            <div className="h-1 w-full rounded bg-emerald-500/80 animate-print-lines" />
            <div className="h-1 w-3/4 rounded bg-emerald-400/70" />
            <div className="h-1 w-5/6 rounded bg-emerald-500/80" />
            <div className="h-1 w-1/2 rounded bg-emerald-300/60" />
          </div>
        </div>
      </div>

      {/* Loading Text */}
      <p className="font-medium text-emerald-900 animate-pulse">{label}</p>
    </div>
  );
}
