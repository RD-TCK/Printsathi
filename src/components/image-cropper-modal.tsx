"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Crop,
  RotateCw,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Check,
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
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Portion Selection Mode state (percentages from 0 to 100 relative to displayed image)
  const [selectionBox, setSelectionBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({ x: 10, y: 10, width: 80, height: 80 });

  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{
    clientX: number;
    clientY: number;
    box: { x: number; y: number; width: number; height: number };
  } | null>(null);

  // Natural image dimensions
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const frameContainerRef = useRef<HTMLDivElement>(null);
  const portionViewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const portionImgRef = useRef<HTMLImageElement>(null);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setRotation(0);
      setZoom(1);
      setCropOffset({ x: 0, y: 0 });
      setSelectionBox({ x: 15, y: 15, width: 70, height: 70 });
      setCropMode("page_preset");
    }
  }, [isOpen, imageUrl]);

  // Load natural dimensions when image loads
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const nw = img.naturalWidth || 800;
    const nh = img.naturalHeight || 600;
    setNaturalDimensions({ width: nw, height: nh });

    // Auto default to A4 Landscape if photo is inherently landscape
    if (nw > nh * 1.15) {
      setSelectedRatioId("a4_landscape");
    } else {
      setSelectedRatioId("a4_portrait");
    }
    setZoom(1);
    setCropOffset({ x: 0, y: 0 });
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

  // Frame display dimensions in page preset mode
  const maxViewportWidth = 460;
  const maxViewportHeight = 340;

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
  const portionMaxW = 460;
  const portionMaxH = 340;
  const portionFitScale =
    effNaturalWidth > 0 && effNaturalHeight > 0
      ? Math.min(portionMaxW / effNaturalWidth, portionMaxH / effNaturalHeight)
      : 1;

  const portionDispW = (isRotated90or270 ? naturalDimensions.height : naturalDimensions.width) * portionFitScale;
  const portionDispH = (isRotated90or270 ? naturalDimensions.width : naturalDimensions.height) * portionFitScale;

  // Pan / Drag handlers (Page Preset mode)
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (cropMode !== "page_preset") return;
    setIsDragging(true);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - cropOffset.x, y: clientY - cropOffset.y });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (cropMode === "page_preset" && isDragging) {
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
        setCropOffset({
          x: clientX - dragStart.x,
          y: clientY - dragStart.y,
        });
      } else if (cropMode === "portion_select" && activeHandle && resizeStart && portionViewportRef.current) {
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
        const rect = portionViewportRef.current.getBoundingClientRect();
        const deltaXPercent = ((clientX - resizeStart.clientX) / rect.width) * 100;
        const deltaYPercent = ((clientY - resizeStart.clientY) / rect.height) * 100;

        const b = resizeStart.box;
        let newX = b.x;
        let newY = b.y;
        let newW = b.width;
        let newH = b.height;

        if (activeHandle === "move") {
          newX = Math.max(0, Math.min(100 - b.width, b.x + deltaXPercent));
          newY = Math.max(0, Math.min(100 - b.height, b.y + deltaYPercent));
        } else {
          if (activeHandle.includes("e")) {
            newW = Math.max(10, Math.min(100 - b.x, b.width + deltaXPercent));
          }
          if (activeHandle.includes("s")) {
            newH = Math.max(10, Math.min(100 - b.y, b.height + deltaYPercent));
          }
          if (activeHandle.includes("w")) {
            const possibleX = Math.max(0, Math.min(b.x + b.width - 10, b.x + deltaXPercent));
            newW = b.x + b.width - possibleX;
            newX = possibleX;
          }
          if (activeHandle.includes("n")) {
            const possibleY = Math.max(0, Math.min(b.y + b.height - 10, b.y + deltaYPercent));
            newH = b.y + b.height - possibleY;
            newY = possibleY;
          }
        }

        setSelectionBox({ x: newX, y: newY, width: newW, height: newH });
      }
    },
    [cropMode, isDragging, dragStart, activeHandle, resizeStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setActiveHandle(null);
    setResizeStart(null);
  }, []);

  useEffect(() => {
    if (isDragging || activeHandle) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleMouseMove);
      window.addEventListener("touchend", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleMouseMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging, activeHandle, handleMouseMove, handleMouseUp]);

  // Start dragging or resizing the selection box in portion select mode
  const handleSelectionHandleStart = (
    e: React.MouseEvent | React.TouchEvent,
    handle: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setActiveHandle(handle);
    setResizeStart({
      clientX,
      clientY,
      box: { ...selectionBox },
    });
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
        // Calculate the exact selected pixel rectangle in natural rotated space
        const selNormX = selectionBox.x / 100;
        const selNormY = selectionBox.y / 100;
        const selNormW = selectionBox.width / 100;
        const selNormH = selectionBox.height / 100;

        const portionRatio = (selNormW * effNaturalWidth) / (selNormH * effNaturalHeight);

        // Standard A4 print sheet canvas (2480 x 3508 at 300 DPI)
        const canvasW = 2480;
        const a4Aspect = 1 / 1.414;
        const canvasH = Math.round(canvasW / a4Aspect);

        canvas.width = canvasW;
        canvas.height = canvasH;

        // Clean white background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvasW, canvasH);

        // First, create an intermediate canvas of the rotated image
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
            setIsProcessing(false);
            return;
          }
          const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.96);
          onApplyCrop(blob, croppedDataUrl);
          setIsProcessing(false);
          onClose();
        },
        "image/jpeg",
        0.96
      );
    } catch {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-2.5 sm:p-5 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative flex max-h-[96vh] w-full max-w-2xl flex-col rounded-3xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 sm:px-6 py-3 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-xs">
              <Crop className="size-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                Crop Image &amp; Portion Selection
              </h3>
              <p className="text-[11px] text-slate-500 truncate max-w-xs sm:max-w-md">
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
        <div className="flex items-center border-b border-slate-200 bg-slate-100/80 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setCropMode("page_preset")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold transition-all cursor-pointer",
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
              "flex-1 flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold transition-all cursor-pointer",
              cropMode === "portion_select"
                ? "bg-white text-emerald-900 shadow-sm border border-slate-200/80"
                : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
            )}
          >
            <BoxSelect className="size-4 text-emerald-600" />
            <span>✂️ Select Portion / Snippet</span>
          </button>
        </div>

        {/* Page Preset Options (Only in page_preset mode) */}
        {cropMode === "page_preset" && (
          <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="text-[11px] font-bold text-slate-500 shrink-0 mr-1">
                Preset:
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

        {/* Viewport / Crop Canvas Box */}
        <div className="relative flex flex-1 min-h-[280px] sm:min-h-[350px] items-center justify-center overflow-hidden bg-slate-900 p-4 select-none">
          {cropMode === "page_preset" ? (
            /* MODE A: Page Frame Fit */
            <div
              ref={frameContainerRef}
              className="relative flex items-center justify-center overflow-hidden border-2 border-dashed border-emerald-400 rounded-xl shadow-2xl bg-white cursor-grab active:cursor-grabbing transition-all"
              style={{
                width: `${frameWidth}px`,
                height: `${frameHeight}px`,
              }}
              onMouseDown={handleMouseDown}
              onTouchStart={handleMouseDown}
            >
              {/* Guide Grid Overlay */}
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 border border-emerald-400/20 z-20">
                <div className="border-r border-b border-emerald-400/15" />
                <div className="border-r border-b border-emerald-400/15" />
                <div className="border-b border-emerald-400/15" />
                <div className="border-r border-b border-emerald-400/15" />
                <div className="border-r border-b border-emerald-400/15" />
                <div className="border-b border-emerald-400/15" />
                <div className="border-r border-emerald-400/15" />
                <div className="border-r border-emerald-400/15" />
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
                className="select-none pointer-events-none transition-transform duration-75 origin-center"
                style={{
                  width: baseDisplayWidth > 0 ? `${baseDisplayWidth}px` : "auto",
                  height: baseDisplayHeight > 0 ? `${baseDisplayHeight}px` : "auto",
                  transform: `translate(${cropOffset.x}px, ${cropOffset.y}px) rotate(${rotation}deg) scale(${zoom})`,
                }}
              />
            </div>
          ) : (
            /* MODE B: Interactive Portion / Snippet Selection */
            <div
              ref={portionViewportRef}
              className="relative flex items-center justify-center overflow-hidden rounded-xl shadow-2xl bg-black border border-slate-700"
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
                className="select-none pointer-events-none origin-center"
                style={{
                  width: `${portionDispW}px`,
                  height: `${portionDispH}px`,
                  transform: `rotate(${rotation}deg)`,
                }}
              />

              {/* Dimming Mask Around Selection Box */}
              <div className="absolute inset-0 bg-black/60 pointer-events-none z-10" />

              {/* Active Selection Box */}
              <div
                className="absolute z-20 border-2 border-emerald-400 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] cursor-move transition-shadow"
                style={{
                  left: `${selectionBox.x}%`,
                  top: `${selectionBox.y}%`,
                  width: `${selectionBox.width}%`,
                  height: `${selectionBox.height}%`,
                }}
                onMouseDown={(e) => handleSelectionHandleStart(e, "move")}
                onTouchStart={(e) => handleSelectionHandleStart(e, "move")}
              >
                {/* 3x3 Grid inside selection box */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                  <div className="border-r border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-b border-white/20" />
                  <div className="border-r border-white/20" />
                  <div className="border-r border-white/20" />
                  <div />
                </div>

                {/* Move Handle Badge */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-700/80 px-2 py-0.5 text-[9px] font-bold text-white flex items-center gap-1 shadow-md pointer-events-none">
                  <Move className="size-2.5" /> Drag Box
                </div>

                {/* Corner Resizing Handles */}
                <div
                  className="absolute -top-2 -left-2 size-4.5 rounded-full bg-emerald-500 border-2 border-white shadow-md cursor-nwse-resize"
                  onMouseDown={(e) => handleSelectionHandleStart(e, "nw")}
                  onTouchStart={(e) => handleSelectionHandleStart(e, "nw")}
                />
                <div
                  className="absolute -top-2 -right-2 size-4.5 rounded-full bg-emerald-500 border-2 border-white shadow-md cursor-nesw-resize"
                  onMouseDown={(e) => handleSelectionHandleStart(e, "ne")}
                  onTouchStart={(e) => handleSelectionHandleStart(e, "ne")}
                />
                <div
                  className="absolute -bottom-2 -left-2 size-4.5 rounded-full bg-emerald-500 border-2 border-white shadow-md cursor-nesw-resize"
                  onMouseDown={(e) => handleSelectionHandleStart(e, "sw")}
                  onTouchStart={(e) => handleSelectionHandleStart(e, "sw")}
                />
                <div
                  className="absolute -bottom-2 -right-2 size-4.5 rounded-full bg-emerald-500 border-2 border-white shadow-md cursor-nwse-resize"
                  onMouseDown={(e) => handleSelectionHandleStart(e, "se")}
                  onTouchStart={(e) => handleSelectionHandleStart(e, "se")}
                />

                {/* Edge Handles */}
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-2.5 w-6 rounded-full bg-emerald-500 border border-white cursor-ns-resize"
                  onMouseDown={(e) => handleSelectionHandleStart(e, "n")}
                  onTouchStart={(e) => handleSelectionHandleStart(e, "n")}
                />
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 h-2.5 w-6 rounded-full bg-emerald-500 border border-white cursor-ns-resize"
                  onMouseDown={(e) => handleSelectionHandleStart(e, "s")}
                  onTouchStart={(e) => handleSelectionHandleStart(e, "s")}
                />
                <div
                  className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-2.5 h-6 rounded-full bg-emerald-500 border border-white cursor-ew-resize"
                  onMouseDown={(e) => handleSelectionHandleStart(e, "w")}
                  onTouchStart={(e) => handleSelectionHandleStart(e, "w")}
                />
                <div
                  className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-2.5 h-6 rounded-full bg-emerald-500 border border-white cursor-ew-resize"
                  onMouseDown={(e) => handleSelectionHandleStart(e, "e")}
                  onTouchStart={(e) => handleSelectionHandleStart(e, "e")}
                />
              </div>
            </div>
          )}

          {/* Quick Guidance Hint */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 px-3 py-1 text-[10px] font-bold text-white/90 backdrop-blur-xs pointer-events-none shadow-md">
            {cropMode === "portion_select"
              ? "✂️ Drag corners to select only the portion you want printed"
              : "🖐️ Drag to reposition · White area = printed page margins"}
          </div>
        </div>

        {/* Quick Fit Toolbar & Zoom Controls */}
        <div className="border-t border-slate-100 bg-white px-4 sm:px-6 py-3 space-y-2.5">
          {/* Row 1: Fit Actions & Rotation */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-1.5">
              {cropMode === "page_preset" ? (
                <>
                  <button
                    type="button"
                    onClick={handleFitEntireImage}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 transition active:scale-95 cursor-pointer"
                  >
                    <Minimize2 className="size-3.5 text-emerald-600" />
                    <span>Fit Entire Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleFillPage}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 transition active:scale-95 cursor-pointer"
                  >
                    <Maximize2 className="size-3.5 text-emerald-600" />
                    <span>Fill Page</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectionBox({ x: 0, y: 0, width: 100, height: 100 })}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 transition active:scale-95 cursor-pointer"
                  >
                    <Maximize2 className="size-3.5 text-emerald-600" />
                    <span>Select All</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectionBox({ x: 20, y: 20, width: 60, height: 60 })}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 transition active:scale-95 cursor-pointer"
                  >
                    <BoxSelect className="size-3.5 text-emerald-600" />
                    <span>Center Snippet</span>
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleRotate}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition active:scale-95 cursor-pointer"
              >
                <RotateCw className="size-3.5 text-emerald-600" />
                <span>Rotate 90°</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition active:scale-95 cursor-pointer"
              >
                <RotateCcw className="size-3.5 text-slate-400" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Row 2: Zoom Slider & Save */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Zoom Slider (Active in Page Preset mode) */}
            {cropMode === "page_preset" ? (
              <div className="flex items-center gap-2 min-w-[170px] sm:min-w-[220px] flex-1">
                <ZoomOut className="size-4 text-slate-400 shrink-0" />
                <input
                  type="range"
                  min="0.3"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-emerald-600"
                />
                <ZoomIn className="size-4 text-slate-400 shrink-0" />
                <span className="text-[11px] font-mono font-bold text-slate-600 min-w-[35px]">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
            ) : (
              <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5 flex-1">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span>Only the area inside the green box will be printed</span>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleSaveCrop}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-4 sm:px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-900/15 hover:from-emerald-500 hover:to-emerald-600 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isProcessing ? (
                  <span>Applying Selection...</span>
                ) : (
                  <>
                    <Sparkles className="size-4 text-amber-300" />
                    <span>
                      {cropMode === "portion_select" ? "Print Selected Portion" : "Save & Apply Crop"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
