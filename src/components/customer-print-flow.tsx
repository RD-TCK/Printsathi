"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  CheckCircle2,
  CreditCard,
  FileUp,
  FileText,
  LoaderCircle,
  Plus,
  Printer,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Sparkles,
  ArrowRight,
  Camera,
  Ticket,
  Clock3,
  Store,
  Banknote,
} from "lucide-react";
import type { PublicShop } from "@/lib/shops/public-lookup";
import { countModes, type PrintRange, validateRanges } from "@/lib/customer-print";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type CustomerDocument = { id: string; filename: string; pageCount: number; sizeBytes: number; ranges: PrintRange[] };
type Props = { shop: PublicShop; identifier: string };
type TokenDetails = {
  tokenNumber: number;
  publicOrderId: string;
  totalAmount: number;
  totalPages: number;
  colorPages: number;
  blackAndWhitePages: number;
  expiresAt: string;
};
type Estimate = {
  total: number;
  subtotal?: number;
  platformFee?: number;
  currency: string;
  totalPages: number;
  colorPages: number;
  blackAndWhitePages: number;
};

const steps = ["1. Upload Document", "2. Configure & Pay"];

async function safeFetchJson<T = unknown>(
  response: Response,
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  try {
    const text = await response.text();
    if (!text || text.trim().length === 0) {
      return {
        ok: response.ok,
        status: response.status,
        error: response.ok ? undefined : `Server returned an empty response (HTTP ${response.status}). Please try again.`,
      };
    }
    try {
      const data = JSON.parse(text);
      let errorMsg = data?.error || data?.message;
      if (typeof errorMsg === "string" && errorMsg.includes("Unexpected end of JSON input")) {
        errorMsg = "Server response error. Please try again.";
      }
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          data,
          error: errorMsg || `Server error (HTTP ${response.status}). Please try again.`,
        };
      }
      return { ok: true, status: response.status, data };
    } catch {
      return {
        ok: false,
        status: response.status,
        error: `Server response error (HTTP ${response.status}). Please try uploading again.`,
      };
    }
  } catch {
    return {
      ok: false,
      status: response.status,
      error: `Network error (HTTP ${response.status}). Please try again.`,
    };
  }
}

