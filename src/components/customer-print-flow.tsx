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
    setError(null);
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
      {/* Streamlined 2-Step Progress Indicator */}
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
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  const displayStep = step === 2 ? 1 : step;
  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-brand-200 bg-white p-1.5 shadow-sm">
      {steps.map((label, index) => (
        <div
          className={cn(
            "rounded-md px-2 py-2 text-center text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5",
            displayStep === index
              ? "bg-gradient-to-r from-brand-800 to-brand-700 text-white shadow-md shadow-brand-900/10"
              : displayStep > index
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-slate-50 text-muted border border-line",
          )}
          key={label}
        >
          {displayStep > index ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
              <span className="flex size-4 items-center justify-center rounded-full bg-white/20 text-[10px]">
              {index + 1}
            </span>
          )}
          {label}
        </div>
      ))}
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

  return (
    <Card className="p-4 sm:p-6 border-brand-100 shadow-md">
      {/* Upload File Input - Top Priority on Mobile */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (selectedFiles.length > 0) {
            onSubmit(selectedFiles);
          }
        }}
      >
        <label className="group flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-400 bg-gradient-to-b from-brand-50/60 to-emerald-50/30 p-5 text-center transition hover:border-brand-600 hover:bg-brand-50 active:scale-[0.99]">
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-md shadow-brand-700/20 transition group-hover:scale-105">
            <FileUp className="size-6" />
          </div>
          <span className="mt-3 text-base font-bold text-brand-950">
            {selectedFiles.length > 0 ? "Add more files or tap Continue" : "Tap to Choose File / Photo"}
          </span>
          <span className="mt-0.5 text-xs text-muted">PDF, Photos (JPG/PNG), Word, Docs</span>

          <input
            className="sr-only"
            name="files"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.tif,.tiff,.doc,.docx,.odt,.rtf,.ppt,.pptx,.odp,.xls,.xlsx,.ods,.txt,.csv,.md"
            multiple
            onChange={(e) => {
              const newFiles = Array.from(e.target.files ?? []);
              if (!newFiles.length) return;
              setSelectedFiles((current) => {
                const existing = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
                return [...current, ...newFiles.filter((file) => !existing.has(`${file.name}:${file.size}:${file.lastModified}`))].slice(0, 10);
              });
              e.currentTarget.value = "";
            }}
          />
        </label>

        {/* Selected Files List */}
        {selectedFiles.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] font-bold text-brand-900 uppercase tracking-wide">
              {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} ready:
            </p>
            <div className="max-h-36 overflow-y-auto space-y-1">
              {selectedFiles.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <FileText className="size-4 shrink-0 text-brand-700" />
                    <span className="truncate font-medium text-brand-950">{file.name}</span>
                    <span className="text-[10px] text-muted shrink-0">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFiles((files) => files.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-red-600 p-1"
                    aria-label="Remove file"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Single Continue Button */}
        <Button
          className="mt-4 w-full py-3.5 text-base font-bold shadow-lg shadow-brand-900/10"
          type="submit"
          disabled={selectedFiles.length === 0 && !busy}
          loading={busy}
        >
          {busy ? (
            <>
              <LoaderCircle className="size-5 animate-spin" />
              {uploadStatus || "Processing documents..."}
            </>
          ) : (
            <>
              Continue <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </form>

      {/* Supported format badges */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5 border-t border-line/60 pt-4 text-[11px] text-muted">
        <span className="font-semibold text-brand-950">Supported:</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">PDF</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">Images (PNG/JPG)</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">Word (.docx)</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">Text</span>
      </div>

      {/* Connected Printer Status (compact at bottom of upload card) */}
      <div className="mt-3">
        {shop.online_printers && shop.online_printers.length > 0 ? (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900 border border-emerald-200 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              Shop Printer Ready: <b>{shop.online_printers[0].name}</b>
            </span>
            <span className="text-[10px] text-emerald-700 font-semibold">
              {shop.online_printers[0].isColor ? "Color + B&W" : "B&W"}
            </span>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900 border border-amber-200 flex items-center gap-2">
            <Printer className="size-3.5 text-amber-600 shrink-0" />
            <span>Printer offline: reconnect a physical printer before checkout.</span>
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
  onAddMoreFiles: (files: File[]) => void;
}) {
  const modes = useMemo(() => countModes(current.ranges), [current.ranges]);
  const rangeError = validateRanges(current.ranges, current.pageCount);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate live fallback total if estimate API is pending
  const fallbackTotalPages = documents.reduce((sum, doc) => sum + doc.pageCount, 0);

  const requestsColorMode = documents.some((doc) => doc.ranges.some((r) => r.colorMode === "color"));
  const colorPrinterUnavailable = requestsColorMode && shop.color_printer_status !== "ready";
  const printerOffline = shop.printer_status !== "ready";

  // Determine selectable printers based on what customer has requested
  const availablePrinters = (shop.online_printers ?? []).filter((p) => {
    if (requestsColorMode) return p.isColor; // Only color printers if color requested
    return true; // All printers can handle B&W
  });

  return (
    <div className="space-y-6">
      {shop.online_printers?.length ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="font-semibold text-emerald-900">Automatic printer selection</h3>
          <p className="mt-1 text-sm text-emerald-800">Your pages are routed to a connected printer that supports the selected paper size and color mode.</p>
          <div className="mt-3 flex flex-wrap gap-2">{availablePrinters.map(p => <span key={p.id} className="rounded-lg bg-white px-3 py-2 text-xs">{p.name} ? {p.isColor ? "Color + B&W" : "B&W"}</span>)}</div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 shadow-sm">
          <div className="flex items-start gap-2.5">
            <Printer className="size-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">⚠️ No printers are currently online</p>
              <p className="mt-0.5 text-xs leading-5 text-amber-800">
                Reconnect a supported printer before payment. Paid orders wait for the agent if connectivity is lost later.
              </p>
            </div>
          </div>
        </div>
      )}

      {colorPrinterUnavailable ? (
        <Alert tone="warning" title="Color Printer Offline">
          The shop owner&apos;s Color Printer is currently offline. Please change your document print mode to &quot;Black &amp; White&quot; to proceed.
        </Alert>
      ) : null}

      {/* 1. Document Configuration Card */}
      <Card className="p-5 sm:p-7 border-brand-100 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-brand-950">Configure Print Options</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Select page ranges, color mode (B&amp;W or Color), and paper size.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="success">
              {documents.length} File{documents.length === 1 ? "" : "s"} Uploaded
            </Badge>
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
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || documents.length >= 10}
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="size-3.5" /> Add File
            </Button>
          </div>
        </div>

        {/* Tab switcher for multiple documents */}
        <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
          {documents.map((document, index) => (
            <button
              className={cn(
                "shrink-0 rounded-xl border px-3.5 py-2 text-left text-xs transition-all",
                index === activeDocument
                  ? "border-brand-600 bg-brand-50 font-bold text-brand-900 shadow-sm"
                  : "border-line bg-white text-muted hover:bg-slate-50",
              )}
              key={document.id}
              onClick={() => setActiveDocument(index)}
            >
              <span className="block max-w-40 truncate font-semibold">{document.filename}</span>
              <span className="text-[11px] opacity-75">{document.pageCount} pages</span>
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-2xl bg-brand-50/60 border border-brand-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-brand-950">{current.filename}</p>
              <p className="mt-0.5 text-xs text-muted">
                {(current.sizeBytes / 1024 / 1024).toFixed(2)} MB · {current.pageCount} pages
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right text-xs text-muted">
                <p>
                  B&amp;W: <b className="text-brand-800">{modes.black_and_white} p</b>
                </p>
                <p>
                  Color: <b className="text-brand-800">{modes.color} p</b>
                </p>
              </div>
              <button
                className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                aria-label={`Remove ${current.filename}`}
                disabled={documents.length <= 1}
                onClick={() => removeDocument(activeDocument)}
              >
                <Trash2 className="size-3.5 sm:mr-1 inline" />
                <span className="hidden sm:inline">Remove</span>
              </button>
            </div>
          </div>

          {current.ranges.map((range, index) => (
            <div
              className="mt-4 grid gap-3 rounded-xl border border-line bg-white p-3.5 sm:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto]"
              key={`${current.id}-${index}`}
            >
              <label className="text-xs font-semibold text-muted">
                From Page
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm font-semibold text-brand-950"
                  min="1"
                  max={current.pageCount}
                  type="number"
                  value={range.startPage}
                  onChange={(event) => updateRange(index, "startPage", event.target.value)}
                />
              </label>
              <label className="text-xs font-semibold text-muted">
                To Page
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm font-semibold text-brand-950"
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
                  🎨 Full Color {shop.color_printer_status !== "ready" ? "(Unavailable)" : ""}
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
                className="self-end rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-30"
                aria-label="Remove page range"
                disabled={current.ranges.length === 1}
                onClick={() => removeRange(index)}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}

          {rangeError ? (
            <p className="mt-3 text-sm font-medium text-red-600">{rangeError}</p>
          ) : (
            <p className="mt-3 text-xs text-emerald-700 font-semibold flex items-center gap-1">
              <CheckCircle2 className="size-3.5" /> Ready to print selected pages.
            </p>
          )}

          <Button className="mt-3" variant="secondary" size="sm" onClick={addRange}>
            <Plus className="size-3.5" />
            Add another page range
          </Button>
        </div>
      </Card>

      {/* 2. Order Summary & Proceed to Pay Card */}
      <Card className="border-brand-200 bg-gradient-to-br from-white via-brand-50/40 to-emerald-50/20 p-6 sm:p-7 shadow-lg">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-brand-950">Order Summary</h3>
              <p className="text-xs text-muted">Authoritative shop slab pricing</p>
            </div>
          </div>
          <Badge tone="success">INSTANT AUTO-PRINT</Badge>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-white p-3.5">
            <span className="text-xs font-semibold text-muted">Total Documents</span>
            <div className="mt-1 text-lg font-bold text-brand-950">{documents.length} File{documents.length === 1 ? "" : "s"}</div>
          </div>
          <div className="rounded-xl border border-line bg-white p-3.5">
            <span className="text-xs font-semibold text-muted">Total Pages</span>
            <div className="mt-1 text-lg font-bold text-brand-950">
              {estimate ? estimate.totalPages : fallbackTotalPages} Pages
            </div>
            {estimate && (
              <span className="text-[11px] text-muted">
                ({estimate.blackAndWhitePages} B&amp;W, {estimate.colorPages} Color)
              </span>
            )}
          </div>
          <div className="rounded-xl border border-line bg-white p-3.5">
            <span className="text-xs font-semibold text-muted">Payable Amount</span>
            <div className="mt-1 text-2xl font-black text-brand-800">
              ₹{estimate ? estimate.total.toFixed(2) : (fallbackTotalPages * 5).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Action Button: Proceed to Pay */}
        <div className="mt-6">
          <Button
            className="w-full py-4 text-base font-bold shadow-xl shadow-brand-900/15"
            disabled={!allValid || !estimate || printerOffline || colorPrinterUnavailable}
            loading={busy}
            onClick={onProceedToPay}
          >
            {busy ? (
              <>
                <LoaderCircle className="size-5 animate-spin" />
                Preparing Payment...
              </>
            ) : (
              <>
                <CreditCard className="size-5" />
                Proceed to Pay ₹{estimate ? estimate.total.toFixed(2) : (fallbackTotalPages * 5).toFixed(2)}
              </>
            )}
          </Button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
          <ShieldCheck className="size-4 text-emerald-600" />
          <span>256-Bit Encrypted Payment · Instant Web Printing at Counter</span>
        </div>
      </Card>
    </div>
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
