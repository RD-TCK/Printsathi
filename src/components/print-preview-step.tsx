"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Printer,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Ticket,
  ShieldCheck,
  Store,
  Layers,
  CheckCircle2,
  AlertTriangle,
  LoaderCircle,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
} from "lucide-react";
import type { PublicShop } from "@/lib/shops/public-lookup";
import type { CustomerDocument, Estimate } from "@/components/customer-print-flow";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  shop: PublicShop;
  documents: CustomerDocument[];
  activeDocument: number;
  setActiveDocument: (index: number) => void;
  estimate: Estimate | null;
  busy: boolean;
  onBackToConfigure: () => void;
  onProceedToPay: () => void;
  onProceedToCounterToken: () => void;
  selectedMode: "counter" | "online";
  setSelectedMode: (mode: "counter" | "online") => void;
};

export function PrintPreviewStep({
  shop,
  documents,
  activeDocument,
  setActiveDocument,
  estimate,
  busy,
  onBackToConfigure,
  onProceedToPay,
  onProceedToCounterToken,
  selectedMode,
  setSelectedMode,
}: Props) {
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [selectedPreviewPage, setSelectedPreviewPage] = useState<number | null>(null);
  const current = documents[activeDocument] || documents[0];

  const shopPaymentMode = shop.payment_mode || "both";

  // Build a set of included pages for the active document based on its ranges
  const includedPagesMap = new Map<number, { colorMode: string; sideMode: string; copies: number }>();
  if (current) {
    current.ranges.forEach((r) => {
      const start = Number(r.startPage) || 1;
      const end = Number(r.endPage) || start;
      const copies = Number(r.copies) || 1;
      for (let p = Math.min(start, end); p <= Math.max(start, end); p++) {
        includedPagesMap.set(p, {
          colorMode: r.colorMode,
          sideMode: r.sideMode ?? "single_sided",
          copies,
        });
      }
    });
  }

  // Calculate simulated sheets for the active document
  const totalPagesInDoc = current ? current.pageCount : 1;
  const pagesList = Array.from({ length: totalPagesInDoc }, (_, i) => i + 1);

  const fallbackTotalPages = documents.reduce((sum, doc) => {
    return (
      sum +
      doc.ranges.reduce((rSum, r) => {
        const start = Number(r.startPage) || 1;
        const end = Number(r.endPage) || start;
        const count = Math.max(0, end - start + 1);
        return rSum + count * (Number(r.copies) || 1);
      }, 0)
    );
  }, 0);

  const fallbackPrice = fallbackTotalPages * 5;

  // Handle browser back button when fullscreen preview modal is open
  const closeFullscreenPreview = useCallback(() => {
    setSelectedPreviewPage(null);
  }, []);

  const openFullscreenPreview = (pageNum: number) => {
    setSelectedPreviewPage(pageNum);
    if (typeof window !== "undefined") {
      window.history.pushState({ previewModal: true }, "");
    }
  };

  useEffect(() => {
    if (selectedPreviewPage === null) return;

    const handlePopState = (e: PopStateEvent) => {
      // Intercept browser back button to only close the preview modal
      closeFullscreenPreview();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeFullscreenPreview();
      } else if (e.key === "ArrowLeft") {
        setSelectedPreviewPage((prev) => (prev && prev > 1 ? prev - 1 : prev));
      } else if (e.key === "ArrowRight") {
        setSelectedPreviewPage((prev) => (prev && prev < totalPagesInDoc ? prev + 1 : prev));
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedPreviewPage, totalPagesInDoc, closeFullscreenPreview]);

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs">
              <Eye className="size-4" />
            </span>
            <h2 className="text-lg sm:text-xl font-black text-slate-900">
              Print Job Preview &amp; Review
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Verify pages, print modes, and sheet layout before submitting to printer.
          </p>
        </div>

        {/* Back to Configure trigger button */}
        <button
          type="button"
          onClick={() => setShowWarningModal(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold text-slate-700 shadow-[0_2px_0_#e2e8f0] hover:bg-slate-50 hover:border-amber-400 active:translate-y-0.5 active:shadow-none transition cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          Edit Settings
        </button>
      </div>

      {/* 2. Visual Document & Simulated Paper Sheet Inspector */}
      <Card className="p-4 sm:p-6 border-slate-200/80 bg-white shadow-md rounded-3xl overflow-hidden">
        {/* Document Selector Tabs */}
        {documents.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 border-b border-slate-100 no-scrollbar">
            {documents.map((doc, idx) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setActiveDocument(idx)}
                className={cn(
                  "flex items-center gap-1.5 shrink-0 rounded-xl border px-3 py-2 text-left text-xs transition-all cursor-pointer",
                  idx === activeDocument
                    ? "border-emerald-600 bg-emerald-50 font-bold text-emerald-950 shadow-xs ring-1 ring-emerald-500/20"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                <FileText className="size-3.5 text-emerald-600 shrink-0" />
                <span className="max-w-32 truncate">{doc.filename}</span>
                <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                  {doc.pageCount}p
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Active Document Overview Card */}
        {current && (
          <div className="rounded-2xl bg-gradient-to-r from-slate-50 via-emerald-50/20 to-teal-50/20 border border-slate-200/80 p-3.5 sm:p-4 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200 shadow-2xs text-emerald-600">
                  <Printer className="size-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                    {current.filename}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {current.pageCount} total pages in document ·{" "}
                    {(current.sizeBytes / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-lg bg-white border border-slate-200 px-2.5 py-1 font-bold text-slate-700 shadow-2xs">
                  {includedPagesMap.size} of {current.pageCount} pages selected
                </span>
                <span className="rounded-lg bg-emerald-100/80 text-emerald-800 px-2.5 py-1 font-extrabold border border-emerald-200/80 shadow-2xs">
                  {current.ranges.reduce((s, r) => s + (Number(r.copies) || 1), 0)} Copies
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Visual Print Sheet Layout Grid */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="size-3.5 text-emerald-600" />
              Simulated Print Output:
            </span>
            <span className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
              <ZoomIn className="size-3 text-emerald-600" /> Tap sheet to enlarge &amp; inspect
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {pagesList.map((pageNum) => {
              const config = includedPagesMap.get(pageNum);
              const isIncluded = Boolean(config);
              const isDuplex = config?.sideMode === "double_sided";
              const isColor = config?.colorMode === "color";

              return (
                <div
                  key={`page-preview-${pageNum}`}
                  onClick={() => openFullscreenPreview(pageNum)}
                  className={cn(
                    "group relative flex flex-col justify-between rounded-2xl border-2 p-3 transition-all duration-150 cursor-pointer active:scale-97 hover:shadow-lg hover:-translate-y-0.5",
                    isIncluded
                      ? "border-emerald-500 bg-white shadow-md shadow-emerald-950/5 ring-1 ring-emerald-500/20"
                      : "border-slate-200 bg-slate-50/80 opacity-60"
                  )}
                >
                  {/* Sheet Header Badge */}
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-black",
                        isIncluded
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                          : "bg-slate-200 text-slate-600"
                      )}
                    >
                      P. {pageNum}
                    </span>

                    {isIncluded ? (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[9px] font-bold",
                          isColor
                            ? "bg-purple-100 text-purple-800"
                            : "bg-slate-100 text-slate-700"
                        )}
                      >
                        {isColor ? "🎨 Color" : "📄 B&W"}
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-slate-400">
                        Skipped
                      </span>
                    )}
                  </div>

                  {/* Simulated Paper Graphic / Image Preview */}
                  <div
                    className={cn(
                      "my-2.5 flex aspect-[1/1.3] w-full items-center justify-center rounded-xl bg-gradient-to-b from-white to-slate-50 border shadow-inner p-2 text-center overflow-hidden transition-all group-hover:border-emerald-400",
                      isIncluded && !isColor ? "border-slate-300 bg-slate-100/50" : "border-slate-200/90"
                    )}
                  >
                    {current?.previewUrl && totalPagesInDoc === 1 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={current.previewUrl}
                        alt="Document preview"
                        className={cn(
                          "max-h-full max-w-full object-contain rounded-sm transition-all",
                          isIncluded && !isColor && "grayscale contrast-105 brightness-95"
                        )}
                        style={isIncluded && !isColor ? { filter: "grayscale(100%) contrast(1.1) brightness(0.96)" } : undefined}
                      />
                    ) : (
                      <div className="space-y-1 text-slate-400">
                        <FileText
                          className={cn(
                            "size-8 mx-auto transition-colors",
                            isIncluded ? (isColor ? "text-purple-600" : "text-slate-600") : "text-slate-300"
                          )}
                        />
                        <span className={cn("block text-[10px] font-bold", isIncluded ? (isColor ? "text-purple-900" : "text-slate-700") : "text-slate-600")}>
                          Sheet #{pageNum}
                        </span>
                        {isIncluded && (
                          <span className="block text-[9px] font-semibold text-emerald-700">
                            {config?.copies && config.copies > 1 ? `× ${config.copies} Copies` : "1 Copy"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Sheet Footer Details */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-[10px]">
                    <span className="font-semibold text-slate-500">
                      {isDuplex ? "📑 Both Sides" : "📄 1 Side"}
                    </span>
                    {isIncluded ? (
                      <span className="font-extrabold text-emerald-700 flex items-center gap-0.5">
                        <CheckCircle2 className="size-3" /> Ready
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium">Excluded</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* 3. Order Summary & Payment Method Selection */}
      <Card className="overflow-hidden border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/20 to-slate-50 p-4 sm:p-7 shadow-lg rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="flex size-8 sm:size-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-xs">
              <Sparkles className="size-4 sm:size-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Final Summary &amp; Checkout
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Verified slab pricing for {shop.name}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] sm:text-xs font-bold text-emerald-800">
            {selectedMode === "counter" ? "PAY AT COUNTER" : "ONLINE PAYMENT"}
          </span>
        </div>

        {/* 3 Metric Cards */}
        <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-4 shadow-2xs">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500">
              Documents
            </span>
            <div className="mt-0.5 text-base sm:text-lg font-black text-slate-900">
              {documents.length} File{documents.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-4 shadow-2xs">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500">
              Total Pages to Print
            </span>
            <div className="mt-0.5 text-base sm:text-lg font-black text-slate-900">
              {estimate ? estimate.totalPages : fallbackTotalPages} Pages
            </div>
            {estimate ? (
              <span className="text-[10px] sm:text-[11px] text-slate-500 block truncate">
                ({estimate.blackAndWhitePages} B&amp;W, {estimate.colorPages} Color)
              </span>
            ) : null}
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-3 sm:p-4 shadow-2xs flex sm:block items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold text-emerald-900">
              Total Payable
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-800 font-mono">
              ₹{estimate ? estimate.total.toFixed(2) : fallbackPrice.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Payment Mode Selector */}
        {shopPaymentMode === "both" ? (
          <div className="mt-4 sm:mt-6">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-2">
              Select Payment Method
            </label>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSelectedMode("counter")}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border-2 p-3 sm:p-4 text-left transition-all cursor-pointer active:scale-98",
                  selectedMode === "counter"
                    ? "border-emerald-600 bg-emerald-50/90 shadow-md ring-2 ring-emerald-500/20"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                )}
              >
                <div
                  className={cn(
                    "flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl font-bold transition",
                    selectedMode === "counter"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600"
                  )}
                >
                  <Ticket className="size-4 sm:size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-slate-900">
                    Pay at Counter
                    <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-[9px] sm:text-[10px] font-bold text-emerald-800">
                      TOKEN
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 leading-snug">
                    Generate token &amp; pay cash/UPI at counter. Valid for 1 hr.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMode("online")}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border-2 p-3 sm:p-4 text-left transition-all cursor-pointer active:scale-98",
                  selectedMode === "online"
                    ? "border-emerald-600 bg-emerald-50/90 shadow-md ring-2 ring-emerald-500/20"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                )}
              >
                <div
                  className={cn(
                    "flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl font-bold transition",
                    selectedMode === "online"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600"
                  )}
                >
                  <CreditCard className="size-4 sm:size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-slate-900">
                    Pay Online
                    <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-[9px] sm:text-[10px] font-bold text-emerald-800">
                      INSTANT
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 leading-snug">
                    Pay via UPI, Cards, NetBanking for instant auto-print.
                  </p>
                </div>
              </button>
            </div>
          </div>
        ) : null}

        {/* Primary Action Button */}
        <div className="mt-5 sm:mt-6">
          {selectedMode === "counter" ? (
            <button
              type="button"
              disabled={busy}
              onClick={onProceedToCounterToken}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 px-4 sm:px-6 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-white shadow-[0_4px_0_#065f46,0_12px_24px_-2px_rgba(5,150,105,0.4)] transition-all hover:from-emerald-500 hover:to-emerald-600 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#065f46] cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? (
                <>
                  <LoaderCircle className="size-4 sm:size-5 animate-spin" />
                  <span>Generating Counter Token...</span>
                </>
              ) : (
                <>
                  <Ticket className="size-4 sm:size-5 shrink-0" />
                  <span>
                    Confirm &amp; Generate Counter Token (₹
                    {estimate ? estimate.total.toFixed(2) : fallbackPrice.toFixed(2)})
                  </span>
                  <ArrowRight className="size-4 shrink-0" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onProceedToPay}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 px-4 sm:px-6 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-white shadow-[0_4px_0_#065f46,0_12px_24px_-2px_rgba(5,150,105,0.4)] transition-all hover:from-emerald-500 hover:to-emerald-600 hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#065f46] cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? (
                <>
                  <LoaderCircle className="size-4 sm:size-5 animate-spin" />
                  <span>Preparing Secure Checkout...</span>
                </>
              ) : (
                <>
                  <CreditCard className="size-4 sm:size-5 shrink-0" />
                  <span className="truncate">
                    Proceed to Pay ₹
                    {estimate ? estimate.total.toFixed(2) : fallbackPrice.toFixed(2)} Online
                  </span>
                  <ArrowRight className="size-4 shrink-0" />
                </>
              )}
            </button>
          )}
        </div>

        <div className="mt-3.5 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 text-center">
          {selectedMode === "counter" ? (
            <>
              <Store className="size-3.5 text-emerald-600 shrink-0" />
              <span>Token generated immediately · Show at counter within 1 hr</span>
            </>
          ) : (
            <>
              <ShieldCheck className="size-3.5 text-emerald-600 shrink-0" />
              <span>256-Bit Encrypted Payment · Instant Auto-Print</span>
            </>
          )}
        </div>
      </Card>

      {/* 4. FULLSCREEN / MOBILE ZOOMED SHEET INSPECTOR MODAL */}
      {selectedPreviewPage !== null && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
          {/* Top Bar with Back button */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-3 text-white">
            <button
              type="button"
              onClick={closeFullscreenPreview}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-gradient-to-b from-slate-750 via-slate-800 to-slate-900 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-white shadow-[0_2px_0_#020617,0_3px_6px_rgba(0,0,0,0.4)] hover:from-slate-700 hover:to-slate-800 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition cursor-pointer"
            >
              <ArrowLeft className="size-3.5" />
              <span>Back</span>
            </button>

            <div className="text-center">
              <span className="block text-xs font-bold text-white truncate max-w-[180px] sm:max-w-xs">
                {current.filename}
              </span>
              <span className="text-[11px] text-slate-400">
                Page {selectedPreviewPage} of {totalPagesInDoc}
              </span>
            </div>

            <button
              type="button"
              onClick={closeFullscreenPreview}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Large Sheet Viewport */}
          <div className="relative flex flex-1 items-center justify-center p-3 sm:p-6 overflow-auto select-none">
            {(() => {
              const config = includedPagesMap.get(selectedPreviewPage);
              const isIncluded = Boolean(config);
              const isDuplex = config?.sideMode === "double_sided";
              const isColor = config?.colorMode === "color";

              return (
                <div className="relative flex flex-col items-center justify-center max-w-md sm:max-w-lg w-full">
                  {/* Sheet Status Badges */}
                  <div className="mb-2 flex items-center gap-2 text-xs">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 font-bold",
                        isIncluded
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      )}
                    >
                      {isIncluded ? "🟢 Included in Print" : "⚪ Excluded (Skipped)"}
                    </span>
                    {isIncluded && (
                      <span className="rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 px-3 py-1 font-bold">
                        {isColor ? "🎨 Full Color" : "📄 B&W Grayscale"}
                      </span>
                    )}
                    {isIncluded && (
                      <span className="rounded-full bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 font-semibold">
                        {isDuplex ? "📑 Both Sides" : "📄 Single Sided"}
                      </span>
                    )}
                  </div>

                  {/* Simulated Paper Sheet */}
                  <div
                    className={cn(
                      "relative flex aspect-[1/1.414] w-full max-h-[70vh] items-center justify-center rounded-2xl bg-white p-4 shadow-2xl overflow-hidden border-4 transition-all",
                      isIncluded ? "border-emerald-500" : "border-slate-700 opacity-60"
                    )}
                  >
                    {current?.previewUrl && totalPagesInDoc === 1 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={current.previewUrl}
                        alt="Enlarged document preview"
                        className={cn(
                          "max-h-full max-w-full object-contain rounded-md shadow-sm transition-all",
                          isIncluded && !isColor && "grayscale contrast-105 brightness-95"
                        )}
                        style={isIncluded && !isColor ? { filter: "grayscale(100%) contrast(1.1) brightness(0.96)" } : undefined}
                      />
                    ) : (
                      <div className="space-y-3 text-center p-6 text-slate-500">
                        <FileText
                          className={cn(
                            "size-16 mx-auto transition-colors",
                            isIncluded ? (isColor ? "text-purple-600" : "text-slate-800") : "text-slate-300"
                          )}
                        />
                        <div>
                          <p className="text-lg font-black text-slate-900">
                            Sheet #{selectedPreviewPage}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {current.filename}
                          </p>
                        </div>
                        {isIncluded && (
                          <div className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="size-4" /> Ready to Print
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Bottom Navigation & Controls */}
          <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/90 px-4 py-3">
            <button
              type="button"
              disabled={selectedPreviewPage <= 1}
              onClick={() => setSelectedPreviewPage((p) => (p && p > 1 ? p - 1 : p))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-30 transition cursor-pointer"
            >
              <ChevronLeft className="size-4" />
              <span>Previous Page</span>
            </button>

            <span className="text-xs font-mono font-bold text-slate-300">
              {selectedPreviewPage} / {totalPagesInDoc}
            </span>

            <button
              type="button"
              disabled={selectedPreviewPage >= totalPagesInDoc}
              onClick={() => setSelectedPreviewPage((p) => (p && p < totalPagesInDoc ? p + 1 : p))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-30 transition cursor-pointer"
            >
              <span>Next Page</span>
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* 5. WARNING DIALOG MODAL (When user clicks Edit Settings) */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shadow-inner">
              <AlertTriangle className="size-6" />
            </div>

            <div className="mt-4">
              <h3 className="text-lg font-black text-slate-900">
                Progress Not Saved
              </h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                You are about to return to the <b>Configure</b> step. Any unfinalized preview selections or order confirmation will require re-verification. Do you want to go back and edit your print settings?
              </p>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowWarningModal(false)}
                className="w-full sm:flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition active:scale-95 cursor-pointer"
              >
                Stay in Preview
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowWarningModal(false);
                  onBackToConfigure();
                }}
                className="w-full sm:flex-1 rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white shadow-md hover:bg-amber-700 transition active:scale-95 cursor-pointer"
              >
                Yes, Go Back to Configure
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
