"use client";

import { useMemo, useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import {
  AlertCircle,
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
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Camera,
  Ticket,
  Clock3,
  Store,
  Crop,
  Eye,
  Info,
  History,
  Copy,
  Check,
  X,
  ExternalLink,
  LayoutGrid,
  Palette,
  Layers,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { PublicShop, PublicPricingRule } from "@/lib/shops/public-lookup";
import { type PrintRange, validateRanges } from "@/lib/customer-print";
import { calculatePricing, type PricingRule } from "@/lib/pricing-engine";
import type { LayoutTemplate } from "@/components/multi-image-page-modal";

const ImageCropperModal = dynamic(
  () => import("@/components/image-cropper-modal").then((m) => m.ImageCropperModal),
  { ssr: false }
);

const MultiImagePageModal = dynamic(
  () => import("@/components/multi-image-page-modal").then((m) => m.MultiImagePageModal),
  { ssr: false }
);

const PrintPreviewStep = dynamic(
  () => import("@/components/print-preview-step").then((m) => m.PrintPreviewStep),
  { ssr: false }
);

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type CustomerDocument = {
  id: string;
  filename: string;
  pageCount: number;
  sizeBytes: number;
  ranges: PrintRange[];
  isImage?: boolean;
  isCombinedSheet?: boolean;
  originalFile?: File;
  previewUrl?: string;
  croppedImageUrl?: string;
};

type Props = {
  shop: PublicShop;
  identifier: string;
  initialPricingRules?: PublicPricingRule[];
  initialOrderId?: string | null;
  initialAccessToken?: string | null;
};
export type TokenDetails = {
  tokenNumber: number;
  publicOrderId: string;
  totalAmount: number;
  totalPages: number;
  colorPages: number;
  blackAndWhitePages: number;
  expiresAt: string;
};

export type StoredToken = {
  tokenNumber: number;
  publicOrderId: string;
  orderId?: string;
  accessToken?: string;
  shopIdentifier: string;
  shopName: string;
  totalAmount: number;
  totalPages: number;
  colorPages: number;
  blackAndWhitePages: number;
  createdAt: string;
  expiresAt: string;
  documentNames: string[];
};

const TOKENS_STORAGE_KEY = "printsathi_customer_tokens_v1";

function subscribeToTokens(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener("printsathi_tokens_changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("printsathi_tokens_changed", callback);
  };
}

function getTokensSnapshot(): string {
  if (typeof window === "undefined") return "[]";
  return localStorage.getItem(TOKENS_STORAGE_KEY) || "[]";
}

function getServerSnapshot(): string {
  return "[]";
}

export function saveTokenToStorage(token: StoredToken) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(TOKENS_STORAGE_KEY);
    const existing: StoredToken[] = raw ? JSON.parse(raw) : [];
    const filtered = Array.isArray(existing) ? existing.filter((t) => t.publicOrderId !== token.publicOrderId) : [];
    const updated = [token, ...filtered].slice(0, 30);
    localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("printsathi_tokens_changed"));
  } catch {
    // Ignore storage quota or privacy mode errors
  }
}

export function removeTokenFromStorage(publicOrderId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(TOKENS_STORAGE_KEY);
    const existing: StoredToken[] = raw ? JSON.parse(raw) : [];
    const updated = Array.isArray(existing) ? existing.filter((t) => t.publicOrderId !== publicOrderId) : [];
    localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("printsathi_tokens_changed"));
  } catch {
    // Ignore
  }
}

export function clearAllStoredTokens() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TOKENS_STORAGE_KEY);
    window.dispatchEvent(new Event("printsathi_tokens_changed"));
  } catch {
    // Ignore
  }
}

export type Estimate = {
  total: number;
  subtotal?: number;
  platformFee?: number;
  currency: string;
  totalPages: number;
  colorPages: number;
  blackAndWhitePages: number;
};



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

async function optimizeImageForUpload(file: File): Promise<File> {
  const isImage = file.type.startsWith("image/") || /\.(png|jpg|jpeg|webp|bmp|tif|tiff)$/i.test(file.name);
  // Only optimize raster images larger than 3.5MB to maximize upload speed without unnecessary processing
  if (!isImage || file.size <= 3.5 * 1024 * 1024) {
    return file;
  }

  try {
    let width = 0;
    let height = 0;
    let source: ImageBitmap | HTMLImageElement;

    if (typeof createImageBitmap === "function") {
      try {
        source = await createImageBitmap(file);
        width = source.width;
        height = source.height;
      } catch {
        // Fallback to Image element
        source = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Image decode failed"));
          };
          img.src = url;
        });
        width = source.width;
        height = source.height;
      }
    } else {
      source = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Image decode failed"));
        };
        img.src = url;
      });
      width = source.width;
      height = source.height;
    }

    const maxDimension = 3840; // 4K resolution — superior quality for 300 DPI A4/A3 photo print
    let targetWidth = width;
    let targetHeight = height;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        targetHeight = Math.round((height * maxDimension) / width);
        targetWidth = maxDimension;
      } else {
        targetWidth = Math.round((width * maxDimension) / height);
        targetHeight = maxDimension;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if ("close" in source && typeof source.close === "function") source.close();
      return file;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

    if ("close" in source && typeof source.close === "function") source.close();

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
    if (!blob || blob.size >= file.size) {
      return file;
    }

    const cleanName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
    return new File([blob], cleanName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function uploadWithProgress<T>(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<{ ok: boolean; status: number; data?: T; error?: string; failedFilename?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(Math.min(percent, 99));
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ ok: true, status: xhr.status, data });
        } else {
          const fallbackError =
            xhr.status === 413
              ? "File is too large for upload (413 Payload Too Large). Please choose a file under 25 MB or upload as PDF."
              : `Upload failed (HTTP ${xhr.status})`;
          resolve({
            ok: false,
            status: xhr.status,
            error: data?.error || fallbackError,
            failedFilename: data?.failedFilename,
          });
        }
      } catch {
        const fallbackError =
          xhr.status === 413
            ? "File is too large for upload (413 Payload Too Large). Please choose a file under 25 MB or upload as PDF."
            : `Upload failed (HTTP ${xhr.status}). Please try again.`;
        resolve({ ok: false, status: xhr.status, error: fallbackError });
      }
    };

    xhr.onerror = () => {
      resolve({ ok: false, status: 0, error: "Network error during upload. Please check your connection and try again." });
    };

    xhr.ontimeout = () => {
      resolve({ ok: false, status: 0, error: "Upload timed out. Please try again." });
    };

    xhr.timeout = 120000;
    xhr.send(formData);
  });
}

