"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

type FullscreenTarget = {
  docIndex: number;
  pageNum: number;
};

function getDocIncludedPagesMap(doc: CustomerDocument) {
  const map = new Map<number, { colorMode: string; sideMode: string; copies: number }>();
  if (doc?.ranges) {
    doc.ranges.forEach((r) => {
      const start = Number(r.startPage) || 1;
      const end = Number(r.endPage) || start;
      const copies = Number(r.copies) || 1;
      for (let p = Math.min(start, end); p <= Math.max(start, end); p++) {
        map.set(p, {
          colorMode: r.colorMode,
          sideMode: r.sideMode ?? "single_sided",
          copies,
        });
      }
    });
  }
  return map;
}

function SingleDocPreviewSection({
  doc,
  docIndex,
  isFocusedView,
  onFocusThisDoc,
  onOpenFullscreen,
}: {
  doc: CustomerDocument;
  docIndex: number;
  isFocusedView: boolean;
  onFocusThisDoc?: () => void;
  onOpenFullscreen: (docIndex: number, pageNum: number) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [activeScrolledPage, setActiveScrolledPage] = useState(1);

  const includedPagesMap = useMemo(() => getDocIncludedPagesMap(doc), [doc]);
  const totalPagesInDoc = doc ? doc.pageCount : 1;
  const pagesList = useMemo(() => Array.from({ length: totalPagesInDoc }, (_, i) => i + 1), [totalPagesInDoc]);

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);

    const cardWidth = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 10 : 150;
    const page = Math.min(totalPagesInDoc, Math.max(1, Math.round(el.scrollLeft / cardWidth) + 1));
    setActiveScrolledPage(page);
  }, [totalPagesInDoc]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, totalPagesInDoc]);

  const scrollByDirection = (direction: "left" | "right") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = Math.max(el.clientWidth * 0.75, 200);
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const totalCopies = doc.ranges.reduce((s, r) => s + (Number(r.copies) || 1), 0);

  return (
    <div
      className={cn(
        "space-y-3",
        !isFocusedView && "rounded-2xl border border-slate-200/90 bg-slate-50/50 p-3.5 sm:p-4",
      )}
    >
      {/* Document Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200 shadow-2xs text-emerald-600">
            <FileText className="size-4 sm:size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {!isFocusedView && (
                <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-extrabold text-emerald-900 border border-emerald-200/80">
                  Doc #{docIndex + 1}
                </span>
              )}
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm truncate max-w-[200px] sm:max-w-xs">
                {doc.filename}
              </h3>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500">
              {doc.pageCount} total {doc.pageCount === 1 ? "page" : "pages"} · {includedPagesMap.size} selected ·{" "}
              {(doc.sizeBytes / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="rounded-lg bg-emerald-100/80 text-emerald-800 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-extrabold border border-emerald-200/80 shadow-2xs">
            {totalCopies} {totalCopies === 1 ? "Copy" : "Copies"}
          </span>

          {!isFocusedView && onFocusThisDoc && (
            <button
              type="button"
              onClick={onFocusThisDoc}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-emerald-500 transition shadow-2xs cursor-pointer"
            >
              <Eye className="size-3 text-emerald-600" /> Only This
            </button>
          )}
        </div>
      </div>

      {/* Visual Print Sheet Layout - Horizontal Scrollable Strip */}
      <div className="mt-1">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Layers className="size-3 text-emerald-600 shrink-0" />
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider truncate">
              Sheets ({totalPagesInDoc} {totalPagesInDoc === 1 ? "page" : "pages"}):
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {totalPagesInDoc > 2 && (
              <div className="flex items-center gap-1">
                <span className="text-[9.5px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md hidden sm:inline-block">
                  Page {activeScrolledPage} of {totalPagesInDoc}
                </span>
                <button
                  type="button"
                  disabled={!canScrollLeft}
                  onClick={() => scrollByDirection("left")}
                  className="flex size-5 sm:size-6 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition shadow-2xs cursor-pointer"
                  title="Scroll left"
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="size-3" />
                </button>
                <button
                  type="button"
                  disabled={!canScrollRight}
                  onClick={() => scrollByDirection("right")}
                  className="flex size-5 sm:size-6 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition shadow-2xs cursor-pointer"
                  title="Scroll right"
                  aria-label="Scroll right"
                >
                  <ChevronRight className="size-3" />
                </button>
              </div>
            )}
            <span className="text-[9.5px] sm:text-[10px] text-slate-400 font-semibold flex items-center gap-0.5">
              <ZoomIn className="size-2.5 text-emerald-600" /> Tap zoom
            </span>
          </div>
        </div>

        {/* Scroll Container */}
        <div className="relative group/carousel">
          {canScrollLeft && (
            <div className="pointer-events-none absolute left-0 top-0 bottom-2 z-10 w-6 bg-gradient-to-r from-white via-white/80 to-transparent rounded-l-2xl" />
          )}

          <div
            ref={scrollContainerRef}
            className="flex gap-2 sm:gap-2.5 overflow-x-auto pb-2 pt-0.5 px-0.5 snap-x snap-mandatory scroll-smooth no-scrollbar touch-pan-x"
          >
            {pagesList.map((pageNum) => {
              const config = includedPagesMap.get(pageNum);
              const isIncluded = Boolean(config);
              const isColor = config?.colorMode === "color";
              const isDuplex = config?.sideMode === "double_sided";

              return (
                <div
                  key={`doc-${docIndex}-page-${pageNum}`}
                  onClick={() => onOpenFullscreen(docIndex, pageNum)}
                  className={cn(
                    "group relative flex flex-col justify-between rounded-xl border-2 p-2 sm:p-2.5 transition-all duration-150 cursor-pointer active:scale-97 hover:shadow-md hover:-translate-y-0.5 shrink-0 snap-start select-none",
                    totalPagesInDoc === 1
                      ? "w-[155px] sm:w-[175px]"
                      : "w-[calc(50%-5px)] min-w-[125px] max-w-[155px] sm:w-[145px]",
                    isIncluded
                      ? "border-emerald-500 bg-white shadow-xs ring-1 ring-emerald-500/20"
                      : "border-slate-200 bg-slate-50/80 opacity-60",
                  )}
                >
                  {/* Sheet Header Badge */}
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[9px] font-black shrink-0",
                        isIncluded
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                          : "bg-slate-200 text-slate-600",
                      )}
                    >
                      P. {pageNum}
                    </span>

                    {isIncluded ? (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[8.5px] font-bold truncate",
                          isColor
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200/80"
                            : "bg-slate-100 text-slate-700 border border-slate-200/60",
                        )}
                      >
                        {isColor ? "🎨 Color" : "📄 B&W"}
                      </span>
                    ) : (
                      <span className="text-[8.5px] font-bold text-slate-400">Skipped</span>
                    )}
                  </div>

                  {/* Simulated Paper Graphic / Image Preview */}
                  <div
                    className={cn(
                      "my-1.5 flex aspect-[1/1.25] w-full items-center justify-center rounded-lg bg-white border shadow-inner p-1 text-center overflow-hidden transition-all group-hover:border-emerald-500",
                      isIncluded && !isColor ? "border-slate-300 bg-slate-50" : "border-slate-200/90",
                    )}
                  >
                    {doc?.previewUrl && (totalPagesInDoc === 1 || doc.isImage) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={doc.previewUrl}
                        alt={`Preview for ${doc.filename} page ${pageNum}`}
                        loading="lazy"
                        className={cn(
                          "max-h-full max-w-full object-contain rounded-xs transition-all",
                          isIncluded && !isColor && "grayscale contrast-105 brightness-95",
                        )}
                        style={
                          isIncluded && !isColor
                            ? { filter: "grayscale(100%) contrast(1.1) brightness(0.96)" }
                            : undefined
                        }
                      />
                    ) : (
                      <div className="space-y-0.5 text-slate-400">
                        <FileText
                          className={cn(
                            "size-5 sm:size-6 mx-auto transition-colors",
                            isIncluded ? (isColor ? "text-emerald-600" : "text-slate-600") : "text-slate-300",
                          )}
                        />
                        <span
                          className={cn(
                            "block text-[9px] font-bold",
                            isIncluded ? (isColor ? "text-emerald-900" : "text-slate-700") : "text-slate-600",
                          )}
                        >
                          Sheet #{pageNum}
                        </span>
                        {isIncluded && (
                          <span className="block text-[8px] font-semibold text-emerald-700">
                            {config?.copies && config.copies > 1 ? `× ${config.copies} Copies` : "1 Copy"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Sheet Footer Details */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-1 text-[8.5px] sm:text-[9px]">
                    <span className="font-semibold text-slate-500 truncate">
                      {isDuplex ? "📑 2-Side" : "📄 1-Side"}
                    </span>
                    {isIncluded ? (
                      <span className="font-extrabold text-emerald-700 flex items-center gap-0.5 shrink-0">
                        <CheckCircle2 className="size-2.5" /> Ready
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium">Excluded</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {canScrollRight && (
            <div className="pointer-events-none absolute right-0 top-0 bottom-2 z-10 w-6 bg-gradient-to-l from-white via-white/80 to-transparent rounded-r-2xl" />
          )}
        </div>
      </div>
    </div>
  );
}

function AllDocsGridPreviewSection({
  documents,
  onFocusThisDoc,
}: {
  documents: CustomerDocument[];
  onFocusThisDoc: (docIndex: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
      {documents.map((doc, idx) => {
        const includedPagesMap = getDocIncludedPagesMap(doc);
        const isColor = doc.ranges[0]?.colorMode === "color";
        const totalCopies = doc.ranges.reduce((s, r) => s + (Number(r.copies) || 1), 0);

        return (
          <div
            key={doc.id}
            onClick={() => onFocusThisDoc(idx)}
            className="group relative flex flex-col justify-between rounded-xl border-2 border-slate-200 bg-white p-2 sm:p-2.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md cursor-pointer active:scale-97 select-none overflow-hidden"
          >
            {/* Header Badge */}
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-black text-slate-600 truncate max-w-[80%] border border-slate-200">
                Doc #{idx + 1}
              </span>
              <span className="text-[9px] font-bold text-slate-500 shrink-0">
                {doc.pageCount}p
              </span>
            </div>

            {/* Thumbnail */}
            <div
              className={cn(
                "relative flex aspect-[1/1.25] w-full items-center justify-center rounded-lg bg-slate-50 border border-slate-200/90 p-1 overflow-hidden mb-2 shadow-inner group-hover:border-emerald-400 transition-colors",
                !isColor && "bg-slate-100"
              )}
            >
              {doc.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={doc.previewUrl}
                  alt={`Preview for ${doc.filename}`}
                  loading="lazy"
                  className={cn(
                    "max-h-full max-w-full object-contain rounded-xs transition-all",
                    !isColor && "grayscale contrast-105 brightness-95"
                  )}
                  style={!isColor ? { filter: "grayscale(100%) contrast(1.1) brightness(0.96)" } : undefined}
                />
              ) : (
                <FileText className="size-8 text-slate-300 group-hover:text-emerald-500 transition-colors" />
              )}
            </div>

            {/* Details */}
            <div className="flex flex-col gap-1 text-[9px] text-center">
              <span className="font-bold text-slate-700 truncate">{doc.filename}</span>
              <div className="flex flex-wrap items-center justify-center gap-1">
                <span className={cn("rounded px-1.5 py-0.5 font-bold", isColor ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                  {isColor ? "Color" : "B&W"}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">
                  {totalCopies}x
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  // "all" when no document is specifically selected, or doc index number when clicked
  const [selectedDocView, setSelectedDocView] = useState<"all" | number>(() => (documents.length > 1 ? "all" : 0));
  const [fullscreenTarget, setFullscreenTarget] = useState<FullscreenTarget | null>(null);

  const shopPaymentMode = shop.payment_mode || "both";

  const totalDocPages = useMemo(() => {
    return documents.reduce((sum, doc) => sum + (doc.pageCount || 1), 0);
  }, [documents]);

  const fallbackTotalPages = useMemo(() => {
    return documents.reduce((sum, doc) => {
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
  }, [documents]);

  const fallbackPrice = fallbackTotalPages * 5;

  const closeFullscreenPreview = useCallback(() => {
    setFullscreenTarget(null);
  }, []);

  const openFullscreenPreview = useCallback((docIndex: number, pageNum: number) => {
    setFullscreenTarget({ docIndex, pageNum });
    if (typeof window !== "undefined") {
      window.history.pushState({ previewModal: true }, "");
    }
  }, []);

  // Keyboard navigation & back-button interception for fullscreen modal
  useEffect(() => {
    if (!fullscreenTarget) return;

    const currentDoc = documents[fullscreenTarget.docIndex];
    const totalPages = currentDoc ? currentDoc.pageCount : 1;

    const handlePopState = () => {
      closeFullscreenPreview();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeFullscreenPreview();
      } else if (e.key === "ArrowLeft") {
        setFullscreenTarget((prev) => (prev && prev.pageNum > 1 ? { ...prev, pageNum: prev.pageNum - 1 } : prev));
      } else if (e.key === "ArrowRight") {
        setFullscreenTarget((prev) =>
          prev && prev.pageNum < totalPages ? { ...prev, pageNum: prev.pageNum + 1 } : prev,
        );
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreenTarget, documents, closeFullscreenPreview]);

  // Keep selectedDocView valid if documents change
  useEffect(() => {
    if (typeof selectedDocView === "number" && selectedDocView >= documents.length) {
      setSelectedDocView(documents.length > 1 ? "all" : 0);
    }
  }, [documents.length, selectedDocView]);

  const activeDocObj = typeof selectedDocView === "number" ? documents[selectedDocView] || documents[0] : null;

  return (
    <div className="space-y-6 pb-20 sm:pb-0">
      {/* 1. Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs">
              <Eye className="size-4" />
            </span>
            <h2 className="text-lg sm:text-xl font-black text-slate-900">Print Job Preview &amp; Review</h2>
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
        {/* Document Selector Tabs (When multiple documents are present) */}
        {documents.length > 1 && (
          <div className="mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Filter Preview:</span>
              <span className="text-[11px] text-slate-400">
                {selectedDocView === "all" ? `Showing all ${documents.length} files` : `Showing 1 file`}
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {/* Option to show All Documents */}
              <button
                type="button"
                onClick={() => setSelectedDocView("all")}
                className={cn(
                  "flex items-center gap-1.5 shrink-0 rounded-xl border px-3 py-2 text-left text-xs transition-all cursor-pointer select-none",
                  selectedDocView === "all"
                    ? "border-emerald-600 bg-emerald-50 font-bold text-emerald-950 shadow-xs ring-1 ring-emerald-500/20"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                <Layers className="size-3.5 text-emerald-600 shrink-0" />
                <span>All Documents</span>
                <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 border border-slate-200/60">
                  {documents.length} files · {totalDocPages}p
                </span>
              </button>

              {/* Individual Document Tabs */}
              {documents.map((doc, idx) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => {
                    setSelectedDocView(idx);
                    setActiveDocument(idx);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 shrink-0 rounded-xl border px-3 py-2 text-left text-xs transition-all cursor-pointer select-none",
                    selectedDocView === idx
                      ? "border-emerald-600 bg-emerald-50 font-bold text-emerald-950 shadow-xs ring-1 ring-emerald-500/20"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <FileText className="size-3.5 text-emerald-600 shrink-0" />
                  <span className="max-w-32 truncate">{doc.filename}</span>
                  <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 border border-slate-200/60">
                    {doc.pageCount}p
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content: All Documents Preview OR Specific Document Preview */}
        {selectedDocView === "all" ? (
          <AllDocsGridPreviewSection
            documents={documents}
            onFocusThisDoc={(idx) => {
              setSelectedDocView(idx);
              setActiveDocument(idx);
            }}
          />
        ) : activeDocObj ? (
          <div>
            <SingleDocPreviewSection
              doc={activeDocObj}
              docIndex={typeof selectedDocView === "number" ? selectedDocView : 0}
              isFocusedView={true}
              onOpenFullscreen={openFullscreenPreview}
            />
          </div>
        ) : null}
      </Card>

      {/* 3. Order Summary & Payment Method Selection */}
      <Card className="overflow-hidden border-emerald-200/80 bg-white p-4 sm:p-7 shadow-lg rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="flex size-8 sm:size-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <Sparkles className="size-4 sm:size-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Final Summary &amp; Checkout</h3>
              <p className="text-[11px] sm:text-xs text-slate-500">Verified slab pricing for {shop.name}</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] sm:text-xs font-bold text-emerald-800">
            {selectedMode === "counter" ? "PAY AT COUNTER" : "ONLINE PAYMENT"}
          </span>
        </div>

        {/* 3 Metric Cards */}
        <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-4 shadow-2xs">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500">Documents</span>
            <div className="mt-0.5 text-base sm:text-lg font-black text-slate-900">
              {documents.length} File{documents.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-4 shadow-2xs">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-500">Total Pages to Print</span>
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
            <span className="text-[11px] sm:text-xs font-bold text-emerald-900">Total Payable</span>
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
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80",
                )}
              >
                <div
                  className={cn(
                    "flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl font-bold transition",
                    selectedMode === "counter" ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-100 text-slate-600",
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
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80",
                )}
              >
                <div
                  className={cn(
                    "flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl font-bold transition",
                    selectedMode === "online" ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-100 text-slate-600",
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
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 sm:px-6 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-white shadow-[0_4px_0_#047857,0_12px_24px_-2px_rgba(5,150,105,0.4)] transition-all hover:bg-emerald-700 active:bg-emerald-800 active:translate-y-1 active:shadow-[0_1px_0_#047857] cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
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
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 sm:px-6 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-white shadow-[0_4px_0_#047857,0_12px_24px_-2px_rgba(5,150,105,0.4)] transition-all hover:bg-emerald-700 active:bg-emerald-800 active:translate-y-1 active:shadow-[0_1px_0_#047857] cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
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
                    Proceed to Pay ₹{estimate ? estimate.total.toFixed(2) : fallbackPrice.toFixed(2)} Online
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
      {fullscreenTarget !== null &&
        (() => {
          const targetDoc = documents[fullscreenTarget.docIndex] || documents[0];
          const targetIncludedMap = getDocIncludedPagesMap(targetDoc);
          const targetTotalPages = targetDoc ? targetDoc.pageCount : 1;
          const config = targetIncludedMap.get(fullscreenTarget.pageNum);
          const isIncluded = Boolean(config);
          const isColor = config?.colorMode === "color";
          const isDuplex = config?.sideMode === "double_sided";

          return (
            <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
              {/* Top Bar with Back button */}
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-xs">
                <button
                  type="button"
                  onClick={closeFullscreenPreview}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Back</span>
                </button>

                <div className="text-center min-w-0 px-2">
                  <span className="block text-xs font-bold text-slate-900 truncate max-w-[180px] sm:max-w-xs">
                    {targetDoc.filename}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Page {fullscreenTarget.pageNum} of {targetTotalPages}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={closeFullscreenPreview}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* Large Sheet Viewport */}
              <div className="relative flex flex-1 items-center justify-center p-3 sm:p-6 overflow-auto select-none bg-slate-100/90">
                <div className="relative flex flex-col items-center justify-center max-w-md sm:max-w-lg w-full">
                  {/* Sheet Status Badges */}
                  <div className="mb-2.5 flex flex-wrap items-center justify-center gap-2 text-xs">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 font-bold",
                        isIncluded
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300/90 shadow-2xs"
                          : "bg-white text-slate-500 border border-slate-200",
                      )}
                    >
                      {isIncluded ? "🟢 Included in Print" : "⚪ Excluded (Skipped)"}
                    </span>
                    {isIncluded && (
                      <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/90 px-3 py-1 font-bold shadow-2xs">
                        {isColor ? "🎨 Full Color" : "📄 B&W Grayscale"}
                      </span>
                    )}
                    {isIncluded && (
                      <span className="rounded-full bg-white text-slate-700 border border-slate-200 px-3 py-1 font-semibold shadow-2xs">
                        {isDuplex ? "📑 Double Sided" : "📄 Single Sided"}
                      </span>
                    )}
                  </div>

                  {/* Simulated Paper Sheet */}
                  <div
                    className={cn(
                      "relative flex aspect-[1/1.414] w-full max-h-[70vh] items-center justify-center rounded-2xl bg-white p-4 shadow-2xl overflow-hidden border-2 transition-all",
                      isIncluded ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-slate-300 opacity-60",
                    )}
                  >
                    {targetDoc?.previewUrl && (targetTotalPages === 1 || targetDoc.isImage) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={targetDoc.previewUrl}
                        alt="Enlarged document preview"
                        loading="lazy"
                        className={cn(
                          "max-h-full max-w-full object-contain rounded-md shadow-sm transition-all",
                          isIncluded && !isColor && "grayscale contrast-105 brightness-95",
                        )}
                        style={
                          isIncluded && !isColor
                            ? { filter: "grayscale(100%) contrast(1.1) brightness(0.96)" }
                            : undefined
                        }
                      />
                    ) : (
                      <div className="space-y-3 text-center p-6 text-slate-500">
                        <FileText
                          className={cn(
                            "size-16 mx-auto transition-colors",
                            isIncluded ? (isColor ? "text-emerald-600" : "text-slate-800") : "text-slate-300",
                          )}
                        />
                        <div>
                          <p className="text-lg font-black text-slate-900">Sheet #{fullscreenTarget.pageNum}</p>
                          <p className="text-xs text-slate-500 mt-1">{targetDoc.filename}</p>
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
              </div>

              {/* Bottom Navigation & Controls */}
              <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 text-slate-700 shadow-xs">
                <button
                  type="button"
                  disabled={fullscreenTarget.pageNum <= 1}
                  onClick={() =>
                    setFullscreenTarget((p) => (p && p.pageNum > 1 ? { ...p, pageNum: p.pageNum - 1 } : p))
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-30 shadow-2xs transition cursor-pointer"
                >
                  <ChevronLeft className="size-4" />
                  <span>Previous Page</span>
                </button>

                <span className="text-xs font-mono font-bold text-slate-800">
                  {fullscreenTarget.pageNum} / {targetTotalPages}
                </span>

                <button
                  type="button"
                  disabled={fullscreenTarget.pageNum >= targetTotalPages}
                  onClick={() =>
                    setFullscreenTarget((p) =>
                      p && p.pageNum < targetTotalPages ? { ...p, pageNum: p.pageNum + 1 } : p,
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-30 shadow-2xs transition cursor-pointer"
                >
                  <span>Next Page</span>
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          );
        })()}

      {/* 5. WARNING DIALOG MODAL (When user clicks Edit Settings) */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shadow-inner">
              <AlertTriangle className="size-6" />
            </div>

            <div className="mt-4">
              <h3 className="text-lg font-black text-slate-900">Progress Not Saved</h3>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                You are about to return to the <b>Configure</b> step. Any unfinalized preview selections or order
                confirmation will require re-verification. Do you want to go back and edit your print settings?
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

      {/* 6. MOBILE STICKY BOTTOM ACTION / CONTINUE BAR */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-3.5 py-2.5 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between gap-2.5 max-w-lg mx-auto">
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block leading-none">
              Total ({estimate ? estimate.totalPages : fallbackTotalPages}{" "}
              {(estimate ? estimate.totalPages : fallbackTotalPages) === 1 ? "pg" : "pgs"})
            </span>
            <span className="text-lg font-black text-emerald-800 font-mono leading-tight">
              ₹{estimate ? estimate.total.toFixed(2) : fallbackPrice.toFixed(2)}
            </span>
          </div>

          {selectedMode === "counter" ? (
            <button
              type="button"
              disabled={busy}
              onClick={onProceedToCounterToken}
              className="flex-1 max-w-[210px] flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 px-3 text-xs font-bold text-white shadow-md active:scale-95 disabled:opacity-50 cursor-pointer hover:bg-emerald-700"
            >
              {busy ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Ticket className="size-3.5 shrink-0" />
                  <span className="truncate">Generate Token</span>
                  <ArrowRight className="size-3.5 shrink-0" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onProceedToPay}
              className="flex-1 max-w-[210px] flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 px-3 text-xs font-bold text-white shadow-md active:scale-95 disabled:opacity-50 cursor-pointer hover:bg-emerald-700"
            >
              {busy ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CreditCard className="size-3.5 shrink-0" />
                  <span className="truncate">
                    Pay ₹{estimate ? estimate.total.toFixed(2) : fallbackPrice.toFixed(2)}
                  </span>
                  <ArrowRight className="size-3.5 shrink-0" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