export function CustomerPrintFlow({ shop: initialShop, identifier }: Props) {
  const [shop, setShop] = useState(initialShop);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(`/api/public/shops/${encodeURIComponent(identifier)}/status`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Status unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) setShop(data.shop);
      } catch {
        if (!controller.signal.aborted) setShop(previous => ({ ...previous, printer_status: "offline", bw_printer_status: "offline", color_printer_status: "offline", online_printers: [] }));
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [identifier]);
  const [step, setStep] = useState(0); // 0 = Upload, 1 = Configure & Pay, 2 = Payment Verified
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenDetails, setTokenDetails] = useState<TokenDetails | null>(null);

  const current = documents[activeDocument];
  const allValid =
    documents.length > 0 && documents.every((document) => !validateRanges(document.ranges, document.pageCount));

  const fetchEstimate = useCallback(
    async (docs: CustomerDocument[], currentOrderId: string, currentToken: string) => {
      try {
        const response = await fetch("/api/customer/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopIdentifier: identifier,
            accessToken: currentToken,
            configurations: docs.map(({ id, ranges }) => ({ orderId: currentOrderId, documentId: id, ranges })),
          }),
        });
        const result = await safeFetchJson<Estimate>(response);
        if (result.ok && result.data) {
          setEstimate(result.data);
        }
      } catch {
        // Fallback live estimate calculation
      }
    },
    [identifier],
  );

  // Auto calculate estimate whenever document configuration changes in Step 1
  useEffect(() => {
    if (step === 1 && orderId && accessToken && allValid && documents.length > 0) {
      const timer = setTimeout(() => {
        fetchEstimate(documents, orderId, accessToken);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [step, orderId, accessToken, documents, allValid, fetchEstimate]);

  if (!shop.is_active || !shop.accepting_orders) {
    return (
      <Alert
        tone={shop.status === "inactive" ? "error" : "warning"}
        title={shop.status === "inactive" ? "Shop unavailable" : "Orders are paused"}
      >
        This shop is not accepting new print orders right now.
      </Alert>
    );
  }

  async function uploadFiles(files: File[], isAppending = false) {
    setError(null);
    if (!files.length) {
      setError("Choose at least one document or image.");
      return;
    }
    const currentCount = isAppending ? documents.length : 0;
    if (currentCount + files.length > 10) {
      setError(`You can add up to 10 documents per order (${currentCount} already added).`);
      return;
    }
    const allowedExtensions = new Set([
      ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff",
      ".doc", ".docx", ".odt", ".rtf", ".ppt", ".pptx", ".odp", ".xls", ".xlsx", ".ods", ".txt", ".csv", ".md"
    ]);

    for (const f of files) {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      if (!allowedExtensions.has(ext)) {
        setError(`"${f.name}" has an unsupported format. Please upload PDF, images, or Office documents.`);
        return;
      }
      if (f.size > 25 * 1024 * 1024) {
        setError(`"${f.name}" exceeds the 25 MB limit. Please choose a smaller file.`);
        return;
      }
      if (f.size === 0) {
        setError(`"${f.name}" is empty (0 bytes).`);
        return;
      }
    }

    setBusy(true);
    try {
      setUploadStatus(files.length > 1 ? `Uploading ${files.length} documents...` : "Uploading document...");
      const form = new FormData();
      form.append("shopIdentifier", identifier);
      if (isAppending && orderId && accessToken) {
        form.append("orderId", orderId);
        form.append("accessToken", accessToken);
      }
      files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/customer/upload", { method: "POST", body: form });
      const uploadRes = await safeFetchJson<{
        orderId: string;
        orderPublicId: string;
        accessToken: string;
        documents: CustomerDocument[];
      }>(response);

      if (!uploadRes.ok || !uploadRes.data) {
        throw new Error(uploadRes.error || "Upload failed. Please try uploading again.");
      }
      const result = uploadRes.data;

      const newDocs: CustomerDocument[] = result.documents.map((document: CustomerDocument) => ({
        ...document,
        filename: document.filename,
        pageCount: document.pageCount,
        ranges: [{ startPage: 1, endPage: document.pageCount, colorMode: "black_and_white", paperSize: "a4" }],
      }));

      const mergedDocs = isAppending ? [...documents, ...newDocs] : newDocs;

      setDocuments(mergedDocs);
      setOrderId(result.orderId);
      setAccessToken(result.accessToken);
      if (isAppending) {
        setActiveDocument(documents.length); // Switch focus to the newly added document
      }

      // Automatically fetch initial estimate and move directly to Configure & Pay step
      await fetchEstimate(mergedDocs, result.orderId, result.accessToken);
      setStep(1);
    } catch (uploadError) {
      let msg = uploadError instanceof Error ? uploadError.message : "Could not process or upload the files.";
      if (msg.includes("Unexpected end of JSON input")) {
        msg = "Server communication error. Please try uploading your files again.";
      }
      setError(msg);
    } finally {
      setBusy(false);
      setUploadStatus(null);
    }
  }

  function updateDocument(update: (document: CustomerDocument) => CustomerDocument) {
    setDocuments((items) => items.map((document, index) => (index === activeDocument ? update(document) : document)));
  }

  function updateRange(index: number, field: keyof PrintRange, value: string) {
    updateDocument((document) => ({
      ...document,
      ranges: document.ranges.map((range, rangeIndex) =>
        rangeIndex === index
          ? { ...range, [field]: field === "startPage" || field === "endPage" ? Number(value) : value }
          : range,
      ),
    }));
  }

  function addRange() {
    if (!current) return;
    const lastRange = current.ranges[current.ranges.length - 1];
    const defaultMode = lastRange?.colorMode ?? "black_and_white";
    const defaultSize = lastRange?.paperSize ?? "a4";
    updateDocument((document) => ({
      ...document,
      ranges: [
        ...document.ranges,
        { startPage: 1, endPage: document.pageCount, colorMode: defaultMode, paperSize: defaultSize },
      ],
    }));
    setError(null);
  }

  function removeRange(index: number) {
    updateDocument((document) => ({
      ...document,
      ranges: document.ranges.filter((_, rangeIndex) => rangeIndex !== index),
    }));
  }

  function removeDocument(index: number) {
    if (documents.length <= 1) {
      setError("An order needs at least one document. Upload another PDF first.");
      return;
    }
    const nextDocuments = documents.filter((_, documentIndex) => documentIndex !== index);
    setDocuments(nextDocuments);
    setActiveDocument(Math.min(activeDocument, nextDocuments.length - 1));
    setEstimate(null);
    setError(null);
  }

  function resetOrder() {
    setStep(0);
    setDocuments([]);
    setActiveDocument(0);
    setOrderId(null);
    setAccessToken(null);
    setEstimate(null);
    setTokenDetails(null);
    setError(null);
  }

  async function handleProceedToCounterToken() {
    if (!orderId || !accessToken || !allValid) return;
    setBusy(true);
    setError(null);
    try {
      // 1. Refresh estimate
      const response = await fetch("/api/customer/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopIdentifier: identifier,
          accessToken,
          configurations: documents.map(({ id, ranges }) => ({ orderId, documentId: id, ranges })),
        }),
      });
      const estimateRes = await safeFetchJson<Estimate>(response);
      if (!estimateRes.ok || !estimateRes.data) {
        throw new Error(estimateRes.error || "Could not calculate updated estimate.");
      }
      const result = estimateRes.data;
      setEstimate(result);

      // 2. Submit counter order
      const counterRes = await fetch("/api/customer/counter-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopIdentifier: identifier,
          accessToken,
          configurations: documents.map(({ id, ranges }) => ({ orderId, documentId: id, ranges })),
        }),
      });
      const counterData = await safeFetchJson<TokenDetails>(counterRes);
      if (!counterData.ok || !counterData.data) {
        throw new Error(counterData.error || "Could not generate counter token.");
      }

      setTokenDetails(counterData.data);
      setStep(3);
    } catch (err) {
      let msg = err instanceof Error ? err.message : "Could not submit counter order.";
      if (msg.includes("Unexpected end of JSON input")) {
        msg = "Server communication error. Please try again.";
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleProceedToPay() {
    if (!orderId || !accessToken || !allValid) return;
    setBusy(true);
    setError(null);
    try {
      // 1. Refresh estimate
      const response = await fetch("/api/customer/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopIdentifier: identifier,
          accessToken,
          configurations: documents.map(({ id, ranges }) => ({ orderId, documentId: id, ranges })),
        }),
      });
      const estimateRes = await safeFetchJson<Estimate>(response);
      if (!estimateRes.ok || !estimateRes.data) {
        throw new Error(estimateRes.error || "Could not calculate updated estimate.");
      }
      const result = estimateRes.data;
      setEstimate(result);

      // 2. Save configuration
      const configRes = await fetch("/api/customer/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopIdentifier: identifier,
          accessToken,
          configurations: documents.map(({ id, ranges }) => ({ orderId, documentId: id, ranges })),
          total: result.total,
          totalPages: result.totalPages,
          colorPages: result.colorPages,
          blackAndWhitePages: result.blackAndWhitePages,
        }),
      });
      const configData = await safeFetchJson<{ orderId: string; status: string }>(configRes);
      if (!configData.ok || !configData.data) {
        throw new Error(configData.error || "Could not save order configuration.");
      }

      // Proceed to payment execution
      setStep(2);
    } catch (err) {
      let msg = err instanceof Error ? err.message : "Could not prepare configuration for payment.";
      if (msg.includes("Unexpected end of JSON input")) {
        msg = "Server communication error. Please try again.";
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Streamlined Progress Indicator */}
      <StepIndicator step={step} />

      {error ? <Alert tone="error">{error}</Alert> : null}

      {step === 0 ? <UploadStep busy={busy} uploadStatus={uploadStatus} onSubmit={(files) => uploadFiles(files, false)} shop={shop} /> : null}

      {step === 1 && current ? (
        <ConfigureAndPayStep
          shop={shop}
          documents={documents}
          current={current}
          activeDocument={activeDocument}
          setActiveDocument={setActiveDocument}
          updateRange={updateRange}
          addRange={addRange}
          removeRange={removeRange}
          removeDocument={removeDocument}
          allValid={allValid}
          busy={busy}
          estimate={estimate}
          onProceedToPay={handleProceedToPay}
          onProceedToCounterToken={handleProceedToCounterToken}
          onAddMoreFiles={(files) => uploadFiles(files, true)}
        />
      ) : null}

      {step === 2 && orderId && estimate ? (
        <PaymentStep
          orderId={orderId}
          accessToken={accessToken}
          shop={shop}
          identifier={identifier}
          estimate={estimate}
          documents={documents}
          onReset={resetOrder}
        />
      ) : null}

      {step === 3 && tokenDetails && orderId ? (
        <CounterTokenStep
          tokenDetails={tokenDetails}
          shop={shop}
          orderId={orderId}
          accessToken={accessToken}
          documents={documents}
          onReset={resetOrder}
        />
      ) : null}
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  const displayStep = step === 2 || step === 3 ? 1 : step;
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xs">
      {steps.map((label, index) => {
        const isCurrent = displayStep === index;
        const isCompleted = displayStep > index;
        return (
          <div
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-center text-xs font-bold transition-all",
              isCurrent
                ? "bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-900/15"
                : isCompleted
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200/70"
                : "bg-slate-50 text-slate-400 border border-slate-200/60"
            )}
            key={label}
          >
            {isCompleted ? (
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
            ) : (
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black",
                  isCurrent ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                )}
              >
                {index + 1}
              </span>
            )}
            <span className="truncate">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function UploadStep({
  shop,
  busy,
  uploadStatus,
  onSubmit,
}: {
  shop: PublicShop;
  busy: boolean;
  uploadStatus: string | null;
  onSubmit: (files: File[]) => void;
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleAddFiles = (newFiles: File[]) => {
    if (!newFiles.length) return;
    setSelectedFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      return [...current, ...newFiles.filter((file) => !existing.has(`${file.name}:${file.size}:${file.lastModified}`))].slice(0, 10);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      handleAddFiles(files);
    }
  };

  return (
    <Card className="overflow-hidden border-slate-200/80 bg-white p-5 sm:p-7 shadow-md rounded-3xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (selectedFiles.length > 0) {
            onSubmit(selectedFiles);
          } else {
            fileInputRef.current?.click();
          }
        }}
      >
        {/* Hidden File Inputs */}
        <input
          ref={fileInputRef}
          className="sr-only"
          name="files"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.tif,.tiff,.doc,.docx,.odt,.rtf,.ppt,.pptx,.odp,.xls,.xlsx,.ods,.txt,.csv,.md"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            handleAddFiles(files);
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            handleAddFiles(files);
            e.currentTarget.value = "";
          }}
        />

        {/* Drag & Drop Upload Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            if (selectedFiles.length === 0) {
              fileInputRef.current?.click();
            }
          }}
          className={cn(
            "group relative flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all duration-200",
            isDragging
              ? "border-emerald-500 bg-emerald-50/80 ring-4 ring-emerald-500/20 scale-[1.01]"
              : selectedFiles.length > 0
              ? "border-slate-300 bg-slate-50/50 hover:border-emerald-500 hover:bg-emerald-50/30"
              : "border-emerald-400/80 bg-gradient-to-b from-emerald-50/60 via-teal-50/30 to-white hover:border-emerald-600 hover:bg-emerald-50/80"
          )}
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-900/20 transition-transform group-hover:scale-105">
            <FileUp className="size-7" />
          </div>

          <p className="mt-3 text-base font-bold text-slate-900 sm:text-lg">
            {isDragging
              ? "Drop documents here to upload!"
              : selectedFiles.length > 0
              ? "Add more files or proceed below"
              : "Tap to Choose Document / Photo"}
          </p>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            Drag and drop files here, or tap the buttons below. Supports PDF, Photos (JPG/PNG), Word, Docs up to 25MB.
          </p>

          {/* Direct Action Buttons Inside Zone */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-800 shadow-xs transition hover:bg-slate-50 hover:border-emerald-500 hover:text-emerald-700 active:scale-95"
            >
              <FileUp className="size-3.5 text-emerald-600" />
              Browse Files
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-800 shadow-xs transition hover:bg-slate-50 hover:border-emerald-500 hover:text-emerald-700 active:scale-95"
            >
              <Camera className="size-3.5 text-emerald-600" />
              Take Photo / Scan
            </button>
          </div>
        </div>

        {/* Selected Files List */}
        {selectedFiles.length > 0 ? (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} selected
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800"
              >
                <Plus className="size-3.5" /> Add more
              </button>
            </div>

            <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {selectedFiles.map((file, idx) => {
                const ext = file.name.slice(file.name.lastIndexOf(".")).toUpperCase();
                const isPdf = ext === ".PDF";
                const isImg = [".PNG", ".JPG", ".JPEG", ".WEBP"].includes(ext);

                return (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-xs transition hover:bg-white hover:border-slate-300"
                  >
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase shrink-0",
                          isPdf
                            ? "bg-rose-100 text-rose-700"
                            : isImg
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        )}
                      >
                        {ext.replace(".", "") || "DOC"}
                      </span>
                      <span className="truncate font-semibold text-slate-800">{file.name}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        ({(file.size / 1024 / 1024).toFixed(1)} MB)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedFiles((files) => files.filter((_, i) => i !== idx))}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                      aria-label="Remove file"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* PRIMARY CONTINUE BUTTON: Tactile, Prominent, Never Dead */}
        <div className="mt-5">
          {selectedFiles.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 px-6 py-4 text-base font-bold text-white shadow-[0_4px_0_#065f46,0_10px_20px_-2px_rgba(5,150,105,0.35)] transition-all hover:from-emerald-500 hover:to-emerald-600 hover:shadow-[0_5px_0_#065f46,0_14px_24px_-2px_rgba(5,150,105,0.45)] hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#065f46] cursor-pointer"
            >
              <FileUp className="size-5" />
              <span>Select Document to Continue</span>
              <ArrowRight className="size-4 opacity-80" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-700 px-6 py-4 text-base font-bold text-white shadow-[0_4px_0_#065f46,0_12px_24px_-2px_rgba(5,150,105,0.45)] transition-all hover:from-emerald-500 hover:to-emerald-600 hover:shadow-[0_5px_0_#065f46,0_16px_28px_-2px_rgba(5,150,105,0.5)] hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#065f46] animate-pulse-subtle cursor-pointer disabled:opacity-60 disabled:pointer-events-none"
            >
              {busy ? (
                <>
                  <LoaderCircle className="size-5 animate-spin" />
                  <span>{uploadStatus || "Uploading & Analyzing Pages..."}</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-5 text-amber-300" />
                  <span>
                    Continue with {selectedFiles.length} File{selectedFiles.length === 1 ? "" : "s"} (Configure &amp; Print)
                  </span>
                  <ArrowRight className="size-5" />
                </>
              )}
            </button>
          )}
        </div>
      </form>

      {/* Supported format badges */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <span className="font-semibold text-slate-800">Supported:</span>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">PDF</span>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">Photos (PNG/JPG)</span>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">Word (.docx)</span>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">Excel / PPT</span>
      </div>

      {/* Connected Printer Status */}
      <div className="mt-3.5">
        {shop.online_printers && shop.online_printers.length > 0 ? (
          <div className="rounded-xl bg-emerald-50/80 px-3.5 py-2 text-xs text-emerald-900 border border-emerald-200/80 flex items-center justify-between shadow-2xs">
            <span className="inline-flex items-center gap-2 font-semibold">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              Shop Printer Ready: <b>{shop.online_printers[0].name}</b>
            </span>
            <span className="text-[11px] text-emerald-700 font-bold">
              {shop.online_printers[0].isColor ? "Color + B&W" : "B&W"}
            </span>
          </div>
        ) : (
          <div className="rounded-xl bg-amber-50/80 px-3.5 py-2 text-xs text-amber-900 border border-amber-200/80 flex items-center gap-2 shadow-2xs">
            <Printer className="size-4 text-amber-600 shrink-0" />
            <span>Printer offline at shop. You can still generate a 1-hour counter token!</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function ConfigureAndPayStep({
  shop,
  documents,
  current,
  activeDocument,
  setActiveDocument,
  updateRange,
  addRange,
  removeRange,
  removeDocument,
  allValid,
  busy,
  estimate,
  onProceedToPay,
  onProceedToCounterToken,
  onAddMoreFiles,
}: {
  shop: PublicShop;
  documents: CustomerDocument[];
  current: CustomerDocument;
  activeDocument: number;
  setActiveDocument: (index: number) => void;
  updateRange: (index: number, field: keyof PrintRange, value: string) => void;
  addRange: () => void;
  removeRange: (index: number) => void;
  removeDocument: (index: number) => void;
  allValid: boolean;
  busy: boolean;
  estimate: Estimate | null;
  onProceedToPay: () => void;
  onProceedToCounterToken: () => void;
  onAddMoreFiles: (files: File[]) => void;
}) {
  const modes = useMemo(() => countModes(current.ranges), [current.ranges]);
  const rangeError = validateRanges(current.ranges, current.pageCount);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const shopPaymentMode = shop.payment_mode || "both";
  const [selectedMode, setSelectedMode] = useState<"online" | "counter">(
    shopPaymentMode === "counter" ? "counter" : "online"
  );

  const fallbackTotalPages = documents.reduce((sum, doc) => sum + doc.pageCount, 0);
  const requestsColorMode = documents.some((doc) => doc.ranges.some((r) => r.colorMode === "color"));
  const colorPrinterUnavailable = requestsColorMode && shop.color_printer_status !== "ready";
  const printerOffline = shop.printer_status !== "ready";

  return (
    <div className="space-y-6">
      {/* Offline Warnings */}
      {colorPrinterUnavailable ? (
        <Alert tone="warning" title="Color Printer Currently Offline">
          The shop&apos;s Color Printer is offline. Please change your document print mode to &quot;Black &amp; White&quot; to print immediately.
        </Alert>
      ) : null}

      {/* 1. Document Configuration Card */}
      <Card className="p-5 sm:p-7 border-slate-200/80 bg-white shadow-md rounded-3xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Configure Print Options</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Set page ranges, color mode, and paper size for each document.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
              {documents.length} File{documents.length === 1 ? "" : "s"}
            </span>
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.tif,.tiff,.doc,.docx,.odt,.rtf,.ppt,.pptx,.odp,.xls,.xlsx,.ods,.txt,.csv,.md"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) {
                  onAddMoreFiles(files);
                }
                e.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy || documents.length >= 10}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-emerald-500 transition"
            >
              <Plus className="size-3.5 text-emerald-600" /> Add File
            </button>
          </div>
        </div>

        {/* Tab switcher for multiple documents */}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          {documents.map((document, index) => (
            <button
              key={document.id}
              onClick={() => setActiveDocument(index)}
              className={cn(
                "flex items-center gap-2 shrink-0 rounded-xl border px-3.5 py-2 text-left text-xs transition-all",
                index === activeDocument
                  ? "border-emerald-600 bg-emerald-50/80 font-bold text-emerald-950 shadow-xs ring-1 ring-emerald-500/20"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              <FileText className="size-4 text-emerald-600" />
              <span className="max-w-36 truncate">{document.filename}</span>
              <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                {document.pageCount}p
              </span>
            </button>
          ))}
        </div>

        {/* Active Document Details */}
        <div className="mt-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
            <div>
              <p className="font-bold text-slate-900 text-sm sm:text-base">{current.filename}</p>
              <p className="text-xs text-slate-500">
                {(current.sizeBytes / 1024 / 1024).toFixed(2)} MB · {current.pageCount} total pages
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right text-xs text-slate-600">
                <span>B&amp;W: <b className="text-slate-900">{modes.black_and_white}p</b></span>
                <span className="mx-1.5">·</span>
                <span>Color: <b className="text-slate-900">{modes.color}p</b></span>
              </div>
              <button
                type="button"
                disabled={documents.length <= 1}
                onClick={() => removeDocument(activeDocument)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition"
              >
                <Trash2 className="size-3.5 inline mr-1" />
                Remove
              </button>
            </div>
          </div>

          {/* Quick Page Presets */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Presets:</span>
            <button
              type="button"
              onClick={() => {
                updateRange(0, "startPage", "1");
                updateRange(0, "endPage", String(current.pageCount));
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-emerald-500 hover:bg-emerald-50/50 transition"
            >
              All Pages (1 - {current.pageCount})
            </button>
            <button
              type="button"
              onClick={() => {
                updateRange(0, "startPage", "1");
                updateRange(0, "endPage", "1");
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-emerald-500 hover:bg-emerald-50/50 transition"
            >
              Page 1 Only
            </button>
          </div>

          {/* Page Ranges List */}
          {current.ranges.map((range, index) => (
            <div
              key={`${current.id}-${index}`}
              className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:grid-cols-[1fr_1fr_1.3fr_1.2fr_auto]"
            >
              <label className="text-xs font-semibold text-slate-600">
                From Page
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  min="1"
                  max={current.pageCount}
                  type="number"
                  value={range.startPage}
                  onChange={(event) => updateRange(index, "startPage", event.target.value)}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                To Page
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  min="1"
                  max={current.pageCount}
                  type="number"
                  value={range.endPage}
                  onChange={(event) => updateRange(index, "endPage", event.target.value)}
                />
              </label>
              <Select
                label="Print Mode"
                value={range.colorMode}
                onChange={(event) => updateRange(index, "colorMode", event.target.value)}
              >
                <option value="black_and_white">📄 Black &amp; White</option>
                <option value="color" disabled={shop.color_printer_status !== "ready"}>
                  🎨 Full Color {shop.color_printer_status !== "ready" ? "(Offline)" : ""}
                </option>
              </Select>
              <Select
                label="Paper Size"
                value={range.paperSize}
                onChange={(event) => updateRange(index, "paperSize", event.target.value)}
              >
                <option value="a4">A4 (Standard)</option>
                <option value="a3">A3 (Large)</option>
                <option value="letter">Letter</option>
                <option value="legal">Legal</option>
              </Select>
              <button
                type="button"
                className="self-end rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-30 transition"
                aria-label="Remove page range"
                disabled={current.ranges.length === 1}
                onClick={() => removeRange(index)}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}

          {rangeError ? (
            <p className="mt-2.5 text-xs font-bold text-rose-600">{rangeError}</p>
          ) : (
            <p className="mt-2.5 text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5" /> Ready to print selected pages.
            </p>
          )}

          <button
            type="button"
            onClick={addRange}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-emerald-500 transition"
          >
            <Plus className="size-3.5 text-emerald-600" /> Add Another Page Range
          </button>
        </div>
      </Card>

      {/* 2. Order Summary & Payment Mode Selection */}
      <Card className="overflow-hidden border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/20 to-slate-50 p-6 sm:p-7 shadow-lg rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-200/60 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-xs">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Order Summary</h3>
              <p className="text-xs text-slate-500">Authoritative slab pricing</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
            {selectedMode === "counter" ? "TOKEN QUEUE" : "INSTANT AUTO-PRINT"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Documents</span>
            <div className="mt-1 text-lg font-black text-slate-900">{documents.length} File{documents.length === 1 ? "" : "s"}</div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Total Pages</span>
            <div className="mt-1 text-lg font-black text-slate-900">
              {estimate ? estimate.totalPages : fallbackTotalPages} Pages
            </div>
            {estimate ? (
              <span className="text-[11px] text-slate-500">
                ({estimate.blackAndWhitePages} B&amp;W, {estimate.colorPages} Color)
              </span>
            ) : null}
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
            <span className="text-xs font-semibold text-slate-500">Total Payable</span>
            <div className="mt-1 text-2xl font-black text-emerald-800 font-mono">
              ₹{estimate ? estimate.total.toFixed(2) : (fallbackTotalPages * 5).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Payment Mode Selector */}
        {shopPaymentMode === "both" ? (
          <div className="mt-6">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-2.5">
              Choose How to Pay
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSelectedMode("counter")}
                className={cn(
                  "flex items-start gap-3.5 rounded-2xl border-2 p-4 text-left transition-all cursor-pointer",
                  selectedMode === "counter"
                    ? "border-emerald-600 bg-emerald-50/80 shadow-md ring-2 ring-emerald-500/20"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                )}
              >
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl font-bold transition",
                    selectedMode === "counter" ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-100 text-slate-600"
                  )}
                >
                  <Ticket className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    Pay at Counter
                    <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-[10px] font-bold text-emerald-800">
                      TOKEN
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                    Generate a sequential token number and pay cash/UPI at the counter. Valid for 1 hour.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMode("online")}
                className={cn(
                  "flex items-start gap-3.5 rounded-2xl border-2 p-4 text-left transition-all cursor-pointer",
                  selectedMode === "online"
                    ? "border-emerald-600 bg-emerald-50/80 shadow-md ring-2 ring-emerald-500/20"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                )}
              >
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl font-bold transition",
                    selectedMode === "online" ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-100 text-slate-600"
                  )}
                >
                  <CreditCard className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    Pay Online
                    <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-[10px] font-bold text-emerald-800">
                      INSTANT
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                    Pay with UPI, Cards, or NetBanking. Instant zero-touch auto-print.
                  </p>
                </div>
              </button>
            </div>
          </div>
        ) : null}

        {/* Tactile Primary Action Button */}
        <div className="mt-6">
          {selectedMode === "counter" ? (
            <button
              type="button"
              disabled={!allValid || busy}
              onClick={onProceedToCounterToken}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 px-6 py-4 text-base font-bold text-white shadow-[0_4px_0_#065f46,0_12px_24px_-2px_rgba(5,150,105,0.4)] transition-all hover:from-emerald-500 hover:to-emerald-600 hover:shadow-[0_5px_0_#065f46,0_16px_28px_-2px_rgba(5,150,105,0.5)] hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#065f46] cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? (
                <>
                  <LoaderCircle className="size-5 animate-spin" />
                  <span>Generating Counter Token...</span>
                </>
              ) : (
                <>
                  <Ticket className="size-5" />
                  <span>
                    Generate Token &amp; Pay at Counter (₹{estimate ? estimate.total.toFixed(2) : (fallbackTotalPages * 5).toFixed(2)})
                  </span>
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={!allValid || busy}
              onClick={onProceedToPay}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-700 via-teal-800 to-slate-900 px-6 py-4 text-base font-bold text-white shadow-[0_4px_0_#064e3b,0_12px_24px_-2px_rgba(6,78,59,0.4)] transition-all hover:from-emerald-600 hover:to-teal-700 hover:shadow-[0_5px_0_#064e3b,0_16px_28px_-2px_rgba(6,78,59,0.5)] hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#064e3b] cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? (
                <>
                  <LoaderCircle className="size-5 animate-spin" />
                  <span>Preparing Payment...</span>
                </>
              ) : (
                <>
                  <CreditCard className="size-5" />
                  <span>
                    Proceed to Pay ₹{estimate ? estimate.total.toFixed(2) : (fallbackTotalPages * 5).toFixed(2)} Online
                  </span>
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
          {selectedMode === "counter" ? (
            <>
              <Store className="size-4 text-emerald-600" />
              <span>Token generated immediately · Show at counter within 1 hour</span>
            </>
          ) : (
            <>
              <ShieldCheck className="size-4 text-emerald-600" />
              <span>256-Bit Encrypted Payment · Instant Web Printing at Counter</span>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function CounterTokenStep({
  tokenDetails,
  shop,
  orderId,
  accessToken,
  documents,
  onReset,
}: {
  tokenDetails: TokenDetails;
  shop: PublicShop;
  orderId: string;
  accessToken: string | null;
  documents: CustomerDocument[];
  onReset: () => void;
}) {
  const [remainingSeconds, setRemainingSeconds] = useState(() => {
    return Math.max(0, Math.floor((new Date(tokenDetails.expiresAt).getTime() - Date.now()) / 1000));
  });
  const [orderStatus, setOrderStatus] = useState<string>("awaiting_payment");
  const [jobStatuses, setJobStatuses] = useState<Array<{ id: string; status: string }>>([]);
  const [copied, setCopied] = useState(false);

  // Live countdown timer for 1-hour validity
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(tokenDetails.expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [tokenDetails.expiresAt]);

  // Real-time status polling so customer sees when shop owner clicks "Print"
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(
          `/api/payment/status?orderId=${encodeURIComponent(orderId)}&accessToken=${encodeURIComponent(accessToken || "")}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!response.ok) return;
        const data = await response.json();
        if (controller.signal.aborted) return;
        setJobStatuses(data.printJobs || []);
        if (data.payment?.isVerified || data.order?.status === "paid") {
          setOrderStatus("paid");
        } else if (data.order?.status) {
          setOrderStatus(data.order.status);
        }
      } catch {
        // Polling retry
      }
    };
    const timer = setInterval(() => {
      void refresh();
    }, 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [orderId, accessToken]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedCountdown = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  const isExpired = remainingSeconds <= 0 && orderStatus === "awaiting_payment";

  const isCompleted =
    orderStatus === "completed" || (jobStatuses.length > 0 && jobStatuses.every((j) => j.status === "completed"));
  const isPrinting = orderStatus === "paid" || orderStatus === "printing" || orderStatus === "partially_printed";

  const handleCopyToken = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(String(tokenDetails.tokenNumber));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-white via-emerald-50/20 to-slate-50 p-6 sm:p-8 shadow-xl rounded-3xl">
      {/* 1. SCREENSHOT PROMPT BANNER (User requirement: "tell customer to take a screenshot of your token number") */}
      <div className="rounded-2xl border-2 border-dashed border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50/70 p-4 sm:p-5 text-amber-950 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-200/80 text-amber-900 shadow-inner">
            <Camera className="size-6" />
          </div>
          <div>
            <p className="text-sm font-black tracking-tight text-amber-950 sm:text-base">
              📸 Please take a screenshot of your token number!
            </p>
            <p className="text-xs text-amber-800 leading-relaxed mt-0.5">
              Take a screenshot now or save Token <b>#{tokenDetails.tokenNumber}</b> to show the shopkeeper at the counter.
            </p>
          </div>
        </div>
      </div>

      {/* 2. MASSIVE TOKEN NUMBER CARD */}
      <div className="mt-6 rounded-3xl border border-emerald-300/80 bg-white p-6 sm:p-8 text-center shadow-md">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1 text-xs font-bold text-emerald-800">
          <Ticket className="size-4" /> PAY AT COUNTER TOKEN
        </div>

        <div className="mt-4">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Your Token Number</span>
          <div className="mt-1 text-6xl sm:text-7xl font-black tracking-tight text-emerald-700 font-mono">
            #{tokenDetails.tokenNumber}
          </div>
        </div>

        {/* Total pages to be printed clearly below token number */}
        <div className="mt-3.5 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-extrabold text-emerald-900 border border-emerald-200">
          <Printer className="size-4 text-emerald-700 shrink-0" />
          <span>
            {tokenDetails.totalPages} Pages to be printed ({tokenDetails.blackAndWhitePages} B&amp;W, {tokenDetails.colorPages} Color)
          </span>
        </div>

        {/* Amount to pay */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-600 text-sm">
          <span>Pay at Counter:</span>
          <b className="text-2xl font-black text-slate-900 font-mono">₹{tokenDetails.totalAmount.toFixed(2)}</b>
        </div>

        {/* Copy Token Button */}
        <div className="mt-4">
          <button
            type="button"
            onClick={handleCopyToken}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 transition"
          >
            {copied ? (
              <>
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                Copied Token #{tokenDetails.tokenNumber}!
              </>
            ) : (
              <>
                <Ticket className="size-3.5 text-emerald-600" />
                Copy Token Number
              </>
            )}
          </button>
        </div>
      </div>

      {/* 3. VALIDITY COUNTDOWN & LIVE STATUS */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {/* Countdown Box */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock3 className="size-4 text-emerald-600" />
            <span className="font-bold">Token Validity</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={cn(
                "font-mono text-2xl font-black",
                remainingSeconds < 300 ? "text-rose-600" : "text-slate-900"
              )}
            >
              {isExpired ? "Expired" : formattedCountdown}
            </span>
            <span className="text-xs text-slate-500">{isExpired ? "" : "remaining (1 hr validity)"}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
            {isExpired
              ? "This token has expired. Please create a new request."
              : "Valid for 1 hour from submission. Show to shopkeeper before expiry."}
          </p>
        </div>

        {/* Live Status Box */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <span className="text-xs font-bold text-slate-500">Print Queue Status</span>
          <div className="mt-2">
            {isCompleted ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                <CheckCircle2 className="size-4" /> Printed &amp; Ready for Pickup!
              </span>
            ) : isPrinting ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600">
                <LoaderCircle className="size-4 animate-spin" /> Approved! Printing now...
              </span>
            ) : isExpired ? (
              <span className="text-sm font-bold text-rose-600">Expired (1 Hour Elapsed)</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-700">
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                Waiting for Shopkeeper at Counter
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
            {isCompleted
              ? "Your documents have been printed. Collect them from the counter."
              : isPrinting
              ? "Shop owner approved your token. Pages are being dispatched to the printer."
              : "Shop owner will verify Token #" + tokenDetails.tokenNumber + ", collect ₹" + tokenDetails.totalAmount.toFixed(2) + ", and print."}
          </p>
        </div>
      </div>

      {/* 4. ORDER SUMMARY & INSTRUCTIONS */}
      <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-5 text-xs text-slate-600 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between py-1">
          <span>Order ID</span>
          <span className="font-mono font-bold text-slate-900">#{tokenDetails.publicOrderId}</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span>Shop</span>
          <span className="font-semibold text-slate-900">{shop.name}</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span>Files</span>
          <span className="font-semibold text-slate-900">
            {documents.length} File{documents.length === 1 ? "" : "s"} ({tokenDetails.totalPages} Pages)
          </span>
        </div>
      </div>

      {/* Reset / New Order Button */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-emerald-500 transition active:scale-95 cursor-pointer"
        >
          <RotateCcw className="size-4" />
          Print Another Document
        </button>
      </div>
    </Card>
  );
}

interface RazorpayCheckoutResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutFailure {
  error: {
    code: string;
    description: string;
    source: string;
    step: string;
    reason: string;
  };
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  handler: (response: RazorpayCheckoutResponse) => void;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function PaymentStep({
  orderId,
  accessToken,
  shop,
  identifier,
  estimate,
  documents,
  onReset,
}: {
  orderId: string;
  accessToken: string | null;
  shop: PublicShop;
  identifier: string;
  estimate: Estimate;
  documents: CustomerDocument[];
  onReset: () => void;
}) {
  const [paymentStatus, setPaymentStatus] = useState<
    "idle" | "creating_order" | "checkout_open" | "verifying" | "verified" | "failed"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTestMode, setIsTestMode] = useState(false);
  const [verifiedDetails, setVerifiedDetails] = useState<{
    paymentId?: string;
    publicOrderId?: string;
    amount?: number;
    currency?: string;
  } | null>(null);

  const [jobStatuses, setJobStatuses] = useState<Array<{ id: string; status: string; failureReason?: string }>>([]);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(`/api/payment/status?orderId=${encodeURIComponent(orderId)}&accessToken=${encodeURIComponent(accessToken || "")}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        if (controller.signal.aborted) return;
        setJobStatuses(data.printJobs || []);
        if (data.payment?.isVerified) {
          setPaymentStatus("verified"); setErrorMessage(null);
          setVerifiedDetails({ publicOrderId: data.order.publicId, paymentId: data.payment.providerPaymentId });
        }
      } catch { /* Poll again without changing confirmed payment state. */ }
    };
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [orderId, accessToken]);

  const initiatePayment = useCallback(
    async () => {
      setErrorMessage(null);
      setPaymentStatus("creating_order");

      try {
        // 1. Create server-side Razorpay Order
        const response = await fetch("/api/payment/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            shopIdentifier: identifier,
            accessToken,
            paymentMode: "razorpay",
          }),
        });

        const createRes = await safeFetchJson<{
          alreadyPaid?: boolean;
          publicOrderId?: string;
          amount?: number;
          amountRupees?: number;
          currency?: string;
          keyId?: string;
          razorpayOrderId?: string;
          isTestMode?: boolean;
          verified?: boolean;
          paymentId?: string;
          error?: string;
        }>(response);

        const orderData = createRes.data;
        if (!orderData) throw new Error(createRes.error || "Empty payment response");

        if (!createRes.ok) {
          if (orderData.alreadyPaid) {
            setPaymentStatus("verified");
            setVerifiedDetails({
              publicOrderId: orderData.publicOrderId || orderId.slice(0, 8),
              amount: estimate.total,
              currency: "INR",
            });
            return;
          }
          throw new Error(createRes.error || orderData.error || "Failed to initiate payment order.");
        }

        if (orderData.verified || orderData.alreadyPaid) {
          setPaymentStatus("verified");
          setVerifiedDetails({
            publicOrderId: orderData.publicOrderId || orderId.slice(0, 8),
            paymentId: orderData.paymentId || `payment_${orderId.slice(0, 8)}`,
            amount: orderData.amountRupees || orderData.amount || estimate.total,
            currency: orderData.currency || "INR",
          });
          return;
        }

        setIsTestMode(Boolean(orderData.isTestMode));

        // 2. Load Razorpay Checkout SDK
        const scriptLoaded = await loadRazorpayScript();
        if (!scriptLoaded || !orderData.keyId || typeof orderData.amount !== "number" || !orderData.razorpayOrderId) {
          throw new Error("Razorpay checkout SDK could not load. Check your internet connection and retry.");
        }

        const RazorpayConstructor = (
          window as unknown as {
            Razorpay: new (options: RazorpayCheckoutOptions) => {
              open: () => void;
              on: (event: string, handler: (data: RazorpayCheckoutFailure) => void) => void;
            };
          }
        ).Razorpay;

        if (!RazorpayConstructor) throw new Error("Razorpay checkout is unavailable. Please retry.");

        // 3. Open Razorpay Checkout modal
        const options: RazorpayCheckoutOptions = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency || "INR",
          name: shop.name,
          description: `Print Order #${orderData.publicOrderId || orderId.slice(0, 8)}`,
          order_id: orderData.razorpayOrderId,
          theme: {
            color: "#0f766e",
          },
          handler: async (paymentResponse: RazorpayCheckoutResponse) => {
            setPaymentStatus("verifying");
            try {
              const verifyRes = await fetch("/api/payment/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  orderId,
                  razorpayOrderId: paymentResponse.razorpay_order_id,
                  razorpayPaymentId: paymentResponse.razorpay_payment_id,
                  razorpaySignature: paymentResponse.razorpay_signature,
                  accessToken,
                }),
              });

              const verifyResData = await safeFetchJson<{
                verified?: boolean;
                error?: string;
                paymentId?: string;
                publicOrderId?: string;
                amount?: number;
                currency?: string;
              }>(verifyRes);
              const verifyData = verifyResData.data || {};
              if (!verifyResData.ok || !verifyData.verified) {
                throw new Error(verifyResData.error || verifyData.error || "Payment signature verification failed.");
              }

              setPaymentStatus("verified");
              setVerifiedDetails({
                paymentId: verifyData.paymentId,
                publicOrderId: verifyData.publicOrderId,
                amount: verifyData.amount,
                currency: verifyData.currency,
              });
            } catch (verifyError) {
              setPaymentStatus("failed");
              let msg = verifyError instanceof Error ? verifyError.message : "Payment verification failed.";
              if (msg.includes("Unexpected end of JSON input")) {
                msg = "Payment verification response error. Please try again.";
              }
              setErrorMessage(msg);
            }
          },
          modal: {
            ondismiss: () => {
              setPaymentStatus("failed");
              setErrorMessage("Payment was cancelled. Click retry when ready.");
            },
          },
        };

        const rzpInstance = new RazorpayConstructor(options);

        rzpInstance.on("payment.failed", (response: RazorpayCheckoutFailure) => {
          setPaymentStatus("failed");
          setErrorMessage(response.error?.description || "Payment failed. Please try again.");
        });

        setPaymentStatus("checkout_open");
        rzpInstance.open();
      } catch (err) {
        setPaymentStatus("failed");
        let msg = err instanceof Error ? err.message : "Could not initiate payment.";
        if (msg.includes("Unexpected end of JSON input")) {
          msg = "Payment service communication error. Please try again.";
        }
        setErrorMessage(msg);
      }
    },
    [orderId, identifier, accessToken, estimate.total, shop.name]
  );

  useEffect(() => {
    void initiatePayment();
  }, [initiatePayment]);

  if (paymentStatus === "verified") {
    return (
      <Card className="border-emerald-200 bg-emerald-50/40 p-6 sm:p-8 shadow-xl">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-inner">
          <CheckCircle2 className="size-9" />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-extrabold text-brand-950">Payment Confirmed &amp; Queued!</h2>
          <Badge tone="success">PAYMENT VERIFIED</Badge>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">
          Your payment of <b className="text-brand-950">₹{estimate.total.toFixed(2)}</b> was received via Razorpay. Your print job is queued for automatic printing at <b className="text-brand-950">{shop.name}</b>.
        </p>

        <div className="mt-6 divide-y divide-emerald-100 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between py-2 text-xs">
            <span className="text-muted">Order ID</span>
            <span className="font-mono font-bold text-brand-950">
              #{verifiedDetails?.publicOrderId || orderId.slice(0, 8)}
            </span>
          </div>
          {verifiedDetails?.paymentId ? (
            <div className="flex items-center justify-between py-2 text-xs">
              <span className="text-muted">Razorpay Payment ID</span>
              <span className="font-mono font-semibold text-brand-950">{verifiedDetails.paymentId}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between py-2 text-xs">
            <span className="text-muted">Files &amp; Pages</span>
            <span className="font-semibold text-brand-950">
              {documents.length} File{documents.length === 1 ? "" : "s"} · {estimate.totalPages} Pages
            </span>
          </div>
          <div className="flex items-center justify-between py-2 text-xs">
            <span className="text-muted">Auto-Print Status</span>
            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
              <Printer className="size-3.5" /> Waiting for the Windows agent
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-2">{jobStatuses.map(job => <p key={job.id} className="rounded-lg border border-emerald-200 bg-white p-3 text-sm">Job #{job.id.slice(0, 8)}: <b>{job.status === "print_submitted" ? "Submitted to Windows; paper output unconfirmed" : job.status === "completed" ? "Printed (confirmed)" : job.status.replaceAll("_", " ")}</b>{job.failureReason && <span className="block text-red-700">{job.failureReason}</span>}</p>)}</div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={onReset}>
            <RotateCcw className="size-4" />
            Print Another Document
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 shadow-inner">
        <CreditCard className="size-7" />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-brand-950">Complete Payment</h2>
        {isTestMode ? <Badge tone="warning">TEST MODE</Badge> : null}
      </div>

      {errorMessage ? (
        <Alert className="mt-4" tone="error">
          {errorMessage}
        </Alert>
      ) : null}

      <div className="mt-6 rounded-2xl border border-line bg-brand-50/50 p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Shop Name</span>
          <span className="font-bold text-brand-950">{shop.name}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-muted">Total Pages</span>
          <span className="font-bold text-brand-950">
            {estimate.totalPages} pages ({estimate.blackAndWhitePages} B&amp;W, {estimate.colorPages} Color)
          </span>
        </div>
        {typeof estimate.platformFee === "number" && estimate.platformFee > 0 ? (
          <>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted">Print Subtotal</span>
              <span className="font-semibold text-brand-950">
                ₹{(estimate.subtotal ?? estimate.total - estimate.platformFee).toFixed(2)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted">
                Platform Convenience Fee ({estimate.totalPages <= 5 ? "≤ 5 pages" : "6+ pages"})
              </span>
              <span className="font-semibold text-emerald-800">+ ₹{estimate.platformFee.toFixed(2)}</span>
            </div>
          </>
        ) : null}
        <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-3">
          <span className="text-base font-bold text-brand-950">Total Amount</span>
          <span className="text-2xl font-black text-brand-800">₹{estimate.total.toFixed(2)}</span>
        </div>
      </div>

      <div className="mt-6">
        <Button
          variant="primary"
          className="w-full text-base py-4 font-bold shadow-xl shadow-brand-900/15"
          loading={paymentStatus === "creating_order" || paymentStatus === "verifying"}
          onClick={() => void initiatePayment()}
        >
          {paymentStatus === "creating_order" ? (
            <>
              <LoaderCircle className="size-5 animate-spin" />
              Opening Razorpay Checkout...
            </>
          ) : paymentStatus === "verifying" ? (
            <>
              <LoaderCircle className="size-5 animate-spin" />
              Verifying Razorpay Payment...
            </>
          ) : paymentStatus === "failed" ? (
            <>
              <RotateCcw className="size-5" />
              Retry Razorpay (₹{estimate.total.toFixed(2)})
            </>
          ) : (
            <>
              <CreditCard className="size-5" />
              Pay with Razorpay ₹{estimate.total.toFixed(2)}
            </>
          )}
        </Button>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
        <ShieldCheck className="size-4 text-emerald-600" />
        <span>Secured by Razorpay · 256-Bit SSL Encrypted Payment</span>
      </div>
    </Card>
  );
}