export function CustomerPrintFlow({
  shop: initialShop,
  identifier,
  initialPricingRules = [],
  initialOrderId = null,
  initialAccessToken = null,
}: Props) {
  const [shop, setShop] = useState(initialShop);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>(() =>
    (initialPricingRules || []).map((r) => ({
      ...r,
      side_mode: r.side_mode ?? "single_sided",
      price_per_page: Number(r.price_per_page),
      is_active: true,
    }))
  );

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
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [identifier]);

  // Step 0: Upload, Step 1: Configure & Crop, Step 2: Print Preview & Review, Step 3: Payment Online, Step 4: Counter Token
  const [step, setStep] = useState(0);
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [activeDocument, setActiveDocument] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedFiles, setFailedFiles] = useState<Record<string, string>>({});
  const [tokenDetails, setTokenDetails] = useState<TokenDetails | null>(null);
  const [resumedFromWhatsApp, setResumedFromWhatsApp] = useState(false);
  // Stable snapshot of current time — initialized once per mount
  const [nowSnapshot] = useState(() => Date.now());

  const rawTokensSnapshot = useSyncExternalStore(subscribeToTokens, getTokensSnapshot, getServerSnapshot);
  const savedTokens = useMemo<StoredToken[]>(() => {
    try {
      const parsed = JSON.parse(rawTokensSnapshot);
      if (!Array.isArray(parsed)) return [];
      const cutoff = nowSnapshot - 48 * 60 * 60 * 1000;
      return parsed.filter(
        (t) => t && typeof t.tokenNumber === "number" && t.publicOrderId && new Date(t.createdAt || t.expiresAt).getTime() > cutoff
      );
    } catch {
      return [];
    }
  }, [rawTokensSnapshot, nowSnapshot]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  function restoreSavedToken(token: StoredToken) {
    setTokenDetails({
      tokenNumber: token.tokenNumber,
      publicOrderId: token.publicOrderId,
      totalAmount: token.totalAmount,
      totalPages: token.totalPages,
      colorPages: token.colorPages,
      blackAndWhitePages: token.blackAndWhitePages,
      expiresAt: token.expiresAt,
    });
    setOrderId(token.orderId || token.publicOrderId);
    setAccessToken(token.accessToken || "");
    setDocuments(
      (token.documentNames || []).map((name, i) => ({
        id: `restored-doc-${i}`,
        filename: name,
        pageCount: token.totalPages,
        sizeBytes: 0,
        ranges: [],
      }))
    );
    setStep(4);
    setError(null);
  }

  // Selected payment mode ("counter" or "online")
  const [selectedMode, setSelectedMode] = useState<"counter" | "online">(() =>
    initialShop.payment_mode === "counter" ? "counter" : "online"
  );

  // Image Cropper State
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropTargetDocIndex, setCropTargetDocIndex] = useState<number | null>(null);

  // Multi-Image Sheet State (Multiple Photos on 1 Page)
  const [multiImageModalOpen, setMultiImageModalOpen] = useState(false);
  const [multiImageInitialPreset, setMultiImageInitialPreset] = useState<LayoutTemplate>("grid-2-vert");
  const [multiImageInitialImages, setMultiImageInitialImages] = useState<{ dataUrl: string; filename: string; documentId?: string }[]>([]);

  const existingDocImages = useMemo(() => {
    return documents
      .filter((d) => !d.isCombinedSheet && !d.filename.startsWith("multi-photo-sheet-"))
      .filter((d) => d.previewUrl || d.isImage || /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(d.filename))
      .map((d) => ({
        documentId: d.id,
        dataUrl: d.previewUrl || (orderId && accessToken ? `/api/customer/document-preview?documentId=${d.id}&orderId=${orderId}&token=${accessToken}` : ""),
        filename: d.filename,
      }))
      .filter((x) => Boolean(x.dataUrl));
  }, [documents, orderId, accessToken]);

  const handleOpenMultiImage = (initialDocIndex?: number, defaultPreset?: LayoutTemplate) => {
    const preset = defaultPreset || "grid-2-vert";
    setMultiImageInitialPreset(preset);

    // Filter to uncombined raw photos (excluding already combined multi-photo sheets)
    const rawImageDocs = documents.filter(
      (d) =>
        !d.isCombinedSheet &&
        !d.filename.startsWith("multi-photo-sheet-") &&
        (d.previewUrl || d.isImage || /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(d.filename))
    );

    if (typeof initialDocIndex === "number" && documents[initialDocIndex]) {
      const activeDoc = documents[initialDocIndex];
      const activeRawIndex = rawImageDocs.findIndex((d) => d.id === activeDoc.id);

      // Order pool starting from activeDoc, followed by all remaining uncombined photos, then any prior uncombined photos
      let orderedRawDocs = rawImageDocs;
      if (activeRawIndex !== -1) {
        orderedRawDocs = [
          ...rawImageDocs.slice(activeRawIndex),
          ...rawImageDocs.slice(0, activeRawIndex),
        ];
      }

      const reordered = orderedRawDocs
        .map((d) => ({
          documentId: d.id,
          dataUrl:
            d.previewUrl ||
            (orderId && accessToken
              ? `/api/customer/document-preview?documentId=${d.id}&orderId=${orderId}&token=${accessToken}`
              : ""),
          filename: d.filename,
        }))
        .filter((x) => Boolean(x.dataUrl));

      setMultiImageInitialImages(reordered.length > 0 ? reordered : existingDocImages);
    } else {
      setMultiImageInitialImages(existingDocImages);
    }
    setMultiImageModalOpen(true);
  };

  const activeTokenForShop = useMemo(() => {
    return savedTokens.find(
      (t) => t.shopIdentifier === identifier && new Date(t.expiresAt).getTime() > nowSnapshot
    );
  }, [savedTokens, identifier, nowSnapshot]);

  const current = documents[activeDocument];
  const allValid =
    documents.length > 0 && documents.every((document) => !validateRanges(document.ranges, document.pageCount));

  // 1. Instant Synchronous Estimate Calculation (0ms perceived latency on clicks)
  useEffect(() => {
    if ((step === 1 || step === 2) && documents.length > 0 && allValid && pricingRules.length > 0) {
      const allRanges = documents.flatMap((d) => d.ranges);
      try {
        const instant = calculatePricing(allRanges, pricingRules, "customer_fee");
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEstimate({
          total: instant.total,
          subtotal: instant.subtotal,
          platformFee: instant.platformFee,
          currency: "INR",
          totalPages: instant.totalPages,
          colorPages: instant.colorPages,
          blackAndWhitePages: instant.blackAndWhitePages,
        });
      } catch {
        // Fallback to server estimate
      }
    }
  }, [step, documents, allValid, pricingRules]);

  // 2. Background Server Estimate Sync
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
        const result = await safeFetchJson<Estimate & { pricingRuleSnapshot?: PricingRule[] }>(response);
        if (result.ok && result.data) {
          setEstimate(result.data);
          if (result.data.pricingRuleSnapshot && result.data.pricingRuleSnapshot.length > 0) {
            setPricingRules(
              result.data.pricingRuleSnapshot.map((r) => ({
                ...r,
                side_mode: r.side_mode ?? "single_sided",
                price_per_page: Number(r.price_per_page),
                is_active: true,
              }))
            );
          }
        }
      } catch {
        // Fallback live estimate calculation
      }
    },
    [identifier],
  );

  // Auto calculate estimate whenever document configuration changes
  useEffect(() => {
    if ((step === 1 || step === 2) && orderId && accessToken && allValid && documents.length > 0) {
      const timer = setTimeout(() => {
        fetchEstimate(documents, orderId, accessToken);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [step, orderId, accessToken, documents, allValid, fetchEstimate]);

  // Auto-scroll to top smoothly whenever an error is set
  useEffect(() => {
    if (error) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [error]);

  // Auto-scroll to top when moving between steps
  useEffect(() => {
    if (step > 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [step]);

  const loadedDraftOrderIdRef = useRef<string | null>(null);

  // Auto-resume draft order created via WhatsApp
  useEffect(() => {
    if (!initialOrderId || !initialAccessToken) return;
    if (loadedDraftOrderIdRef.current === initialOrderId) return;
    let isSubscribed = true;

    async function loadDraftFromWhatsApp() {
      try {
        setBusy(true);
        setUploadStatus("Connecting to your WhatsApp order draft...");
        const response = await fetch(
          `/api/customer/draft-order?orderId=${encodeURIComponent(initialOrderId!)}&accessToken=${encodeURIComponent(initialAccessToken!)}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || "Order draft is no longer available or has already been completed.");
        }
        const data = await response.json();
        if (!isSubscribed) return;

        loadedDraftOrderIdRef.current = initialOrderId;

        const docs: CustomerDocument[] = (data.documents || []).map((d: { id: string; filename: string; pageCount: number; sizeBytes?: number }) => {
          const isImg = Boolean(d.filename.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i));
          const previewUrl = isImg
            ? `/api/customer/document-preview?documentId=${d.id}&orderId=${data.orderId}&token=${data.accessToken}`
            : undefined;

          return {
            id: d.id,
            filename: d.filename,
            pageCount: d.pageCount,
            sizeBytes: d.sizeBytes || 0,
            isImage: isImg,
            previewUrl,
            ranges: [
              {
                startPage: 1,
                endPage: d.pageCount,
                colorMode: "black_and_white",
                paperSize: "a4",
                sideMode: "single_sided",
                copies: 1,
              },
            ],
          };
        });

        setOrderId(data.orderId);
        setAccessToken(data.accessToken);
        setDocuments(docs);
        setActiveDocument(0);
        setResumedFromWhatsApp(true);
        setStep(1);

        if (pricingRules.length > 0) {
          try {
            const instant = calculatePricing(docs.flatMap((d) => d.ranges), pricingRules, "customer_fee");
            setEstimate({
              total: instant.total,
              subtotal: instant.subtotal,
              platformFee: instant.platformFee,
              currency: "INR",
              totalPages: instant.totalPages,
              colorPages: instant.colorPages,
              blackAndWhitePages: instant.blackAndWhitePages,
            });
          } catch {
            // fallback
          }
        }
        void fetchEstimate(docs, data.orderId, data.accessToken);
      } catch (err) {
        if (isSubscribed) {
          setError(err instanceof Error ? err.message : "Failed to load order from WhatsApp link.");
        }
      } finally {
        setBusy(false);
        setUploadStatus(null);
      }
    }

    void loadDraftFromWhatsApp();
    return () => {
      isSubscribed = false;
    };
  }, [initialOrderId, initialAccessToken, fetchEstimate, pricingRules]);

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
    setFailedFiles({});
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
        setFailedFiles({ [f.name]: "Unsupported file format" });
        setError(`"${f.name}" has an unsupported format. Please upload PDF, images, or Office documents.`);
        return;
      }
      if (f.size === 0) {
        setFailedFiles({ [f.name]: "File is empty (0 bytes)" });
        setError(`"${f.name}" is empty (0 bytes).`);
        return;
      }
    }

    setBusy(true);
    setUploadProgress(0);
    try {
      setUploadStatus(
        files.some((f) => f.type.startsWith("image/") || /\.(png|jpg|jpeg|webp|bmp|tif|tiff)$/i.test(f.name))
          ? "Optimizing & preparing images..."
          : "Preparing documents for upload..."
      );
      const processedFiles = await Promise.all(files.map((file) => optimizeImageForUpload(file)));

      for (const f of processedFiles) {
        if (f.size > 25 * 1024 * 1024) {
          setFailedFiles({ [f.name]: "Exceeds 25 MB upload limit" });
          setError(`"${f.name}" exceeds the 25 MB limit. Please choose a smaller file.`);
          setBusy(false);
          return;
        }
      }

      setUploadStatus(processedFiles.length > 1 ? `Uploading ${processedFiles.length} documents (0%)...` : "Uploading document (0%)...");
      const form = new FormData();
      form.append("shopIdentifier", identifier);
      if (isAppending && orderId && accessToken) {
        form.append("orderId", orderId);
        form.append("accessToken", accessToken);
      }
      processedFiles.forEach((file) => form.append("files", file));

      const uploadRes = await uploadWithProgress<{
        orderId: string;
        orderPublicId: string;
        accessToken: string;
        documents: CustomerDocument[];
        failedFilename?: string;
      }>("/api/customer/upload", form, (percent) => {
        setUploadProgress(percent);
        if (percent >= 99) {
          setUploadStatus("Processing documents & analyzing pages...");
        } else {
          setUploadStatus(processedFiles.length > 1 ? `Uploading ${processedFiles.length} documents (${percent}%)...` : `Uploading document (${percent}%)...`);
        }
      });

      if (!uploadRes.ok || !uploadRes.data) {
        if (uploadRes.failedFilename) {
          setFailedFiles({ [uploadRes.failedFilename]: uploadRes.error || "Failed to process" });
        }
        throw new Error(uploadRes.error || "Upload failed. Please try uploading again.");
      }
      const result = uploadRes.data;

      const newDocs: CustomerDocument[] = result.documents.map((document: CustomerDocument, index: number) => {
        const matchingFile = processedFiles[index];
        const isImg = matchingFile ? Boolean(matchingFile.type.startsWith("image/")) : Boolean(document.filename.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i));
        const previewUrl = matchingFile && isImg ? URL.createObjectURL(matchingFile) : undefined;

        return {
          ...document,
          filename: document.filename,
          pageCount: document.pageCount,
          isImage: isImg,
          originalFile: matchingFile,
          previewUrl,
          ranges: [
            {
              startPage: 1,
              endPage: document.pageCount,
              colorMode: "black_and_white",
              paperSize: "a4",
              sideMode: "single_sided",
              copies: 1,
            },
          ],
        };
      });

      const mergedDocs = isAppending ? [...documents, ...newDocs] : newDocs;

      // Calculate instant price snapshot locally with 0ms delay
      if (pricingRules.length > 0) {
        try {
          const instant = calculatePricing(mergedDocs.flatMap((d) => d.ranges), pricingRules, "customer_fee");
          setEstimate({
            total: instant.total,
            subtotal: instant.subtotal,
            platformFee: instant.platformFee,
            currency: "INR",
            totalPages: instant.totalPages,
            colorPages: instant.colorPages,
            blackAndWhitePages: instant.blackAndWhitePages,
          });
        } catch {
          // Fallback to server sync
        }
      }

      setDocuments(mergedDocs);
      setOrderId(result.orderId);
      setAccessToken(result.accessToken);
      if (isAppending) {
        setActiveDocument(documents.length);
      }

      // Advance directly to Step 1: Configure & Crop
      setStep(1);

      // Sync server estimate asynchronously in background
      void fetchEstimate(mergedDocs, result.orderId, result.accessToken);
    } catch (uploadError) {
      let msg = uploadError instanceof Error ? uploadError.message : "Could not process or upload the files.";
      if (msg.includes("Unexpected end of JSON input")) {
        msg = "Server communication error. Please try uploading your files again.";
      }
      setError(msg);
    } finally {
      setBusy(false);
      setUploadStatus(null);
      setUploadProgress(null);
    }
  }

  function updateDocument(update: (document: CustomerDocument) => CustomerDocument) {
    setDocuments((items) => items.map((document, index) => (index === activeDocument ? update(document) : document)));
  }

  function updateRange(index: number, field: keyof PrintRange, value: string | number) {
    updateDocument((document) => ({
      ...document,
      ranges: document.ranges.map((range, rangeIndex) => {
        if (rangeIndex !== index) return range;
        if (field === "sideMode") {
          const allowDoubleSided = shop.allow_double_sided !== false;
          const sideValue = (!allowDoubleSided || document.pageCount <= 1) ? "single_sided" : value;
          return { ...range, sideMode: sideValue as "single_sided" | "double_sided" };
        }
        if (field === "startPage" || field === "endPage" || field === "copies") {
          if (value === "" || value === undefined || value === null) {
            return { ...range, [field]: "" as unknown as number };
          }
          const cleaned = String(value).replace(/[^0-9]/g, "");
          if (!cleaned) return { ...range, [field]: "" as unknown as number };
          const num = parseInt(cleaned, 10);
          return {
            ...range,
            [field]: isNaN(num) ? ("" as unknown as number) : num,
          };
        }
        return { ...range, [field]: value };
      }),
    }));
  }

  function addRange() {
    if (!current) return;
    const lastRange = current.ranges[current.ranges.length - 1];
    const defaultMode = lastRange?.colorMode ?? "black_and_white";
    const defaultSize = lastRange?.paperSize ?? "a4";
    const allowDoubleSided = shop.allow_double_sided !== false;
    const defaultSide = (!allowDoubleSided || current.pageCount <= 1) ? "single_sided" : (lastRange?.sideMode ?? "single_sided");
    const defaultCopies = lastRange?.copies ?? 1;
    updateDocument((document) => ({
      ...document,
      ranges: [
        ...document.ranges,
        {
          startPage: 1,
          endPage: document.pageCount,
          colorMode: defaultMode,
          paperSize: defaultSize,
          sideMode: defaultSide,
          copies: defaultCopies,
        },
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
      setError("An order needs at least one document. Upload another file first.");
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

  // Handle applied crop from ImageCropperModal
  async function handleApplyCrop(croppedBlob: Blob, croppedDataUrl: string) {
    if (cropTargetDocIndex === null) return;
    const targetDoc = documents[cropTargetDocIndex];
    if (!targetDoc) return;

    // Update local preview immediately
    setDocuments((docs) =>
      docs.map((doc, idx) =>
        idx === cropTargetDocIndex
          ? {
              ...doc,
              previewUrl: croppedDataUrl,
              croppedImageUrl: croppedDataUrl,
            }
          : doc
      )
    );

    // Re-upload cropped image in background to update normalized print PDF on server
    if (orderId && accessToken) {
      try {
        const croppedFile = new File([croppedBlob], targetDoc.filename || "image.jpg", {
          type: "image/jpeg",
        });
        const form = new FormData();
        form.append("shopIdentifier", identifier);
        form.append("orderId", orderId);
        form.append("accessToken", accessToken);
        form.append("files", croppedFile);

        const uploadRes = await safeFetchJson<{
          orderId: string;
          documents: CustomerDocument[];
        }>(
          await fetch("/api/customer/upload", {
            method: "POST",
            body: form,
          })
        );

        if (uploadRes.ok && uploadRes.data && uploadRes.data.documents.length > 0) {
          const updatedServerDoc = uploadRes.data.documents[uploadRes.data.documents.length - 1];
          setDocuments((docs) =>
            docs.map((doc, idx) =>
              idx === cropTargetDocIndex
                ? {
                    ...doc,
                    id: updatedServerDoc.id,
                    sizeBytes: updatedServerDoc.sizeBytes,
                  }
                : doc
            )
          );
        }
      } catch {
        // Fallback gracefully
      }
    }
  }

  // Handle multi-image page creation (compiles multiple photos onto 1 A4 page)
  async function handleApplyMultiImageSheet(
    blob: Blob,
    dataUrl: string,
    filename: string,
    usedDocInfo: { usedDocumentIds: string[]; usedFilenames: string[]; usedDataUrls: string[] }
  ) {
    const file = new File([blob], filename, { type: "image/jpeg" });

    setBusy(true);
    setUploadStatus("Uploading combined multi-photo print sheet...");
    try {
      const form = new FormData();
      form.append("shopIdentifier", identifier);
      if (orderId && accessToken) {
        form.append("orderId", orderId);
        form.append("accessToken", accessToken);
      }
      form.append("files", file);

      const uploadRes = await uploadWithProgress<{
        orderId: string;
        orderPublicId: string;
        accessToken: string;
        documents: CustomerDocument[];
      }>("/api/customer/upload", form, (percent) => {
        setUploadProgress(percent);
      });

      if (!uploadRes.ok || !uploadRes.data) {
        throw new Error(uploadRes.error || "Failed to upload combined print sheet.");
      }

      const newCombinedDoc = uploadRes.data.documents[uploadRes.data.documents.length - 1];
      const combinedCustomerDoc: CustomerDocument = {
        ...newCombinedDoc,
        filename: filename,
        pageCount: 1,
        isImage: true,
        isCombinedSheet: true,
        originalFile: file,
        previewUrl: dataUrl,
        ranges: [
          {
            startPage: 1,
            endPage: 1,
            colorMode: "black_and_white",
            paperSize: "a4",
            sideMode: "single_sided",
            copies: 1,
          },
        ],
      };

      // Identify consumed documents that were placed onto this sheet
      const usedIdSet = new Set(usedDocInfo.usedDocumentIds.filter(Boolean));
      const usedUrlSet = new Set(usedDocInfo.usedDataUrls.filter(Boolean));
      const usedNameSet = new Set(usedDocInfo.usedFilenames.filter(Boolean));

      const isDocUsed = (d: CustomerDocument) => {
        if (d.isCombinedSheet) return false; // Never remove already combined sheets!
        if (usedIdSet.has(d.id)) return true;
        if (d.previewUrl && usedUrlSet.has(d.previewUrl)) return true;
        if (usedIdSet.size === 0 && usedNameSet.has(d.filename)) return true;
        return false;
      };

      // Find index of the first consumed document so we can replace in place
      const firstConsumedIndex = documents.findIndex(isDocUsed);

      // Keep all non-consumed documents (remaining images + all PDFs)
      const remainingDocs = documents.filter((d) => !isDocUsed(d));

      let nextDocs: CustomerDocument[];
      if (firstConsumedIndex !== -1) {
        const insertAt = Math.min(firstConsumedIndex, remainingDocs.length);
        nextDocs = [
          ...remainingDocs.slice(0, insertAt),
          combinedCustomerDoc,
          ...remainingDocs.slice(insertAt),
        ];
      } else {
        nextDocs = [...remainingDocs, combinedCustomerDoc];
      }

      setDocuments(nextDocs);

      // Find the index of the newly added combined sheet
      const combinedIndex = nextDocs.findIndex((d) => d.id === combinedCustomerDoc.id);

      // Check if there are remaining uncombined images after the combined sheet
      const nextRemainingRawDocIndex = nextDocs.findIndex(
        (d, idx) =>
          idx > combinedIndex &&
          !d.isCombinedSheet &&
          !d.filename.startsWith("multi-photo-sheet-") &&
          (d.previewUrl || d.isImage || /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(d.filename))
      );

      // If there are subsequent uncombined images, automatically focus on the next uncombined image
      // so the user can immediately take action and combine the remaining pages!
      // Otherwise, focus on the newly created combined sheet.
      if (nextRemainingRawDocIndex !== -1) {
        setActiveDocument(nextRemainingRawDocIndex);
      } else if (combinedIndex !== -1) {
        setActiveDocument(combinedIndex);
      } else {
        setActiveDocument(Math.max(0, nextDocs.length - 1));
      }

      setOrderId(uploadRes.data.orderId);
      setAccessToken(uploadRes.data.accessToken);

      // Instant price snapshot
      if (pricingRules.length > 0) {
        try {
          const instant = calculatePricing(nextDocs.flatMap((d) => d.ranges), pricingRules, "customer_fee");
          setEstimate({
            total: instant.total,
            subtotal: instant.subtotal,
            platformFee: instant.platformFee,
            currency: "INR",
            totalPages: instant.totalPages,
            colorPages: instant.colorPages,
            blackAndWhitePages: instant.blackAndWhitePages,
          });
        } catch {
          // fallback
        }
      }

      setStep(1);
      void fetchEstimate(nextDocs, uploadRes.data.orderId, uploadRes.data.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply combined photo sheet.");
    } finally {
      setBusy(false);
      setUploadStatus(null);
      setUploadProgress(null);
    }
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

      // Save token in customer local browser storage (valid for 1+ hours & history)
      saveTokenToStorage({
        tokenNumber: counterData.data.tokenNumber,
        publicOrderId: counterData.data.publicOrderId,
        orderId,
        accessToken,
        shopIdentifier: identifier,
        shopName: shop.name,
        totalAmount: counterData.data.totalAmount,
        totalPages: counterData.data.totalPages,
        colorPages: counterData.data.colorPages,
        blackAndWhitePages: counterData.data.blackAndWhitePages,
        createdAt: new Date().toISOString(),
        expiresAt: counterData.data.expiresAt,
        documentNames: documents.map((d) => d.filename),
      });

      // Advance to Step 4: Counter Token
      setStep(4);
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

      // Advance to Step 3: Online Payment
      setStep(3);
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
    <div className="mt-2.5 sm:mt-8 space-y-3.5 sm:space-y-6 pb-20 sm:pb-0">
      {/* Header Bar with Shop Name & Print History / Saved Tokens Button */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <Store className="size-3.5 text-emerald-600 shrink-0" />
          <span className="truncate max-w-[200px] sm:max-w-xs">{shop.name}</span>
        </div>
        {savedTokens.length > 0 && (
          <button
            type="button"
            onClick={() => setHistoryModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/90 px-2.5 py-1 text-[11px] sm:text-xs font-bold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300 transition active:scale-95 cursor-pointer shadow-2xs"
          >
            <History className="size-3.5 text-emerald-600" />
            <span>Print History ({savedTokens.length})</span>
          </button>
        )}
      </div>

      {/* Active Token Recovery Banner on Step 0 */}
      {step === 0 && activeTokenForShop && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 sm:p-4 text-emerald-950 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white font-black font-mono shadow-xs text-sm sm:text-base">
              #{activeTokenForShop.tokenNumber}
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                Active Token #{activeTokenForShop.tokenNumber} in progress
              </p>
              <p className="text-[11px] text-emerald-700 flex items-center gap-1">
                <Clock3 className="size-3 shrink-0" />
                <span>
                  Expires in {Math.max(1, Math.round((new Date(activeTokenForShop.expiresAt).getTime() - nowSnapshot) / 60000))}m · ₹{activeTokenForShop.totalAmount.toFixed(2)}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => restoreSavedToken(activeTokenForShop)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition active:scale-95 shadow-xs cursor-pointer shrink-0"
          >
            <span>View Token</span>
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      )}

      {/* 4-Stage Step Progress Indicator (Desktop Only - Hidden on Mobile for direct preview flow) */}
      <div className="hidden sm:block">
        <StepIndicator step={step} />
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {/* Stage 0: Upload Document */}
      {step === 0 ? (
        <UploadStep
          busy={busy}
          uploadStatus={uploadStatus}
          uploadProgress={uploadProgress}
          failedFiles={failedFiles}
          onClearFailedFile={(filename) => {
            setFailedFiles((prev) => {
              const next = { ...prev };
              delete next[filename];
              return next;
            });
            setError(null);
          }}
          onSubmit={(files) => uploadFiles(files, false)}
          onOpenMultiImage={() => handleOpenMultiImage()}
          shop={shop}
        />
      ) : null}

      {/* Stage 1: Configure & Crop Options */}
      {step === 1 && current ? (
        <>
          {resumedFromWhatsApp && (
            <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs text-emerald-950 font-medium shadow-xs">
              <span className="flex size-7 items-center justify-center rounded-xl bg-emerald-600 text-white font-black text-[11px] shrink-0 shadow-xs">
                WA
              </span>
              <div className="flex-1">
                <p className="font-bold text-emerald-900 text-[13px]">Document received via WhatsApp!</p>
                <p className="text-emerald-800 text-[11.5px] mt-0.5">
                  Choose your page count, color/B&amp;W, single/both sides, and copies below.
                </p>
              </div>
            </div>
          )}
          <ConfigureAndCropStep
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
            onContinueToPreview={() => setStep(2)}
            onOpenCropper={(docIndex) => {
              setCropTargetDocIndex(docIndex);
              setCropperOpen(true);
            }}
            onOpenMultiImage={(docIndex, defaultPreset) => handleOpenMultiImage(docIndex, defaultPreset)}
            onAddMoreFiles={(files) => uploadFiles(files, true)}
            orderId={orderId}
            accessToken={accessToken}
            onProceedToPay={handleProceedToPay}
            onProceedToCounterToken={handleProceedToCounterToken}
            selectedMode={selectedMode}
            setSelectedMode={setSelectedMode}
          />
        </>
      ) : null}

      {/* Stage 2: Print Preview & Review */}
      {step === 2 && current ? (
        <PrintPreviewStep
          shop={shop}
          documents={documents}
          activeDocument={activeDocument}
          setActiveDocument={setActiveDocument}
          estimate={estimate}
          busy={busy}
          onBackToConfigure={() => setStep(1)}
          onProceedToPay={handleProceedToPay}
          onProceedToCounterToken={handleProceedToCounterToken}
          selectedMode={selectedMode}
          setSelectedMode={setSelectedMode}
        />
      ) : null}

      {/* Stage 3: Online Payment */}
      {step === 3 && orderId && estimate ? (
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

      {/* Stage 4: Counter Token Queue */}
      {step === 4 && tokenDetails && orderId ? (
        <CounterTokenStep
          tokenDetails={tokenDetails}
          shop={shop}
          orderId={orderId}
          accessToken={accessToken}
          documents={documents}
          onReset={resetOrder}
        />
      ) : null}

      {/* Image Cropper Modal */}
      {cropperOpen && cropTargetDocIndex !== null && documents[cropTargetDocIndex] && (
        <ImageCropperModal
          isOpen={cropperOpen}
          imageUrl={
            documents[cropTargetDocIndex].previewUrl ||
            (orderId && accessToken
              ? `/api/customer/document-preview?documentId=${documents[cropTargetDocIndex].id}&orderId=${orderId}&token=${accessToken}`
              : "")
          }
          filename={documents[cropTargetDocIndex].filename}
          onClose={() => {
            setCropperOpen(false);
            setCropTargetDocIndex(null);
          }}
          onApplyCrop={handleApplyCrop}
          onSwitchToMultiImage={() => {
            setCropperOpen(false);
            handleOpenMultiImage(cropTargetDocIndex, "grid-2-vert");
          }}
        />
      )}

      {/* Multi-Image Page Layout Modal (Multiple Photos on 1 Page) */}
      {multiImageModalOpen && (
        <MultiImagePageModal
          isOpen={multiImageModalOpen}
          initialPreset={multiImageInitialPreset}
          initialImages={multiImageInitialImages}
          existingDocImages={existingDocImages}
          onClose={() => {
            setMultiImageModalOpen(false);
            setMultiImageInitialImages([]);
          }}
          onApply={handleApplyMultiImageSheet}
        />
      )}

      {/* Print History & Stored Tokens Modal */}
      {historyModalOpen && (
        <RecentTokensModal
          isOpen={historyModalOpen}
          onClose={() => setHistoryModalOpen(false)}
          tokens={savedTokens}
          onSelectToken={(t) => {
            restoreSavedToken(t);
            setHistoryModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  // 2 clean stages: 0 = Upload, 1+ = Configure & Print
  const displayStep = step >= 1 ? 1 : 0;

  const stepList = [
    { short: "Upload", full: "1. Upload Documents" },
    { short: "Configure & Print", full: "2. Configure & Print" },
  ];

  return (
    <div className="relative rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-sm p-1.5 sm:p-2 shadow-xs">
      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
        {stepList.map((item, index) => {
          const isCurrent = displayStep === index;
          const isCompleted = displayStep > index;
          return (
            <div
              className={cn(
                "relative flex items-center justify-center gap-1 sm:gap-2 rounded-xl py-1.5 px-1 sm:py-2.5 sm:px-3 text-center text-[10px] sm:text-xs font-bold transition-all select-none min-w-0",
                isCurrent
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/20 ring-1 ring-emerald-500"
                  : isCompleted
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-slate-50 text-slate-400 border border-slate-200/60"
              )}
              key={item.full}
            >
              {isCompleted ? (
                <CheckCircle2 className="size-3.5 sm:size-4 text-emerald-600 shrink-0" />
              ) : (
                <span
                  className={cn(
                    "flex size-4 sm:size-5 shrink-0 items-center justify-center rounded-full text-[9px] sm:text-[11px] font-black transition-colors",
                    isCurrent ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                  )}
                >
                  {index + 1}
                </span>
              )}
              <span className="truncate">
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.full}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UploadStep({
  shop,
  busy,
  uploadStatus,
  uploadProgress,
  failedFiles = {},
  onClearFailedFile,
  onSubmit,
}: {
  shop: PublicShop;
  busy: boolean;
  uploadStatus: string | null;
  uploadProgress: number | null;
  failedFiles?: Record<string, string>;
  onClearFailedFile?: (filename: string) => void;
  onSubmit: (files: File[]) => void;
  onOpenMultiImage?: () => void;
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
    <Card className="overflow-hidden border-slate-200/80 bg-white p-4 sm:p-7 shadow-lg shadow-slate-900/5 rounded-2xl sm:rounded-3xl">
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
            "group relative flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl sm:rounded-3xl border-2 border-dashed p-6 text-center transition-all duration-300",
            isDragging
              ? "border-emerald-600 bg-emerald-50 ring-4 ring-emerald-500/20 scale-[1.01]"
              : selectedFiles.length > 0
              ? "border-slate-300 bg-slate-50/50 hover:border-emerald-600 hover:bg-emerald-50/30"
              : "border-emerald-400 bg-emerald-50/40 hover:border-emerald-600 hover:bg-emerald-50/70 shadow-xs"
          )}
        >
          {/* Solid Emerald Icon */}
          <div className="flex size-14 sm:size-16 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 transition-transform group-hover:scale-105">
            <FileUp className="size-7 sm:size-8" />
          </div>

          <p className="mt-3.5 text-base sm:text-lg font-black text-slate-900 tracking-tight">
            {isDragging
              ? "Drop documents here to upload!"
              : selectedFiles.length > 0
              ? "Add more files or configure below"
              : "Tap to Choose Document or Take Photo"}
          </p>
          <p className="mt-1 text-xs text-slate-500 max-w-md leading-relaxed">
            Drag &amp; drop files here or use the buttons below. Supports PDF, Photos (JPG/PNG), Word documents up to 25MB.
          </p>

          {/* Direct Action Buttons Inside Zone */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-700 transition active:scale-95 cursor-pointer"
            >
              <FileUp className="size-4" />
              <span>Browse Files</span>
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 shadow-xs transition hover:bg-slate-50 hover:border-emerald-600 hover:text-emerald-700 active:scale-95 cursor-pointer"
            >
              <Camera className="size-4 text-emerald-600" />
              <span>Scan with Camera</span>
            </button>
          </div>
        </div>

        {/* Selected Files List */}
        {selectedFiles.length > 0 ? (
          <div className="mt-4 space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-600" />
                {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} ready to upload
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition cursor-pointer"
              >
                <Plus className="size-3.5" /> Add more
              </button>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {selectedFiles.map((file, idx) => {
                const ext = file.name.slice(file.name.lastIndexOf(".")).toUpperCase();
                const isPdf = ext === ".PDF";
                const isImg = [".PNG", ".JPG", ".JPEG", ".WEBP"].includes(ext);
                const fileError = failedFiles[file.name];

                return (
                  <div
                    key={`${file.name}-${idx}`}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border p-3 text-xs transition",
                      fileError
                        ? "border-rose-300 bg-rose-50/80 ring-2 ring-rose-400/20"
                        : "border-slate-200 bg-slate-50/70 hover:bg-white hover:border-slate-300 hover:shadow-xs"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 truncate pr-2">
                        <span
                          className={cn(
                            "rounded-lg px-2 py-1 text-[10px] font-black uppercase shrink-0 tracking-wider",
                            fileError
                              ? "bg-rose-200 text-rose-800"
                              : isPdf
                              ? "bg-rose-100 text-rose-700"
                              : isImg
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-blue-100 text-blue-700"
                          )}
                        >
                          {ext.replace(".", "") || "DOC"}
                        </span>
                        <span className={cn("truncate font-semibold", fileError ? "text-rose-900 line-through decoration-rose-400" : "text-slate-800")}>
                          {file.name}
                        </span>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          ({(file.size / 1024 / 1024).toFixed(1)} MB)
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onClearFailedFile?.(file.name);
                          setSelectedFiles((files) => files.filter((_, i) => i !== idx));
                        }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-700 transition cursor-pointer shrink-0"
                        aria-label="Remove file"
                        title="Remove file"
                      >
                        <Trash2 className={cn("size-4", fileError ? "text-rose-600" : "text-slate-400")} />
                      </button>
                    </div>

                    {fileError && (
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-600 pl-0.5">
                        <AlertCircle className="size-3.5 shrink-0 text-rose-600" />
                        <span className="truncate">{fileError} (Click trash icon to remove)</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedFiles.some((f) => /\.(docx?|odt|rtf|pptx?|xlsx?)$/i.test(f.name)) && (
              <div className="flex items-start gap-2.5 rounded-xl bg-blue-50/80 p-3 text-xs text-blue-900 border border-blue-200/70">
                <Info className="size-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Layout tip:</strong> Word documents are automatically prepared for printing. For 100% exact fonts and margins as seen on your screen, uploading as <strong>PDF</strong> is recommended.
                </span>
              </div>
            )}
          </div>
        ) : null}

        {/* PRIMARY CONTINUE BUTTON */}
        <div className="mt-5 space-y-3">
          {busy && (
            <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                <span className="flex items-center gap-2">
                  <LoaderCircle className="size-4 animate-spin text-emerald-600" />
                  {uploadStatus || "Uploading & preparing documents..."}
                </span>
                {uploadProgress !== null && <span>{uploadProgress}%</span>}
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-emerald-100">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all duration-200"
                  style={{ width: `${uploadProgress ?? 100}%` }}
                />
              </div>
            </div>
          )}

          {selectedFiles.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 px-6 py-4 text-base font-bold text-white shadow-sm shadow-emerald-900/20 transition-all hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer"
            >
              <FileUp className="size-5" />
              <span>Select Document to Continue</span>
              <ArrowRight className="size-4 opacity-80" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 px-6 py-4 text-base font-bold text-white shadow-sm shadow-emerald-900/20 transition-all hover:bg-emerald-700 active:bg-emerald-800 cursor-pointer disabled:opacity-60 disabled:pointer-events-none"
            >
              {busy ? (
                <>
                  <LoaderCircle className="size-5 animate-spin" />
                  <span>{uploadStatus || "Uploading & Analyzing Pages..."}</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-5 text-emerald-200" />
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

function ConfigureAndCropStep({
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
  onContinueToPreview,
  onOpenCropper,
  onOpenMultiImage,
  onAddMoreFiles,
  orderId,
  accessToken,
  onProceedToPay,
  onProceedToCounterToken,
  selectedMode,
  setSelectedMode,
}: {
  shop: PublicShop;
  documents: CustomerDocument[];
  current: CustomerDocument;
  activeDocument: number;
  setActiveDocument: (index: number) => void;
  updateRange: (index: number, field: keyof PrintRange, value: string | number) => void;
  addRange: () => void;
  removeRange: (index: number) => void;
  removeDocument: (index: number) => void;
  allValid: boolean;
  busy: boolean;
  estimate?: Estimate | null;
  onContinueToPreview: () => void;
  onOpenCropper: (docIndex: number) => void;
  onOpenMultiImage: (initialDocIndex?: number, defaultPreset?: LayoutTemplate) => void;
  onAddMoreFiles: (files: File[]) => void;
  orderId?: string | null;
  accessToken?: string | null;
  onProceedToPay?: () => void;
  onProceedToCounterToken?: () => void;
  selectedMode?: "counter" | "online";
  setSelectedMode?: (mode: "counter" | "online") => void;
}) {
  const rangeError = validateRanges(current.ranges, current.pageCount);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const shopPaymentMode = shop.payment_mode || "both";

  const fallbackTotalPages = documents.reduce((sum, doc) => {
    const docPages = doc.ranges.reduce((acc, r) => {
      const start = Number(r.startPage) || 1;
      const end = Number(r.endPage) || start;
      const span = Math.max(0, end - start + 1);
      return acc + span * Math.max(1, Number(r.copies) || 1);
    }, 0);
    return sum + docPages;
  }, 0);

  const displayTotalAmount =
    estimate && estimate.total > 0
      ? estimate.total.toFixed(2)
      : (fallbackTotalPages * 5).toFixed(2);

  const requestsColorMode = documents.some((doc) => doc.ranges.some((r) => r.colorMode === "color"));
  const colorPrinterUnavailable = requestsColorMode && shop.color_printer_status !== "ready";
  const isImageDoc = current.isImage || Boolean(current.filename.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/i)) || Boolean(current.previewUrl);
  const isCurrentCombinedSheet = Boolean(current.isCombinedSheet || current.filename.startsWith("multi-photo-sheet-"));
  const uncombinedImageDocuments = documents.filter(
    (d) =>
      !d.isCombinedSheet &&
      !d.filename.startsWith("multi-photo-sheet-") &&
      (d.isImage || Boolean(d.previewUrl) || Boolean(d.filename.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/i)))
  );
  const hasMultipleImages = uncombinedImageDocuments.length >= 2;
  const hasAnyImages = uncombinedImageDocuments.length >= 1;

  // Build live preview map reflecting user's currently selected configuration
  const includedPagesMap = useMemo(() => {
    const map = new Map<number, { colorMode: string; sideMode: string; copies: number }>();
    if (current) {
      current.ranges.forEach((r) => {
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
  }, [current]);

  const totalPagesInDoc = current ? current.pageCount : 1;
  const pagesList = useMemo(() => Array.from({ length: totalPagesInDoc }, (_, i) => i + 1), [totalPagesInDoc]);

  const [selectedPreviewPage, setSelectedPreviewPage] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [activeScrolledPage, setActiveScrolledPage] = useState(1);

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
  }, [checkScroll, activeDocument, totalPagesInDoc]);

  const scrollByDirection = (direction: "left" | "right") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = Math.max(el.clientWidth * 0.75, 200);
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

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
    const handlePopState = () => {
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

  const docPreviewUrl =
    current.previewUrl ||
    (orderId && accessToken
      ? `/api/customer/document-preview?documentId=${current.id}&orderId=${orderId}&token=${accessToken}`
      : "");

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Offline Warnings */}
      {colorPrinterUnavailable ? (
        <Alert tone="warning" title="Color Printer Currently Offline">
          The shop&apos;s Color Printer is offline. Please change your document print mode to &quot;Black &amp; White&quot; to print immediately.
        </Alert>
      ) : null}

      {/* TOP: Live Document & Sheet Preview */}
      <Card className="p-3.5 sm:p-6 border-slate-200/80 bg-white shadow-lg shadow-slate-900/5 rounded-2xl sm:rounded-3xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs">
              <Eye className="size-4" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                Document Preview
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500">
                {current ? current.filename : "Uploaded Document"} · {includedPagesMap.size} of {current.pageCount}p selected
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {totalPagesInDoc > 2 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!canScrollLeft}
                  onClick={() => scrollByDirection("left")}
                  className="flex size-6 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition shadow-2xs cursor-pointer"
                  title="Scroll left"
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!canScrollRight}
                  onClick={() => scrollByDirection("right")}
                  className="flex size-6 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition shadow-2xs cursor-pointer"
                  title="Scroll right"
                  aria-label="Scroll right"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            )}
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-semibold flex items-center gap-0.5">
              <ZoomIn className="size-3 text-emerald-600" /> Tap to zoom
            </span>
          </div>
        </div>

        {/* Horizontal Scrollable Sheet Strip */}
        <div className="relative group/carousel">
          {canScrollLeft && (
            <div className="pointer-events-none absolute left-0 top-0 bottom-2 z-10 w-6 bg-gradient-to-r from-white via-white/80 to-transparent rounded-l-2xl" />
          )}

          <div
            ref={scrollContainerRef}
            className="flex gap-2.5 sm:gap-3 overflow-x-auto pb-2 pt-1 px-1 snap-x snap-mandatory scroll-smooth no-scrollbar touch-pan-x"
          >
            {pagesList.map((pageNum) => {
              const config = includedPagesMap.get(pageNum);
              const isIncluded = Boolean(config);
              const isColor = config?.colorMode === "color";
              const isDuplex = config?.sideMode === "double_sided";

              return (
                <div
                  key={`page-preview-${pageNum}`}
                  onClick={() => openFullscreenPreview(pageNum)}
                  className={cn(
                    "group relative flex flex-col justify-between rounded-2xl border-2 p-2 sm:p-2.5 transition-all duration-150 cursor-pointer active:scale-97 hover:shadow-md shrink-0 snap-start select-none",
                    totalPagesInDoc === 1
                      ? "w-[170px] sm:w-[190px]"
                      : "w-[calc(50%-5px)] min-w-[130px] max-w-[160px] sm:w-[155px]",
                    isIncluded
                      ? "border-emerald-500 bg-white shadow-xs ring-1 ring-emerald-500/20"
                      : "border-slate-200 bg-slate-50/80 opacity-60"
                  )}
                >
                  {/* Sheet Header Badge */}
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[9.5px] font-black shrink-0",
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
                          "rounded-md px-1.5 py-0.5 text-[8.5px] font-bold truncate",
                          isColor
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200/80"
                            : "bg-slate-100 text-slate-700 border border-slate-200/60"
                        )}
                      >
                        {isColor ? "🎨 Color" : "📄 B&W"}
                      </span>
                    ) : (
                      <span className="text-[8.5px] font-bold text-slate-400">
                        Skipped
                      </span>
                    )}
                  </div>

                  {/* Simulated Paper Graphic / Image Preview */}
                  <div
                    className={cn(
                      "my-1.5 flex aspect-[1/1.25] w-full items-center justify-center rounded-xl bg-white border shadow-inner p-1 text-center overflow-hidden transition-all group-hover:border-emerald-500",
                      isIncluded && !isColor ? "border-slate-300 bg-slate-50" : "border-slate-200/90"
                    )}
                  >
                    {docPreviewUrl && (totalPagesInDoc === 1 || isImageDoc) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={docPreviewUrl}
                        alt={`Page ${pageNum} preview`}
                        className={cn(
                          "max-h-full max-w-full object-contain rounded-sm transition-all",
                          isIncluded && !isColor && "grayscale contrast-105 brightness-95"
                        )}
                        style={isIncluded && !isColor ? { filter: "grayscale(100%) contrast(1.1) brightness(0.96)" } : undefined}
                      />
                    ) : (
                      <div className="space-y-0.5 text-slate-400">
                        <FileText
                          className={cn(
                            "size-5 sm:size-6 mx-auto transition-colors",
                            isIncluded ? (isColor ? "text-emerald-600" : "text-slate-600") : "text-slate-300"
                          )}
                        />
                        <span className={cn("block text-[9.5px] font-bold", isIncluded ? (isColor ? "text-emerald-900" : "text-slate-700") : "text-slate-600")}>
                          Page #{pageNum}
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
                  <div className="flex items-center justify-between border-t border-slate-100 pt-1 text-[9px]">
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
      </Card>

      {/* 1. Document Configuration Card (Below Preview) */}
      <Card className="p-4 sm:p-7 border-slate-200/80 bg-white shadow-lg shadow-slate-900/5 rounded-2xl sm:rounded-3xl">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-slate-900">
              Configure Print Settings
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500">
              Set page ranges, copies, color options, and paper format.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] sm:text-xs font-bold text-emerald-800 border border-emerald-200/60">
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
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-emerald-500 transition active:scale-95 cursor-pointer"
            >
              <Plus className="size-3.5 text-emerald-600" /> Add File
            </button>
          </div>
        </div>

        {/* Tab switcher for multiple documents */}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1.5 no-scrollbar">
          {documents.map((document, index) => (
            <button
              key={document.id}
              onClick={() => setActiveDocument(index)}
              className={cn(
                "flex items-center gap-2 shrink-0 rounded-xl border px-3.5 py-2 text-left text-xs transition-all cursor-pointer select-none",
                index === activeDocument
                  ? "border-emerald-600 bg-emerald-50 font-bold text-emerald-950 shadow-xs ring-1 ring-emerald-500/30"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              <FileText className={cn("size-3.5 shrink-0", index === activeDocument ? "text-emerald-600" : "text-slate-400")} />
              <span className="max-w-28 sm:max-w-36 truncate">{document.filename}</span>
              <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200/60">
                {document.pageCount}p
              </span>
            </button>
          ))}
        </div>

        {/* MULTIPLE PHOTOS ON SAME PAGE FEATURE (DESKTOP/TABLET ONLY - HIDDEN ON MOBILE) */}
        {hasAnyImages && (
          <div className="hidden md:block mt-4 rounded-2xl border border-emerald-300/80 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-emerald-50/70 p-4 sm:p-5 shadow-xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 sm:size-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                  <LayoutGrid className="size-4 sm:size-5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-emerald-950 flex items-center gap-2">
                    Multiple Photos on Same Page
                    <span className="rounded-full bg-emerald-600 text-white text-[9px] sm:text-[10px] font-black px-2 py-0.5">
                      Save Paper &amp; Cost
                    </span>
                  </h3>
                  <p className="text-[11px] text-emerald-800">
                    {hasMultipleImages
                      ? `Select a layout preset to fit your ${uncombinedImageDocuments.length} remaining uploaded photos onto 1 single A4 page.`
                      : "Select a layout preset to print multiple copies or passport photos onto 1 single A4 page."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenMultiImage(activeDocument, "grid-2-vert")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition active:scale-95 cursor-pointer"
              >
                <Sparkles className="size-3.5" />
                <span>Custom Sheet Editor</span>
              </button>
            </div>

            {/* Quick Layout Presets Selection Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
              {/* Preset 1: 2 Photos Stacked (ID Card Front & Back) */}
              <button
                type="button"
                onClick={() => onOpenMultiImage(activeDocument, "grid-2-vert")}
                className="flex flex-col items-start rounded-xl border border-emerald-200/90 bg-white p-2.5 text-left transition hover:border-emerald-500 hover:shadow-xs hover:bg-emerald-50/60 active:scale-95 cursor-pointer group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                    2 Stacked (ID Card)
                  </span>
                  <span className="rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2">
                    2 Slots
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                  Top &amp; Bottom (Front &amp; Back)
                </p>
              </button>

              {/* Preset 2: 2 Photos Side-by-Side */}
              <button
                type="button"
                onClick={() => onOpenMultiImage(activeDocument, "grid-2-horiz")}
                className="flex flex-col items-start rounded-xl border border-emerald-200/90 bg-white p-2.5 text-left transition hover:border-emerald-500 hover:shadow-xs hover:bg-emerald-50/60 active:scale-95 cursor-pointer group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                    2 Side-by-Side
                  </span>
                  <span className="rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2">
                    2 Slots
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                  Left &amp; Right columns
                </p>
              </button>

              {/* Preset 3: 4 Photos Grid (2x2) */}
              <button
                type="button"
                onClick={() => onOpenMultiImage(activeDocument, "grid-4")}
                className="flex flex-col items-start rounded-xl border border-emerald-200/90 bg-white p-2.5 text-left transition hover:border-emerald-500 hover:shadow-xs hover:bg-emerald-50/60 active:scale-95 cursor-pointer group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                    4 Photos (2×2)
                  </span>
                  <span className="rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2">
                    4 Slots
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                  {uncombinedImageDocuments.length >= 4 ? "Auto-fills 4 batch photos" : "4 equal quadrants"}
                </p>
              </button>

              {/* Preset 4: 6 Photos Grid (2x3) */}
              <button
                type="button"
                onClick={() => onOpenMultiImage(activeDocument, "grid-6")}
                className="flex flex-col items-start rounded-xl border border-emerald-200/90 bg-white p-2.5 text-left transition hover:border-emerald-500 hover:shadow-xs hover:bg-emerald-50/60 active:scale-95 cursor-pointer group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                    6 Photos (2×3)
                  </span>
                  <span className="rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2">
                    6 Slots
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                  2 columns × 3 rows
                </p>
              </button>

              {/* Preset 5: 8 Photos Grid (2x4) */}
              <button
                type="button"
                onClick={() => onOpenMultiImage(activeDocument, "grid-8")}
                className="flex flex-col items-start rounded-xl border border-emerald-200/90 bg-white p-2.5 text-left transition hover:border-emerald-500 hover:shadow-xs hover:bg-emerald-50/60 active:scale-95 cursor-pointer group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                    8 Photos (2×4)
                  </span>
                  <span className="rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2">
                    8 Slots
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                  2 columns × 4 rows
                </p>
              </button>

              {/* Preset 6: 8 Passports */}
              <button
                type="button"
                onClick={() => onOpenMultiImage(activeDocument, "passport-8")}
                className="flex flex-col items-start rounded-xl border border-emerald-200/90 bg-white p-2.5 text-left transition hover:border-emerald-500 hover:shadow-xs hover:bg-emerald-50/60 active:scale-95 cursor-pointer group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                    8 Passports
                  </span>
                  <span className="rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2">
                    8 Slots
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                  Standard 3.5×4.5cm photos
                </p>
              </button>

              {/* Preset 7: 16 Passports */}
              <button
                type="button"
                onClick={() => onOpenMultiImage(activeDocument, "passport-16")}
                className="flex flex-col items-start rounded-xl border border-emerald-200/90 bg-white p-2.5 text-left transition hover:border-emerald-500 hover:shadow-xs hover:bg-emerald-50/60 active:scale-95 cursor-pointer group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                    16 Passports
                  </span>
                  <span className="rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2">
                    16 Slots
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                  Full A4 passport sheet
                </p>
              </button>

              {/* Preset 8: Custom Canvas */}
              <button
                type="button"
                onClick={() => onOpenMultiImage(activeDocument, "custom")}
                className="flex flex-col items-start rounded-xl border border-dashed border-emerald-300 bg-white p-2.5 text-left transition hover:border-emerald-600 hover:shadow-xs hover:bg-emerald-50/60 active:scale-95 cursor-pointer group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                    Custom Layout
                  </span>
                  <span className="rounded-md bg-slate-100 text-slate-700 text-[9px] font-bold px-1.5 py-0.2">
                    Freeform
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-1">
                  Drag &amp; position freely
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Active Document Details Box */}
        <div className="mt-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-slate-200/70">
            <div className="min-w-0 max-w-[65%]">
              <div className="flex items-center gap-2">
                <p className="font-bold text-slate-900 text-xs sm:text-base truncate">{current.filename}</p>
                {isCurrentCombinedSheet && (
                  <span className="rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 border border-emerald-300 shrink-0">
                    Combined Sheet
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span>{(current.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                <span>•</span>
                <span>{current.pageCount} {current.pageCount === 1 ? "page" : "pages"} in original document</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Crop & Multi-Image Action Buttons for Image uploads */}
              {isImageDoc && (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenCropper(activeDocument)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 transition active:scale-95 cursor-pointer"
                  >
                    <Crop className="size-3.5 text-emerald-700" />
                    <span className="hidden sm:inline">Crop Image</span>
                    <span className="sm:hidden">Crop</span>
                  </button>

                  {!isCurrentCombinedSheet && (
                    <button
                      type="button"
                      onClick={() => onOpenMultiImage(activeDocument, "grid-2-vert")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-900 shadow-2xs hover:bg-blue-100 transition active:scale-95 cursor-pointer"
                    >
                      <LayoutGrid className="size-3.5 text-blue-700" />
                      <span className="hidden sm:inline">Combine on 1 Page</span>
                      <span className="sm:hidden">Combine</span>
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                disabled={documents.length <= 1}
                onClick={() => removeDocument(activeDocument)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40 transition cursor-pointer"
                title="Remove this document"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Page Presets Bar */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Quick Presets:</span>
            <button
              type="button"
              onClick={() => {
                updateRange(0, "startPage", 1);
                updateRange(0, "endPage", current.pageCount);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition active:scale-95 cursor-pointer"
            >
              All Pages (1–{current.pageCount})
            </button>
            <button
              type="button"
              onClick={() => {
                updateRange(0, "startPage", 1);
                updateRange(0, "endPage", 1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition active:scale-95 cursor-pointer"
            >
              Page 1 Only
            </button>
            {current.pageCount >= 2 && (
              <button
                type="button"
                onClick={() => {
                  updateRange(0, "startPage", 2);
                  updateRange(0, "endPage", current.pageCount);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition active:scale-95 cursor-pointer"
              >
                Pages 2–{current.pageCount}
              </button>
            )}
          </div>

          {/* Page Ranges List */}
          {current.ranges.map((range, index) => {
            const startNum = Number(range.startPage) || 1;
            const endNum = Number(range.endPage) || startNum;
            const copiesNum = Number(range.copies) || 1;
            const pageSpan = Math.max(0, endNum - startNum + 1);
            const rangePrintedPages = pageSpan * copiesNum;
            const isColor = range.colorMode === "color";
            const isDoubleSided = range.sideMode === "double_sided";

            return (
              <div
                key={`${current.id}-${index}`}
                className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-2xs space-y-4"
              >
                {/* 1. From, To, Copies Stepper */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <label className="text-xs font-bold text-slate-700">
                    From Page
                    <input
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-2 sm:px-3 text-center sm:text-left text-sm font-bold text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                      min="1"
                      max={current.pageCount}
                      type="number"
                      placeholder="1"
                      value={range.startPage}
                      onChange={(event) => updateRange(index, "startPage", event.target.value)}
                      onBlur={() => {
                        if (!range.startPage || Number(range.startPage) < 1) {
                          updateRange(index, "startPage", 1);
                        }
                      }}
                    />
                  </label>

                  <label className="text-xs font-bold text-slate-700">
                    To Page
                    <input
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-2 sm:px-3 text-center sm:text-left text-sm font-bold text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                      min="1"
                      max={current.pageCount}
                      type="number"
                      placeholder={String(current.pageCount)}
                      value={range.endPage}
                      onChange={(event) => updateRange(index, "endPage", event.target.value)}
                      onBlur={() => {
                        if (!range.endPage || Number(range.endPage) < 1) {
                          updateRange(index, "endPage", current.pageCount);
                        }
                      }}
                    />
                  </label>

                  {/* Copies Stepper */}
                  <div className="text-xs font-bold text-slate-700">
                    <span>Copies</span>
                    <div className="mt-1 flex h-11 items-center rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                      <button
                        type="button"
                        onClick={() => updateRange(index, "copies", Math.max(1, copiesNum - 1))}
                        disabled={copiesNum <= 1}
                        className="flex h-full w-9 sm:w-10 items-center justify-center bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition font-bold text-lg select-none cursor-pointer"
                      >
                        -
                      </button>
                      <input
                        className="h-full w-full min-w-0 border-0 text-center text-sm font-black text-slate-900 focus:ring-0 focus:outline-none"
                        min="1"
                        max="100"
                        type="number"
                        placeholder="1"
                        value={range.copies}
                        onChange={(event) => updateRange(index, "copies", event.target.value)}
                        onBlur={() => {
                          if (!range.copies || Number(range.copies) < 1) {
                            updateRange(index, "copies", 1);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => updateRange(index, "copies", copiesNum + 1)}
                        className="flex h-full w-9 sm:w-10 items-center justify-center bg-slate-50 text-slate-700 hover:bg-slate-100 transition font-bold text-lg select-none cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Tactile Color Mode Selector Cards */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Print Color Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* B&W Card */}
                    <button
                      type="button"
                      onClick={() => updateRange(index, "colorMode", "black_and_white")}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all cursor-pointer select-none",
                        !isColor
                          ? "border-slate-800 bg-slate-900 text-white shadow-md shadow-slate-900/15 ring-2 ring-slate-800/20"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <div className={cn(
                        "flex size-8 items-center justify-center rounded-lg shrink-0",
                        !isColor ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                      )}>
                        <FileText className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold truncate">Black &amp; White</p>
                        <p className={cn("text-[10px] truncate", !isColor ? "text-slate-300" : "text-slate-400")}>
                          Standard text &amp; docs
                        </p>
                      </div>
                      {!isColor && <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />}
                    </button>

                    {/* Color Card */}
                    <button
                      type="button"
                      disabled={shop.color_printer_status !== "ready"}
                      onClick={() => updateRange(index, "colorMode", "color")}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all cursor-pointer select-none",
                        shop.color_printer_status !== "ready"
                          ? "opacity-50 border-slate-200 bg-slate-50 cursor-not-allowed"
                          : isColor
                          ? "border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-900/20 ring-2 ring-emerald-500/30"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <div className={cn(
                        "flex size-8 items-center justify-center rounded-lg shrink-0",
                        isColor ? "bg-white/20 text-white" : "bg-emerald-50 text-emerald-600"
                      )}>
                        <Palette className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold truncate">Full Color</p>
                        <p className={cn("text-[10px] truncate", isColor ? "text-emerald-100" : "text-slate-400")}>
                          {shop.color_printer_status !== "ready" ? "Printer Offline" : "Vibrant photos & charts"}
                        </p>
                      </div>
                      {isColor && <CheckCircle2 className="size-4 text-amber-300 shrink-0" />}
                    </button>
                  </div>
                </div>

                {/* 3. Tactile Side / Duplex Mode Selector Cards (Only shown if shop allows double-sided printing) */}
                {shop.allow_double_sided !== false && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Paper Sides (Duplex)
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {/* Single Sided */}
                      <button
                        type="button"
                        onClick={() => updateRange(index, "sideMode", "single_sided")}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all cursor-pointer select-none",
                          !isDoubleSided
                            ? "border-emerald-600 bg-emerald-50/90 text-emerald-950 font-bold shadow-2xs ring-1 ring-emerald-500/30"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <div className="flex size-7 items-center justify-center rounded-lg bg-white text-slate-700 shadow-2xs shrink-0">
                          <FileText className="size-3.5 text-emerald-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold truncate">1-Sided (Single)</p>
                          <p className="text-[10px] text-slate-500 truncate">Front only</p>
                        </div>
                      </button>

                      {/* Double Sided */}
                      <button
                        type="button"
                        onClick={() => updateRange(index, "sideMode", "double_sided")}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all cursor-pointer select-none",
                          isDoubleSided
                            ? "border-emerald-600 bg-emerald-50/90 text-emerald-950 font-bold shadow-2xs ring-1 ring-emerald-500/30"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <div className="flex size-7 items-center justify-center rounded-lg bg-white text-slate-700 shadow-2xs shrink-0">
                          <Layers className="size-3.5 text-emerald-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold truncate">2-Sided (Duplex)</p>
                          <p className="text-[10px] text-slate-500 truncate">Both sides (Save paper)</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. Tactile Paper Size Chips */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Paper Size
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: "a4", label: "A4", sub: "Standard" },
                      { id: "a3", label: "A3", sub: "Large" },
                      { id: "letter", label: "Letter", sub: "8.5x11" },
                      { id: "legal", label: "Legal", sub: "8.5x14" },
                    ].map((ps) => {
                      const active = range.paperSize === ps.id;
                      return (
                        <button
                          key={ps.id}
                          type="button"
                          onClick={() => updateRange(index, "paperSize", ps.id)}
                          className={cn(
                            "rounded-xl border py-2 px-1 text-center transition-all cursor-pointer select-none",
                            active
                              ? "border-slate-800 bg-slate-900 text-white font-bold shadow-xs"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          )}
                        >
                          <p className="text-xs font-bold">{ps.label}</p>
                          <p className={cn("text-[9px]", active ? "text-slate-300" : "text-slate-400")}>{ps.sub}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Range Calculation Breakdown Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5 font-medium text-slate-600">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-800">
                      {range.startPage === range.endPage ? `Page ${range.startPage}` : `Pages ${range.startPage}–${range.endPage}`}
                    </span>
                    <span>({pageSpan}p)</span>
                    <span className="font-bold text-emerald-700">× {copiesNum} {copiesNum === 1 ? "copy" : "copies"}</span>
                    <span>=</span>
                    <span className="rounded-lg bg-emerald-50 px-2.5 py-0.5 font-black text-emerald-800 border border-emerald-200 shadow-2xs">
                      {rangePrintedPages} Printed {rangePrintedPages === 1 ? "Page" : "Pages"}
                    </span>
                  </div>

                  {current.ranges.length > 1 && (
                    <button
                      type="button"
                      className="ml-auto rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 transition active:scale-95 cursor-pointer"
                      aria-label="Remove page range"
                      onClick={() => removeRange(index)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {rangeError ? (
            <p className="text-xs font-bold text-rose-600">{rangeError}</p>
          ) : (
            <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-emerald-600" /> Ready to print selected pages and copies.
            </p>
          )}

          <button
            type="button"
            onClick={addRange}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-emerald-500 transition active:scale-95 cursor-pointer"
          >
            <Plus className="size-3.5 text-emerald-600" /> Add Another Page Range
          </button>
        </div>
      </Card>

      {/* Primary Action Buttons (Generate Token & Pay Online) */}
      <div className="pt-2 space-y-2.5">
        {/* If shop accepts both counter token and online payment */}
        {shopPaymentMode === "both" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={!allValid || busy}
              onClick={onProceedToCounterToken}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-white shadow-[0_4px_0_#047857,0_10px_20px_-2px_rgba(5,150,105,0.35)] hover:bg-emerald-700 active:bg-emerald-800 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Ticket className="size-4.5 shrink-0" />
                  <span>Generate Token · ₹{displayTotalAmount}</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={!allValid || busy}
              onClick={onProceedToPay}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-white shadow-[0_4px_0_#0f172a,0_10px_20px_-2px_rgba(15,23,42,0.35)] hover:bg-slate-800 active:bg-slate-950 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CreditCard className="size-4.5 shrink-0" />
                  <span>Pay Online · ₹{displayTotalAmount}</span>
                </>
              )}
            </button>
          </div>
        ) : shopPaymentMode === "counter" ? (
          <button
            type="button"
            disabled={!allValid || busy}
            onClick={onProceedToCounterToken}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-white shadow-[0_4px_0_#047857,0_10px_20px_-2px_rgba(5,150,105,0.35)] hover:bg-emerald-700 active:bg-emerald-800 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            {busy ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                <span>Generating Token...</span>
              </>
            ) : (
              <>
                <Ticket className="size-5 shrink-0" />
                <span>Confirm &amp; Generate Counter Token (₹{displayTotalAmount})</span>
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled={!allValid || busy}
            onClick={onProceedToPay}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-white shadow-[0_4px_0_#047857,0_10px_20px_-2px_rgba(5,150,105,0.35)] hover:bg-emerald-700 active:bg-emerald-800 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            {busy ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                <span>Preparing Payment...</span>
              </>
            ) : (
              <>
                <CreditCard className="size-5 shrink-0" />
                <span>Proceed to Pay ₹{displayTotalAmount} Online</span>
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        )}

        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500 text-center pt-1">
          <ShieldCheck className="size-3.5 text-emerald-600 shrink-0" />
          <span>Instant counter pickup or auto-print after payment</span>
        </div>
      </div>

      {/* Mobile Floating Sticky Bottom Bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 sm:hidden border-t border-slate-200/90 bg-white/95 backdrop-blur-md p-2.5 pb-safe shadow-[0_-8px_24px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-2">
          <div className="min-w-0 shrink-0 pr-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {fallbackTotalPages} {fallbackTotalPages === 1 ? "Page" : "Pages"}
            </p>
            <p className="text-sm font-black text-emerald-800 font-mono">
              ₹{displayTotalAmount}
            </p>
          </div>

          {shopPaymentMode === "both" ? (
            <div className="flex flex-1 items-center gap-1.5 min-w-0">
              <button
                type="button"
                disabled={!allValid || busy}
                onClick={onProceedToCounterToken}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2.5 px-2 text-[11.5px] font-bold text-white shadow-xs active:scale-95 transition disabled:opacity-50 truncate"
              >
                <Ticket className="size-3.5 shrink-0" />
                <span className="truncate">Token</span>
              </button>
              <button
                type="button"
                disabled={!allValid || busy}
                onClick={onProceedToPay}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-slate-900 py-2.5 px-2 text-[11.5px] font-bold text-white shadow-xs active:scale-95 transition disabled:opacity-50 truncate"
              >
                <CreditCard className="size-3.5 shrink-0" />
                <span className="truncate">Pay Online</span>
              </button>
            </div>
          ) : shopPaymentMode === "counter" ? (
            <button
              type="button"
              disabled={!allValid || busy}
              onClick={onProceedToCounterToken}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 px-3 text-xs font-bold text-white shadow-xs active:scale-95 transition disabled:opacity-50"
            >
              <Ticket className="size-4 shrink-0" />
              <span>Generate Token (₹{displayTotalAmount})</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!allValid || busy}
              onClick={onProceedToPay}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 px-3 text-xs font-bold text-white shadow-xs active:scale-95 transition disabled:opacity-50"
            >
              <CreditCard className="size-4 shrink-0" />
              <span>Pay Online (₹{displayTotalAmount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Fullscreen Page Inspector Modal on tap */}
      {selectedPreviewPage !== null && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-xs">
            <button
              type="button"
              onClick={closeFullscreenPreview}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </button>
            <div className="text-center">
              <span className="text-xs font-extrabold text-slate-900">
                Page {selectedPreviewPage} of {totalPagesInDoc}
              </span>
              <span className="block text-[10px] text-slate-500 font-medium truncate max-w-[180px]">
                {current.filename}
              </span>
            </div>
            <button
              type="button"
              onClick={closeFullscreenPreview}
              className="flex size-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 transition"
              aria-label="Close preview"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="relative flex flex-1 items-center justify-center overflow-auto p-4">
            <div className="relative flex max-h-[80vh] w-auto max-w-[90vw] items-center justify-center rounded-2xl bg-white p-2 shadow-2xl border border-slate-800/10">
              {docPreviewUrl && (totalPagesInDoc === 1 || isImageDoc) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={docPreviewUrl}
                  alt={`Page ${selectedPreviewPage}`}
                  className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg"
                  style={
                    includedPagesMap.get(selectedPreviewPage)?.colorMode === "color"
                      ? undefined
                      : { filter: "grayscale(100%) contrast(1.1) brightness(0.96)" }
                  }
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 space-y-2">
                  <FileText className="size-16 text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">Page {selectedPreviewPage}</p>
                  <p className="text-xs text-slate-400">
                    {includedPagesMap.get(selectedPreviewPage)?.colorMode === "color" ? "Full Color" : "Black & White"} ·{" "}
                    {includedPagesMap.get(selectedPreviewPage)?.sideMode === "double_sided" ? "2-Sided" : "1-Sided"}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800/60 bg-slate-950/80 px-4 py-3 text-white backdrop-blur-md">
            <button
              type="button"
              disabled={selectedPreviewPage <= 1}
              onClick={() => setSelectedPreviewPage((p) => (p && p > 1 ? p - 1 : p))}
              className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            >
              <ChevronLeft className="size-3.5" />
              Prev
            </button>
            <span className="text-[11px] text-slate-400">
              Page {selectedPreviewPage} of {totalPagesInDoc}
            </span>
            <button
              type="button"
              disabled={selectedPreviewPage >= totalPagesInDoc}
              onClick={() => setSelectedPreviewPage((p) => (p && p < totalPagesInDoc ? p + 1 : p))}
              className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            >
              Next
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      )}
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

  // Auto scroll up to ensure token card is fully in view
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Live countdown timer for 1-hour validity
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(tokenDetails.expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [tokenDetails.expiresAt]);

  // Real-time status polling (pauses when backgrounded)
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
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
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 2000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
    <Card className="overflow-hidden border-emerald-200 bg-white p-4 sm:p-8 shadow-xl rounded-3xl">
      {/* 1. SCREENSHOT PROMPT BANNER */}
      <div className="rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 p-3.5 sm:p-5 text-amber-950 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex size-10 sm:size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-200/80 text-amber-900 shadow-inner">
            <Camera className="size-5 sm:size-6" />
          </div>
          <div>
            <p className="text-xs sm:text-base font-black tracking-tight text-amber-950">
              📸 Please take a screenshot of your token number!
            </p>
            <p className="text-[11px] sm:text-xs text-amber-800 leading-snug sm:leading-relaxed mt-0.5">
              Take a screenshot now or save Token <b>#{tokenDetails.tokenNumber}</b> to show at the counter.
            </p>
          </div>
        </div>
      </div>

      {/* 2. MASSIVE TOKEN NUMBER CARD */}
      <div className="mt-4 sm:mt-6 rounded-2xl sm:rounded-3xl border border-emerald-300/80 bg-white p-4 sm:p-8 text-center shadow-md">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-0.5 text-[11px] sm:text-xs font-bold text-emerald-800">
          <Ticket className="size-3.5" /> PAY AT COUNTER TOKEN
        </div>

        <div className="mt-3 sm:mt-4">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400">Your Token Number</span>
          <div className="mt-0.5 text-5xl sm:text-7xl font-black tracking-tight text-emerald-700 font-mono">
            #{tokenDetails.tokenNumber}
          </div>
        </div>

        {/* Total pages to be printed clearly below token number */}
        <div className="mt-3 inline-flex flex-wrap items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs sm:text-sm font-extrabold text-emerald-900 border border-emerald-200">
          <Printer className="size-3.5 sm:size-4 text-emerald-700 shrink-0" />
          <span>
            {tokenDetails.totalPages} Pages to print ({tokenDetails.blackAndWhitePages} B&amp;W, {tokenDetails.colorPages} Color)
          </span>
        </div>

        {/* Amount to pay */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-600 text-xs sm:text-sm">
          <span>Pay at Counter:</span>
          <b className="text-xl sm:text-2xl font-black text-slate-900 font-mono">₹{tokenDetails.totalAmount.toFixed(2)}</b>
        </div>

        {/* Copy Token Button */}
        <div className="mt-3.5">
          <button
            type="button"
            onClick={handleCopyToken}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 transition active:scale-95 cursor-pointer"
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
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {/* Countdown Box */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock3 className="size-3.5 text-emerald-600" />
            <span className="font-bold">Token Validity</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              className={cn(
                "font-mono text-xl sm:text-2xl font-black",
                remainingSeconds < 300 ? "text-rose-600" : "text-slate-900"
              )}
            >
              {isExpired ? "Expired" : formattedCountdown}
            </span>
            <span className="text-[11px] text-slate-500">{isExpired ? "" : "left (1 hr validity)"}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 leading-snug">
            {isExpired
              ? "Token expired. Please submit a new request."
              : "Show token to the shopkeeper before expiry."}
          </p>
        </div>

        {/* Live Status Box */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-2xs">
          <span className="text-xs font-bold text-slate-500">Queue Status</span>
          <div className="mt-1.5">
            {isCompleted ? (
              <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-700">
                <CheckCircle2 className="size-4 shrink-0" /> Printed &amp; Ready!
              </span>
            ) : isPrinting ? (
              <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-600">
                <LoaderCircle className="size-4 animate-spin shrink-0" /> Approved! Printing now...
              </span>
            ) : isExpired ? (
              <span className="text-xs sm:text-sm font-bold text-rose-600">Expired</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-amber-700">
                <span className="size-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                Waiting for Shopkeeper
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 leading-snug">
            {isCompleted
              ? "Ready! Collect printed sheets from counter."
              : isPrinting
              ? "Shop owner approved token; printing in progress."
              : `Shopkeeper will verify Token #${tokenDetails.tokenNumber} & print.`}
          </p>
        </div>
      </div>

      {/* 4. ORDER SUMMARY & INSTRUCTIONS */}
      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-5 text-xs text-slate-600 space-y-1.5 shadow-2xs">
        <div className="flex items-center justify-between py-0.5">
          <span>Order ID</span>
          <span className="font-mono font-bold text-slate-900">#{tokenDetails.publicOrderId}</span>
        </div>
        <div className="flex items-center justify-between py-0.5">
          <span>Shop</span>
          <span className="font-semibold text-slate-900 truncate max-w-[60%]">{shop.name}</span>
        </div>
        <div className="flex items-center justify-between py-0.5">
          <span>Files</span>
          <span className="font-semibold text-slate-900">
            {documents.length} File{documents.length === 1 ? "" : "s"} ({tokenDetails.totalPages} Pages)
          </span>
        </div>
      </div>

      {/* Reset / New Order Button */}
      <div className="mt-4 sm:mt-6">
        <button
          type="button"
          onClick={onReset}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-emerald-500 transition active:scale-95 cursor-pointer"
        >
          <RotateCcw className="size-3.5" />
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
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
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
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 2000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          className="w-full text-base py-4 font-bold shadow-xl shadow-brand-900/15 cursor-pointer"
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

function RecentTokensModal({
  isOpen,
  onClose,
  tokens,
  onSelectToken,
}: {
  isOpen: boolean;
  onClose: () => void;
  tokens: StoredToken[];
  onSelectToken: (token: StoredToken) => void;
}) {
  const [now] = useState(() => Date.now());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeTokens = tokens.filter((t) => new Date(t.expiresAt).getTime() > now);
  const pastTokens = tokens.filter((t) => new Date(t.expiresAt).getTime() <= now);

  const handleCopy = (t: StoredToken, e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(String(t.tokenNumber));
      setCopiedId(t.publicOrderId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleDelete = (publicOrderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeTokenFromStorage(publicOrderId);
  };

  const handleClearAll = () => {
    if (window.confirm("Clear all saved token history from this browser?")) {
      clearAllStoredTokens();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <History className="size-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Print History &amp; Saved Tokens</h3>
              <p className="text-[11px] sm:text-xs text-slate-500">Stored in your browser for quick counter access</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Body / Token List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-h-[60vh]">
          {tokens.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <Ticket className="mx-auto size-10 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">No print tokens found in this browser</p>
              <p className="text-xs text-slate-400 mt-1">Generated tokens will be saved here automatically for 1+ hour.</p>
            </div>
          ) : (
            <>
              {/* Active Tokens Section */}
              {activeTokens.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-800 uppercase tracking-wider px-1">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                      Active Tokens ({activeTokens.length})
                    </span>
                    <span className="text-[10px] font-normal lowercase text-slate-400">valid for 1 hour</span>
                  </div>

                  {activeTokens.map((token) => {
                    const minsRemaining = Math.max(1, Math.round((new Date(token.expiresAt).getTime() - now) / 60000));
                    const isCopied = copiedId === token.publicOrderId;

                    return (
                      <div
                        key={token.publicOrderId}
                        className="group relative rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 p-4 transition shadow-xs hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-600 text-white font-mono font-black text-2xl shadow-md shadow-emerald-900/15">
                              #{token.tokenNumber}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">
                                  <Clock3 className="size-3" />
                                  {minsRemaining}m left
                                </span>
                                <span className="text-[11px] text-slate-400">Order #{token.publicOrderId}</span>
                              </div>
                              <p className="font-bold text-slate-900 text-sm mt-0.5 flex items-center gap-1">
                                <Store className="size-3.5 text-emerald-600 shrink-0" />
                                <span className="truncate max-w-[180px]">{token.shopName}</span>
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {token.totalPages} pages · ₹{token.totalAmount.toFixed(2)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => handleCopy(token, e)}
                              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition active:scale-95 cursor-pointer"
                              title="Copy Token Number"
                            >
                              {isCopied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDelete(token.publicOrderId, e)}
                              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition active:scale-95 cursor-pointer"
                              title="Delete from history"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </div>

                        {token.documentNames && token.documentNames.length > 0 && (
                          <p className="mt-2 text-[11px] text-slate-500 truncate border-t border-emerald-200/60 pt-2">
                            📄 {token.documentNames.join(", ")}
                          </p>
                        )}

                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => onSelectToken(token)}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition active:scale-98 cursor-pointer"
                          >
                            <span>Open Token Screen</span>
                            <ArrowRight className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Past / Expired Tokens Section */}
              {pastTokens.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 pt-2">
                    Previous History ({pastTokens.length})
                  </div>

                  {pastTokens.map((token) => {
                    const isCopied = copiedId === token.publicOrderId;
                    const dateStr = token.createdAt
                      ? new Date(token.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Past order";

                    return (
                      <div
                        key={token.publicOrderId}
                        className="group flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs transition hover:bg-white hover:border-slate-300"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-700 font-mono font-bold text-lg">
                            #{token.tokenNumber}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800 truncate max-w-[150px] sm:max-w-xs">
                                {token.shopName}
                              </span>
                              <span className="rounded-md bg-slate-200/80 px-1.5 py-0.2 text-[9px] font-bold text-slate-600 uppercase">
                                Expired
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {dateStr} · {token.totalPages}p · ₹{token.totalAmount.toFixed(2)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleCopy(token, e)}
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-emerald-700 hover:border-emerald-300 transition active:scale-95 cursor-pointer"
                            title="Copy Token Number"
                          >
                            {isCopied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectToken(token)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition active:scale-95 cursor-pointer"
                          >
                            <span>View</span>
                            <ExternalLink className="size-3 text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(token.publicOrderId, e)}
                            className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {tokens.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-3 sm:px-6">
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition cursor-pointer"
            >
              Clear all history
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

