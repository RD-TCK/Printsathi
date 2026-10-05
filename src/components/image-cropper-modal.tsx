"use client";

import { useState, useRef, useEffect } from "react";
import {
  Crop,
  RotateCw,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Sparkles,
  Maximize2,
  Minimize2,
  BoxSelect,
  Layers,
  Move,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AspectRatioOption = {
  id: string;
  label: string;
  ratio: number | null; // width / height, null for original
};

const ASPECT_RATIOS: AspectRatioOption[] = [
  { id: "a4_portrait", label: "📄 A4 Portrait (Standard Page)", ratio: 1 / 1.414 },
  { id: "a4_landscape", label: "📑 A4 Landscape (Wide Page)", ratio: 1.414 },
  { id: "original", label: "🖼️ Original Photo Ratio", ratio: null },
  { id: "square", label: "🔲 1:1 Square", ratio: 1 },
  { id: "standard_4_3", label: "📺 4:3 Standard", ratio: 4 / 3 },
  { id: "widescreen_16_9", label: "🖥️ 16:9 Widescreen", ratio: 16 / 9 },
];

type CropMode = "page_preset" | "portion_select";

type Props = {
  isOpen: boolean;
  imageUrl: string;
  filename: string;
  onClose: () => void;
  onApplyCrop: (croppedBlob: Blob, croppedDataUrl: string) => void;
  onSwitchToMultiImage?: () => void;
};

export function ImageCropperModal({
  isOpen,
  imageUrl,
  filename,
  onClose,
  onApplyCrop,
}: Props) {
  const [cropMode, setCropMode] = useState<CropMode>("page_preset");
  const [selectedRatioId, setSelectedRatioId] = useState<string>("a4_portrait");
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [zoom, setZoom] = useState<number>(1);
  const [cropOffset, setCropOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [imageLoading, setImageLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Portion Selection Mode state (percentages from 0 to 100 relative to displayed image)
  const [selectionBox, setSelectionBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({ x: 15, y: 15, width: 70, height: 70 });

  // Natural image dimensions
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const frameContainerRef = useRef<HTMLDivElement>(null);
  const portionViewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const portionImgRef = useRef<HTMLImageElement>(null);

  // Performance & Gesture Refs (Zero lag on 120Hz mobile digitizers)
  const rafRef = useRef<number | null>(null);
  const panStartRef = useRef<{ clientX: number; clientY: number; origOffset: { x: number; y: number } } | null>(null);
  const pinchStartRef = useRef<{ dist: number; origZoom: number } | null>(null);
  const resizeStateRef = useRef<{
    handle: string;
    clientX: number;
    clientY: number;
    box: { x: number; y: number; width: number; height: number };
  } | null>(null);

  // Cleanup pending rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Load natural dimensions when image loads
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const nw = img.naturalWidth || 800;
    const nh = img.naturalHeight || 600;
    setNaturalDimensions({ width: nw, height: nh });
    setImageLoading(false);
    setLoadError(null);

    // Auto default to A4 Landscape if photo is inherently landscape
    if (nw > nh * 1.15) {
      setSelectedRatioId("a4_landscape");
    } else {
      setSelectedRatioId("a4_portrait");
    }
    setZoom(1);
    setCropOffset({ x: 0, y: 0 });
  };

  const handleImageError = () => {
    setImageLoading(false);
    setLoadError("Could not load the image for cropping. Please ensure your connection is active.");
  };

  const currentOption = ASPECT_RATIOS.find((r) => r.id === selectedRatioId) || ASPECT_RATIOS[0];
  const isRotated90or270 = rotation === 90 || rotation === 270;
  const effNaturalWidth = isRotated90or270 ? naturalDimensions.height : naturalDimensions.width;
  const effNaturalHeight = isRotated90or270 ? naturalDimensions.width : naturalDimensions.height;

  // Active target aspect ratio (width / height)
  let activeRatio = currentOption.ratio;
  if (activeRatio === null && effNaturalWidth > 0 && effNaturalHeight > 0) {
    activeRatio = effNaturalWidth / effNaturalHeight;
  }
  if (!activeRatio) activeRatio = 1 / 1.414;

  // Frame display dimensions in page preset mode (optimized for mobile viewport)
  const maxViewportWidth = typeof window !== "undefined" && window.innerWidth < 640 ? Math.min(340, window.innerWidth - 32) : 460;
  const maxViewportHeight = typeof window !== "undefined" && window.innerHeight < 700 ? 280 : 340;

  let frameWidth = maxViewportWidth;
  let frameHeight = Math.round(frameWidth / activeRatio);

  if (frameHeight > maxViewportHeight) {
    frameHeight = maxViewportHeight;
    frameWidth = Math.round(frameHeight * activeRatio);
  }
  if (frameWidth > maxViewportWidth) {
    frameWidth = maxViewportWidth;
    frameHeight = Math.round(frameWidth / activeRatio);
  }

  // Calculate base fit scale for page preset mode
  const fitScale =
    effNaturalWidth > 0 && effNaturalHeight > 0
      ? Math.min(frameWidth / effNaturalWidth, frameHeight / effNaturalHeight)
      : 1;

  const baseDisplayWidth = naturalDimensions.width * fitScale;
  const baseDisplayHeight = naturalDimensions.height * fitScale;

  // Portion selection mode: calculate display image size in portion viewport
  const portionMaxW = maxViewportWidth;
  const portionMaxH = maxViewportHeight;
  const portionFitScale =
    effNaturalWidth > 0 && effNaturalHeight > 0
      ? Math.min(portionMaxW / effNaturalWidth, portionMaxH / effNaturalHeight)
      : 1;

  const portionDispW = (isRotated90or270 ? naturalDimensions.height : naturalDimensions.width) * portionFitScale;
  const portionDispH = (isRotated90or270 ? naturalDimensions.width : naturalDimensions.height) * portionFitScale;

  // -------------------------------------------------------------
  // High-Performance Pointer Pan & Pinch-to-Zoom (Page Preset Mode)
  // -------------------------------------------------------------
  const handlePagePanPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (cropMode !== "page_preset") return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    panStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      origOffset: { ...cropOffset },
    };
  };

  const handlePagePanPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panStartRef.current) return;
    e.preventDefault();

    const start = panStartRef.current;
    const deltaX = e.clientX - start.clientX;
    const deltaY = e.clientY - start.clientY;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setCropOffset({
        x: start.origOffset.x + deltaX,
        y: start.origOffset.y + deltaY,
      });
    });
  };

  const handlePagePanPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if already released
    }
    panStartRef.current = null;
  };

  // Touch Pinch-to-Zoom support on mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      pinchStartRef.current = { dist, origZoom: zoom };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const scale = dist / pinchStartRef.current.dist;
      const nextZoom = Math.max(0.5, Math.min(4, pinchStartRef.current.origZoom * scale));

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setZoom(Number(nextZoom.toFixed(2)));
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      pinchStartRef.current = null;
    }
  };

  // -------------------------------------------------------------
  // High-Performance Corner / Edge Handle Dragging (Portion Select Mode)
  // -------------------------------------------------------------
  const handleHandlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    handle: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    resizeStateRef.current = {
      handle,
      clientX: e.clientX,
      clientY: e.clientY,
      box: { ...selectionBox },
    };
  };

  const handleHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStateRef.current || !portionViewportRef.current) return;
    e.preventDefault();

    const current = resizeStateRef.current;
    const rect = portionViewportRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const deltaXPercent = ((e.clientX - current.clientX) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - current.clientY) / rect.height) * 100;

    const b = current.box;
    let newX = b.x;
    let newY = b.y;
    let newW = b.width;
    let newH = b.height;

    const minSize = 8; // Minimum 8% width/height

    if (current.handle === "move") {
      newX = Math.max(0, Math.min(100 - b.width, b.x + deltaXPercent));
      newY = Math.max(0, Math.min(100 - b.height, b.y + deltaYPercent));
    } else {
      // Horizontal resize
      if (current.handle.includes("e")) {
        newW = Math.max(minSize, Math.min(100 - b.x, b.width + deltaXPercent));
      }
      if (current.handle.includes("w")) {
        const targetX = Math.max(0, Math.min(b.x + b.width - minSize, b.x + deltaXPercent));
        newW = b.x + b.width - targetX;
        newX = targetX;
      }

      // Vertical resize
      if (current.handle.includes("s")) {
        newH = Math.max(minSize, Math.min(100 - b.y, b.height + deltaYPercent));
      }
      if (current.handle.includes("n")) {
        const targetY = Math.max(0, Math.min(b.y + b.height - minSize, b.y + deltaYPercent));
        newH = b.y + b.height - targetY;
        newY = targetY;
      }
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setSelectionBox({
        x: Number(newX.toFixed(2)),
        y: Number(newY.toFixed(2)),
        width: Number(newW.toFixed(2)),
        height: Number(newH.toFixed(2)),
      });
    });
  };

  const handleHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if already released
    }
    resizeStateRef.current = null;
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
    setCropOffset({ x: 0, y: 0 });
  };

  const handleFitEntireImage = () => {
    setZoom(1);
    setCropOffset({ x: 0, y: 0 });
  };

  const handleFillPage = () => {
    if (effNaturalWidth > 0 && effNaturalHeight > 0) {
      const coverScale = Math.max(frameWidth / effNaturalWidth, frameHeight / effNaturalHeight);
      setZoom(Math.max(1, coverScale / fitScale));
      setCropOffset({ x: 0, y: 0 });
    }
  };

  const handleReset = () => {
    setRotation(0);
    setZoom(1);
    setCropOffset({ x: 0, y: 0 });
    setSelectionBox({ x: 15, y: 15, width: 70, height: 70 });
    if (naturalDimensions.width > naturalDimensions.height * 1.15) {
      setSelectedRatioId("a4_landscape");
    } else {
      setSelectedRatioId("a4_portrait");
    }
  };

  const handleSaveCrop = async () => {
    const img = (cropMode === "portion_select" ? portionImgRef.current : imgRef.current) || imgRef.current || portionImgRef.current;
    if (!img || naturalDimensions.width === 0) return;
    setIsProcessing(true);

    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not create canvas context");

      if (cropMode === "portion_select") {
        // Mode B: PORTION / SNIPPET SELECTION
        const selNormX = selectionBox.x / 100;
        const selNormY = selectionBox.y / 100;
        const selNormW = selectionBox.width / 100;
        const selNormH = selectionBox.height / 100;

        // Standard A4 print sheet canvas (2480 x 3508 at 300 DPI)
        const canvasW = 2480;
        const a4Aspect = 1 / 1.414;
        const canvasH = Math.round(canvasW / a4Aspect);

        canvas.width = canvasW;
        canvas.height = canvasH;

        // Clean white background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvasW, canvasH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Create an intermediate canvas of the rotated image
        const rotatedCanvas = document.createElement("canvas");
        const rCtx = rotatedCanvas.getContext("2d");
        if (!rCtx) throw new Error("Could not create rotated canvas");

        rotatedCanvas.width = effNaturalWidth;
        rotatedCanvas.height = effNaturalHeight;

        rCtx.save();
        rCtx.translate(effNaturalWidth / 2, effNaturalHeight / 2);
        rCtx.rotate((rotation * Math.PI) / 180);
        rCtx.drawImage(
          img,
          -naturalDimensions.width / 2,
          -naturalDimensions.height / 2,
          naturalDimensions.width,
          naturalDimensions.height
        );
        rCtx.restore();

        // Extract selected sub-rectangle
        const srcX = Math.round(selNormX * effNaturalWidth);
        const srcY = Math.round(selNormY * effNaturalHeight);
        const srcW = Math.round(selNormW * effNaturalWidth);
        const srcH = Math.round(selNormH * effNaturalHeight);

        // Fit the selected portion nicely onto the standard A4 print canvas with crisp margins
        const maxPrintW = canvasW * 0.90;
        const maxPrintH = canvasH * 0.90;
        const scale = Math.min(maxPrintW / srcW, maxPrintH / srcH);
        const drawW = srcW * scale;
        const drawH = srcH * scale;
        const drawX = (canvasW - drawW) / 2;
        const drawY = (canvasH - drawH) / 2;

        ctx.drawImage(rotatedCanvas, srcX, srcY, srcW, srcH, drawX, drawY, drawW, drawH);
      } else {
        // Mode A: PAGE PRESET / FIT
        const standardOutWidth = 2480;
        let outW = standardOutWidth;
        let outH = Math.round(outW / activeRatio);

        if (outH > 3508) {
          outH = 3508;
          outW = Math.round(outH * activeRatio);
        }

        canvas.width = outW;
        canvas.height = outH;

        // Fill crisp white background so any page margins print cleanly
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, outW, outH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        const canvasScale = outW / frameWidth;

        ctx.save();
        ctx.translate(outW / 2, outH / 2);
        ctx.translate(cropOffset.x * canvasScale, cropOffset.y * canvasScale);
        ctx.rotate((rotation * Math.PI) / 180);
        const totalScaleFactor = zoom * canvasScale * fitScale;
        ctx.scale(totalScaleFactor, totalScaleFactor);

        ctx.drawImage(
          img,
          -naturalDimensions.width / 2,
          -naturalDimensions.height / 2,
          naturalDimensions.width,
          naturalDimensions.height
        );
        ctx.restore();
      }

      // Export canvas to high-quality JPEG Blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            alert("Failed to crop image.");
            setIsProcessing(false);
            return;
          }
          const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.95);
          onApplyCrop(blob, croppedDataUrl);
          setIsProcessing(false);
          onClose();
        },
        "image/jpeg",
        0.95
      );
    } catch (err) {
      console.error("Cropping failed:", err);
      alert("Failed to process cropped image. Please try again.");
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[95vh] rounded-3xl bg-white shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <Crop className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Crop &amp; Frame Photo</h2>
              <p className="text-xs text-slate-500 truncate max-w-[200px] sm:max-w-md">
                {filename} · Fit full page or select a specific portion to print
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center border-b border-slate-200 bg-slate-100/80 p-1.5 gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setCropMode("page_preset")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              cropMode === "page_preset"
                ? "bg-white text-emerald-900 shadow-sm border border-slate-200/80"
                : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
            )}
          >
            <Layers className="size-4 text-emerald-600" />
            <span>Page Fit &amp; Presets (A4, etc.)</span>
          </button>

          <button
            type="button"
            onClick={() => setCropMode("portion_select")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold transition-all cursor-pointer whitespace-nowrap",
              cropMode === "portion_select"
                ? "bg-white text-emerald-900 shadow-sm border border-slate-200/80"
                : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
            )}
          >
            <BoxSelect className="size-4 text-emerald-600" />
            <span>✂️ Select Portion / Snippet</span>
          </button>

          {/* Multiple Photos on 1 Page button hidden from frontend */}
        </div>

        {/* Page Preset Options (Only in page_preset mode) */}
        {cropMode === "page_preset" && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                Aspect Ratio:
              </span>
              {ASPECT_RATIOS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setSelectedRatioId(option.id);
                    setCropOffset({ x: 0, y: 0 });
                  }}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition cursor-pointer",
                    selectedRatioId === option.id
                      ? "bg-emerald-600 text-white shadow-xs font-bold"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Viewport / Crop Canvas Box (Hardware-Accelerated + Touch-Action None) */}
        <div className="relative flex flex-1 min-h-[280px] sm:min-h-[350px] items-center justify-center overflow-hidden bg-slate-950 p-4 select-none touch-none">
          {cropMode === "page_preset" ? (
            /* MODE A: Page Frame Fit */
            <div
              ref={frameContainerRef}
              onPointerDown={handlePagePanPointerDown}
              onPointerMove={handlePagePanPointerMove}
              onPointerUp={handlePagePanPointerUp}
              onPointerCancel={handlePagePanPointerUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="relative flex items-center justify-center overflow-hidden border-2 border-dashed border-emerald-400 rounded-xl shadow-2xl bg-white cursor-grab active:cursor-grabbing select-none touch-none"
              style={{
                width: `${frameWidth}px`,
                height: `${frameHeight}px`,
              }}
            >
              {/* Guide Grid Overlay */}
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 border border-emerald-400/20 z-20">
                <div className="border-r border-b border-emerald-400/15" />
                <div className="border-r border-b border-emerald-400/15" />
                <div className="border-b border-emerald-400/15" />
                <div className="border-r border-b border-emerald-400/15" />
                <div className="border-r border-b border-emerald-400/15" />
                <div className="border-b border-emerald-400/15" />
                <div className="border-r border-b border-emerald-400/15" />
                <div className="border-r border-b border-emerald-400/15" />
                <div />
              </div>

              {/* Corner Markers */}
              <div className="pointer-events-none absolute top-1 left-1 size-3 border-t-2 border-l-2 border-emerald-500 z-20" />
              <div className="pointer-events-none absolute top-1 right-1 size-3 border-t-2 border-r-2 border-emerald-500 z-20" />
              <div className="pointer-events-none absolute bottom-1 left-1 size-3 border-b-2 border-l-2 border-emerald-500 z-20" />
              <div className="pointer-events-none absolute bottom-1 right-1 size-3 border-b-2 border-r-2 border-emerald-500 z-20" />

              {/* Target Image being cropped and fitted */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Crop target"
                crossOrigin="anonymous"
                draggable={false}
                onLoad={handleImageLoad}
                onError={handleImageError}
                className="select-none pointer-events-none origin-center"
                style={{
                  width: baseDisplayWidth > 0 ? `${baseDisplayWidth}px` : "auto",
                  height: baseDisplayHeight > 0 ? `${baseDisplayHeight}px` : "auto",
                  transform: `translate3d(${cropOffset.x}px, ${cropOffset.y}px, 0) rotate(${rotation}deg) scale(${zoom})`,
                  willChange: "transform",
                }}
              />

              {/* Loading & Error Overlays */}
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 z-30 backdrop-blur-xs">
                  <div className="flex items-center gap-2 rounded-xl bg-slate-800/90 px-3.5 py-2 text-xs font-bold text-white shadow-md">
                    <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Loading high-res preview...</span>
                  </div>
                </div>
              )}
              {loadError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 p-4 text-center z-30">
                  <p className="text-xs font-bold text-rose-300">{loadError}</p>
                </div>
              )}
            </div>
          ) : (
            /* MODE B: Interactive Portion / Snippet Selection (Zero Lag & Large Touch Targets) */
            <div
              ref={portionViewportRef}
              className="relative flex items-center justify-center overflow-hidden rounded-xl shadow-2xl bg-black border border-slate-700 select-none touch-none"
              style={{
                width: `${portionDispW}px`,
                height: `${portionDispH}px`,
              }}
            >
              {/* Target Base Image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={portionImgRef}
                src={imageUrl}
                alt="Portion target"
                crossOrigin="anonymous"
                draggable={false}
                onLoad={handleImageLoad}
                onError={handleImageError}
                className="select-none pointer-events-none origin-center"
                style={{
                  width: `${portionDispW}px`,
                  height: `${portionDispH}px`,
                  transform: `rotate(${rotation}deg)`,
                }}
              />

              {/* 4 Hardware-Accelerated Dimming Overlays Around Selection Box (No heavy 9999px box-shadow) */}
              {/* Top Backdrop */}
              <div
                className="absolute left-0 right-0 top-0 bg-black/60 pointer-events-none z-10"
                style={{ height: `${selectionBox.y}%` }}
              />
              {/* Bottom Backdrop */}
              <div
                className="absolute left-0 right-0 bottom-0 bg-black/60 pointer-events-none z-10"
                style={{ height: `${100 - (selectionBox.y + selectionBox.height)}%` }}
              />
              {/* Left Backdrop */}
              <div
                className="absolute left-0 bg-black/60 pointer-events-none z-10"
                style={{
                  top: `${selectionBox.y}%`,
                  height: `${selectionBox.height}%`,
                  width: `${selectionBox.x}%`,
                }}
              />
              {/* Right Backdrop */}
              <div
                className="absolute right-0 bg-black/60 pointer-events-none z-10"
                style={{
                  top: `${selectionBox.y}%`,
                  height: `${selectionBox.height}%`,
                  width: `${100 - (selectionBox.x + selectionBox.width)}%`,
                }}
              />

              {/* Active Selection Box */}
              <div
                className="absolute z-20 border-2 border-emerald-400 bg-transparent cursor-move select-none touch-none"
                style={{
                  left: `${selectionBox.x}%`,
                  top: `${selectionBox.y}%`,
                  width: `${selectionBox.width}%`,
                  height: `${selectionBox.height}%`,
                  willChange: "left, top, width, height",
                }}
                onPointerDown={(e) => handleHandlePointerDown(e, "move")}
                onPointerMove={handleHandlePointerMove}
                onPointerUp={handleHandlePointerUp}
                onPointerCancel={handleHandlePointerUp}
              >
                {/* 3x3 Grid inside selection box */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                  <div className="border-r border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div className="border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div className="border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div />
                </div>

                {/* Move Handle Badge */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-700/90 backdrop-blur-xs px-2.5 py-1 text-[10px] font-bold text-white flex items-center gap-1 shadow-md pointer-events-none whitespace-nowrap">
                  <Move className="size-3 text-emerald-200" /> Drag to Move
                </div>

                {/* Corner Resizing Handles: 40px Touch Hit Area with 22px Visual Disc */}
                {/* NW Corner */}
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, "nw")}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  onPointerCancel={handleHandlePointerUp}
                  className="absolute -top-4 -left-4 size-10 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30"
                >
                  <div className="size-5 rounded-full bg-emerald-500 border-2 border-white shadow-lg ring-2 ring-emerald-950/40 transition-transform active:scale-125" />
                </div>

                {/* NE Corner */}
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, "ne")}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  onPointerCancel={handleHandlePointerUp}
                  className="absolute -top-4 -right-4 size-10 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30"
                >
                  <div className="size-5 rounded-full bg-emerald-500 border-2 border-white shadow-lg ring-2 ring-emerald-950/40 transition-transform active:scale-125" />
                </div>

                {/* SW Corner */}
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, "sw")}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  onPointerCancel={handleHandlePointerUp}
                  className="absolute -bottom-4 -left-4 size-10 flex items-center justify-center cursor-nesw-resize select-none touch-none z-30"
                >
                  <div className="size-5 rounded-full bg-emerald-500 border-2 border-white shadow-lg ring-2 ring-emerald-950/40 transition-transform active:scale-125" />
                </div>

                {/* SE Corner */}
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, "se")}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  onPointerCancel={handleHandlePointerUp}
                  className="absolute -bottom-4 -right-4 size-10 flex items-center justify-center cursor-nwse-resize select-none touch-none z-30"
                >
                  <div className="size-5 rounded-full bg-emerald-500 border-2 border-white shadow-lg ring-2 ring-emerald-950/40 transition-transform active:scale-125" />
                </div>

                {/* Edge Handles with Generous 36px Touch Area */}
                {/* North Edge */}
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, "n")}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  onPointerCancel={handleHandlePointerUp}
                  className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-8 flex items-center justify-center cursor-ns-resize select-none touch-none z-30"
                >
                  <div className="h-2 w-8 rounded-full bg-emerald-500 border border-white shadow-md" />
                </div>

                {/* South Edge */}
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, "s")}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  onPointerCancel={handleHandlePointerUp}
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-14 h-8 flex items-center justify-center cursor-ns-resize select-none touch-none z-30"
                >
                  <div className="h-2 w-8 rounded-full bg-emerald-500 border border-white shadow-md" />
                </div>

                {/* West Edge */}
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, "w")}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  onPointerCancel={handleHandlePointerUp}
                  className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-8 h-14 flex items-center justify-center cursor-ew-resize select-none touch-none z-30"
                >
                  <div className="w-2 h-8 rounded-full bg-emerald-500 border border-white shadow-md" />
                </div>

                {/* East Edge */}
                <div
                  onPointerDown={(e) => handleHandlePointerDown(e, "e")}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  onPointerCancel={handleHandlePointerUp}
                  className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-8 h-14 flex items-center justify-center cursor-ew-resize select-none touch-none z-30"
                >
                  <div className="w-2 h-8 rounded-full bg-emerald-500 border border-white shadow-md" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Toolbar & Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-50 border-t border-slate-200">
          {cropMode === "page_preset" ? (
            /* Controls for Page Preset Mode */
            <div className="flex flex-wrap items-center gap-2">
              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
                  className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition active:scale-95 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="size-4" />
                </button>
                <span className="text-xs font-bold text-slate-700 min-w-10 text-center select-none">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(4, Number((z + 0.15).toFixed(2))))}
                  className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition active:scale-95 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="size-4" />
                </button>
              </div>

              {/* Rotation */}
              <button
                type="button"
                onClick={handleRotate}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 transition active:scale-95 cursor-pointer"
              >
                <RotateCw className="size-3.5 text-emerald-600" />
                <span>Rotate ({rotation}°)</span>
              </button>

              {/* Fit vs Fill */}
              <button
                type="button"
                onClick={handleFitEntireImage}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 transition active:scale-95 cursor-pointer"
              >
                <Minimize2 className="size-3.5 text-emerald-600" />
                <span>Fit Entire</span>
              </button>

              <button
                type="button"
                onClick={handleFillPage}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 transition active:scale-95 cursor-pointer"
              >
                <Maximize2 className="size-3.5 text-emerald-600" />
                <span>Fill Page</span>
              </button>
            </div>
          ) : (
            /* Controls for Portion Snippet Mode */
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRotate}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 transition active:scale-95 cursor-pointer"
              >
                <RotateCw className="size-3.5 text-emerald-600" />
                <span>Rotate Photo ({rotation}°)</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectionBox({ x: 5, y: 5, width: 90, height: 90 })}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 transition active:scale-95 cursor-pointer"
              >
                <Maximize2 className="size-3.5 text-emerald-600" />
                <span>Select All</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 transition active:scale-95 cursor-pointer"
              >
                <RotateCcw className="size-3.5 text-slate-500" />
                <span>Reset Box</span>
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition active:scale-95 cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={handleSaveCrop}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-700 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  <span>Apply &amp; Save Crop</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
