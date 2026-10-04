"use client";

import { useState, useRef, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  RotateCw,
  Copy,
  LayoutGrid,
  Maximize2,
  Scissors,
  Check,
  Upload,
  Move,
  Sparkles,
  Layers,
  ZoomIn,
  ZoomOut,
  ImageIcon,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PlacedImage = {
  id: string;
  dataUrl: string;
  filename: string;
  // Position & size in percentage of A4 sheet (0 to 100)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // 0, 90, 180, 270
  objectFit: "contain" | "cover";
  border: boolean;
};

export type LayoutTemplate =
  | "custom"
  | "grid-1"
  | "grid-2-vert"
  | "grid-2-horiz"
  | "grid-3-top"
  | "grid-4"
  | "grid-6"
  | "grid-8"
  | "grid-9"
  | "passport-4"
  | "passport-8"
  | "passport-16";

type Props = {
  isOpen: boolean;
  initialImages?: { dataUrl: string; filename: string }[];
  existingDocImages?: { dataUrl: string; filename: string }[];
  onClose: () => void;
  onApply: (blob: Blob, dataUrl: string, filename: string) => void;
};

const TEMPLATES: { id: LayoutTemplate; label: string; iconLabel: string; count: number }[] = [
  { id: "grid-2-vert", label: "2 Photos Stacked (ID Card Front & Back)", iconLabel: "Top / Bottom", count: 2 },
  { id: "grid-2-horiz", label: "2 Photos Side-by-Side", iconLabel: "Side by Side", count: 2 },
  { id: "grid-4", label: "4 Photos (2x2 Grid)", iconLabel: "2 × 2 Grid", count: 4 },
  { id: "grid-3-top", label: "3 Photos (1 Top + 2 Bottom)", iconLabel: "1 Top + 2 Bottom", count: 3 },
  { id: "grid-6", label: "6 Photos (2x3 Grid)", iconLabel: "2 × 3 Grid", count: 6 },
  { id: "grid-8", label: "8 Photos (2x4 Grid)", iconLabel: "2 × 4 Grid", count: 8 },
  { id: "grid-9", label: "9 Photos (3x3 Grid)", iconLabel: "3 × 3 Grid", count: 9 },
  { id: "passport-4", label: "4 Passport Size Photos", iconLabel: "4 Passports", count: 4 },
  { id: "passport-8", label: "8 Passport Size Photos", iconLabel: "8 Passports", count: 8 },
  { id: "passport-16", label: "16 Passport Size Photos", iconLabel: "16 Passports", count: 16 },
  { id: "grid-1", label: "1 Full Page Photo", iconLabel: "Full Page", count: 1 },
  { id: "custom", label: "Custom Freeform Canvas", iconLabel: "Freeform Drag & Drop", count: 0 },
];

function calculateLayoutPositions(
  tmpl: LayoutTemplate,
  imgList: PlacedImage[],
  orient: "portrait" | "landscape",
  margin: number,
  gap: number
): PlacedImage[] {
  if (tmpl === "custom" || imgList.length === 0) return imgList;

  const sheetW = orient === "portrait" ? 210 : 297;
  const sheetH = orient === "portrait" ? 297 : 210;

  const marginXPercent = (margin / sheetW) * 100;
  const marginYPercent = (margin / sheetH) * 100;
  const gapXPercent = (gap / sheetW) * 100;
  const gapYPercent = (gap / sheetH) * 100;

  const availW = 100 - 2 * marginXPercent;
  const availH = 100 - 2 * marginYPercent;

  let cols = 1;
  let rows = 1;

  switch (tmpl) {
    case "grid-1":
      cols = 1;
      rows = 1;
      break;
    case "grid-2-vert":
      cols = 1;
      rows = 2;
      break;
    case "grid-2-horiz":
      cols = 2;
      rows = 1;
      break;
    case "grid-3-top":
      cols = 2;
      rows = 2;
      break;
    case "grid-4":
      cols = 2;
      rows = 2;
      break;
    case "grid-6":
      cols = 2;
      rows = 3;
      break;
    case "grid-8":
      cols = 2;
      rows = 4;
      break;
    case "grid-9":
      cols = 3;
      rows = 3;
      break;
    case "passport-4":
      cols = 2;
      rows = 2;
      break;
    case "passport-8":
      cols = 4;
      rows = 2;
      break;
    case "passport-16":
      cols = 4;
      rows = 4;
      break;
    default:
      cols = 1;
      rows = 1;
  }

  const cellW = (availW - (cols - 1) * gapXPercent) / cols;
  const cellH = (availH - (rows - 1) * gapYPercent) / rows;

  return imgList.map((img, i) => {
    if (tmpl === "grid-3-top" && i === 0) {
      return {
        ...img,
        x: marginXPercent,
        y: marginYPercent,
        width: availW,
        height: cellH,
      };
    } else if (tmpl === "grid-3-top") {
      const subCol = i - 1;
      return {
        ...img,
        x: marginXPercent + subCol * (cellW + gapXPercent),
        y: marginYPercent + cellH + gapYPercent,
        width: cellW,
        height: cellH,
      };
    }

    const c = i % cols;
    const r = Math.floor(i / cols);

    return {
      ...img,
      x: marginXPercent + c * (cellW + gapXPercent),
      y: marginYPercent + r * (cellH + gapYPercent),
      width: cellW,
      height: cellH,
    };
  });
}

export function MultiImagePageModal({
  isOpen,
  initialImages = [],
  existingDocImages = [],
  onClose,
  onApply,
}: Props) {
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [template, setTemplate] = useState<LayoutTemplate>("grid-2-vert");
  const [marginMm, setMarginMm] = useState<number>(8); // Safe margins
  const [gapMm, setGapMm] = useState<number>(5); // Gap between photos
  const [showCuttingGuides, setShowCuttingGuides] = useState<boolean>(true);
  const [photoBorder, setPhotoBorder] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [mobileTab, setMobileTab] = useState<"canvas" | "presets" | "settings">("canvas");

  const [images, setImages] = useState<PlacedImage[]>(() => {
    const startingImages = initialImages.length > 0 ? initialImages : existingDocImages.slice(0, 4);
    if (startingImages.length > 0) {
      const placed: PlacedImage[] = startingImages.map((img, idx) => ({
        id: `img-${Date.now()}-${idx}`,
        dataUrl: img.dataUrl,
        filename: img.filename,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        objectFit: "contain",
        border: false,
      }));
      return calculateLayoutPositions("grid-2-vert", placed, "portrait", 8, 5);
    }
    return [];
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Dragging state on canvas
  const [dragState, setDragState] = useState<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    corner?: string;
  } | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTemplateChange = (newTemplate: LayoutTemplate) => {
    setTemplate(newTemplate);
    if (newTemplate !== "custom") {
      setImages((prev) => calculateLayoutPositions(newTemplate, prev, orientation, marginMm, gapMm));
    }
  };

  const handleOrientationChange = (newOrient: "portrait" | "landscape") => {
    setOrientation(newOrient);
    if (template !== "custom") {
      setImages((prev) => calculateLayoutPositions(template, prev, newOrient, marginMm, gapMm));
    }
  };

  const handleMarginChange = (newMargin: number) => {
    setMarginMm(newMargin);
    if (template !== "custom") {
      setImages((prev) => calculateLayoutPositions(template, prev, orientation, newMargin, gapMm));
    }
  };

  const handleGapChange = (newGap: number) => {
    setGapMm(newGap);
    if (template !== "custom") {
      setImages((prev) => calculateLayoutPositions(template, prev, orientation, marginMm, newGap));
    }
  };

  // Add new image from file input
  const handleAddFiles = (files: File[]) => {
    const valid = files.filter((f) => f.type.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(f.name));
    if (valid.length === 0) return;

    valid.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setImages((prev) => {
          const newImg: PlacedImage = {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            dataUrl,
            filename: file.name,
            x: 10,
            y: 10,
            width: 40,
            height: 40,
            rotation: 0,
            objectFit: "contain",
            border: photoBorder,
          };
          const nextList = [...prev, newImg];
          if (template !== "custom") {
            return calculateLayoutPositions(template, nextList, orientation, marginMm, gapMm);
          }
          return nextList;
        });
      };
      reader.readAsDataURL(file);
    });
  };

  // Duplicate an image
  const handleDuplicateImage = (imgId: string) => {
    const src = images.find((i) => i.id === imgId);
    if (!src) return;

    const dup: PlacedImage = {
      ...src,
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: src.x + 4,
      y: src.y + 4,
    };
    const nextList = [...images, dup];
    setSelectedId(dup.id);
    if (template !== "custom") {
      setImages(calculateLayoutPositions(template, nextList, orientation, marginMm, gapMm));
    } else {
      setImages(nextList);
    }
  };

  // Replicate single image across all slots of the chosen template
  const handleReplicateToFill = (imgId: string) => {
    const src = images.find((i) => i.id === imgId);
    if (!src) return;

    const tmplObj = TEMPLATES.find((t) => t.id === template);
    const targetCount = tmplObj?.count || 4;

    const filled: PlacedImage[] = Array.from({ length: targetCount }, (_, idx) => ({
      ...src,
      id: `img-${Date.now()}-${idx}`,
    }));

    setImages(calculateLayoutPositions(template, filled, orientation, marginMm, gapMm));
  };

  // Delete an image
  const handleDeleteImage = (imgId: string) => {
    const nextList = images.filter((i) => i.id !== imgId);
    if (selectedId === imgId) setSelectedId(null);
    if (template !== "custom") {
      setImages(calculateLayoutPositions(template, nextList, orientation, marginMm, gapMm));
    } else {
      setImages(nextList);
    }
  };

  // Rotate an image
  const handleRotateImage = (imgId: string) => {
    setImages((prev) =>
      prev.map((img) =>
        img.id === imgId
          ? { ...img, rotation: (img.rotation + 90) % 360 }
          : img
      )
    );
  };

  // Toggle Object Fit
  const handleToggleFit = (imgId: string) => {
    setImages((prev) =>
      prev.map((img) =>
        img.id === imgId
          ? { ...img, objectFit: img.objectFit === "contain" ? "cover" : "contain" }
          : img
      )
    );
  };

  // Drag & Move / Resize Handlers on Sheet
  const handlePointerDown = (
    e: React.PointerEvent,
    id: string,
    mode: "move" | "resize",
    corner?: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(id);

    const img = images.find((i) => i.id === id);
    if (!img) return;

    setDragState({
      id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: img.x,
      origY: img.y,
      origW: img.width,
      origH: img.height,
      corner,
    });
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!dragState || !sheetRef.current) return;

      const rect = sheetRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const deltaXPercent = ((e.clientX - dragState.startX) / rect.width) * 100;
      const deltaYPercent = ((e.clientY - dragState.startY) / rect.height) * 100;

      if (dragState.mode === "move") {
        const nextX = Math.max(0, Math.min(100 - dragState.origW, dragState.origX + deltaXPercent));
        const nextY = Math.max(0, Math.min(100 - dragState.origH, dragState.origY + deltaYPercent));

        setImages((prev) =>
          prev.map((img) =>
            img.id === dragState.id ? { ...img, x: nextX, y: nextY } : img
          )
        );
        if (template !== "custom") setTemplate("custom");
      } else if (dragState.mode === "resize" && dragState.corner) {
        let nextW = dragState.origW;
        let nextH = dragState.origH;
        let nextX = dragState.origX;
        let nextY = dragState.origY;

        if (dragState.corner.includes("e")) {
          nextW = Math.max(5, Math.min(100 - nextX, dragState.origW + deltaXPercent));
        }
        if (dragState.corner.includes("s")) {
          nextH = Math.max(5, Math.min(100 - nextY, dragState.origH + deltaYPercent));
        }
        if (dragState.corner.includes("w")) {
          const possibleW = dragState.origW - deltaXPercent;
          if (possibleW >= 5 && dragState.origX + deltaXPercent >= 0) {
            nextW = possibleW;
            nextX = dragState.origX + deltaXPercent;
          }
        }
        if (dragState.corner.includes("n")) {
          const possibleH = dragState.origH - deltaYPercent;
          if (possibleH >= 5 && dragState.origY + deltaYPercent >= 0) {
            nextH = possibleH;
            nextY = dragState.origY + deltaYPercent;
          }
        }

        setImages((prev) =>
          prev.map((img) =>
            img.id === dragState.id
              ? { ...img, x: nextX, y: nextY, width: nextW, height: nextH }
              : img
          )
        );
        if (template !== "custom") setTemplate("custom");
      }
    };

    const handlePointerUp = () => {
      setDragState(null);
    };

    if (dragState) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    }
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, template]);

  // Render high resolution A4 canvas (300 DPI) and export
  const handleGenerateAndApply = async () => {
    if (images.length === 0) {
      alert("Please add at least one image to place on the page.");
      return;
    }

    setIsRendering(true);
    try {
      // 300 DPI A4 Dimensions:
      // Portrait: 2480 x 3508 px
      // Landscape: 3508 x 2480 px
      const canvasW = orientation === "portrait" ? 2480 : 3508;
      const canvasH = orientation === "portrait" ? 3508 : 2480;

      const canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not initialize canvas context");

      // Fill pure crisp white background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Preload all HTMLImageElements
      const loadedImgs = await Promise.all(
        images.map(
          (item) =>
            new Promise<{ item: PlacedImage; img: HTMLImageElement }>((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.onload = () => resolve({ item, img });
              img.onerror = () => reject(new Error(`Failed to load ${item.filename}`));
              img.src = item.dataUrl;
            })
        )
      );

      // Draw each placed image onto high-res canvas
      for (const { item, img } of loadedImgs) {
        const destX = (item.x / 100) * canvasW;
        const destY = (item.y / 100) * canvasH;
        const destW = (item.width / 100) * canvasW;
        const destH = (item.height / 100) * canvasH;

        ctx.save();

        // Clip to destination rectangle
        ctx.beginPath();
        ctx.rect(destX, destY, destW, destH);
        ctx.clip();

        // Transform for rotation if any
        if (item.rotation !== 0) {
          const centerX = destX + destW / 2;
          const centerY = destY + destH / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate((item.rotation * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }

        // Calculate aspect-ratio preserving dimensions
        const naturalW = img.naturalWidth || img.width;
        const naturalH = img.naturalHeight || img.height;
        const naturalAspect = naturalW / naturalH;
        const destAspect = destW / destH;

        let drawW = destW;
        let drawH = destH;
        let drawX = destX;
        let drawY = destY;

        if (item.objectFit === "contain") {
          if (naturalAspect > destAspect) {
            // Image is wider than cell
            drawW = destW;
            drawH = destW / naturalAspect;
            drawY = destY + (destH - drawH) / 2;
          } else {
            // Image is taller than cell
            drawH = destH;
            drawW = destH * naturalAspect;
            drawX = destX + (destW - drawW) / 2;
          }
        } else {
          // Cover mode
          if (naturalAspect > destAspect) {
            drawH = destH;
            drawW = destH * naturalAspect;
            drawX = destX + (destW - drawW) / 2;
          } else {
            drawW = destW;
            drawH = destW / naturalAspect;
            drawY = destY + (destH - drawH) / 2;
          }
        }

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();

        // Draw optional photo border
        if (photoBorder || item.border) {
          ctx.save();
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 3;
          ctx.strokeRect(destX, destY, destW, destH);
          ctx.restore();
        }
      }

      // Draw optional cutting guide lines
      if (showCuttingGuides && images.length > 1) {
        ctx.save();
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);

        // Draw dashed borders around image cells
        for (const item of images) {
          const destX = (item.x / 100) * canvasW;
          const destY = (item.y / 100) * canvasH;
          const destW = (item.width / 100) * canvasW;
          const destH = (item.height / 100) * canvasH;
          ctx.strokeRect(destX - 2, destY - 2, destW + 4, destH + 4);
        }
        ctx.restore();
      }

      // Export as high quality JPEG blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            alert("Failed to render page image.");
            setIsRendering(false);
            return;
          }
          const generatedDataUrl = canvas.toDataURL("image/jpeg", 0.98);
          const generatedName = `multi-photo-sheet-${orientation}-${Date.now()}.jpg`;

          onApply(blob, generatedDataUrl, generatedName);
          setIsRendering(false);
          onClose();
        },
        "image/jpeg",
        0.98
      );
    } catch (err) {
      console.error("Multi-image rendering failed:", err);
      alert("Failed to generate multi-image printout sheet.");
      setIsRendering(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
      {/* Hidden File Input for Adding Images */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          handleAddFiles(files);
          e.currentTarget.value = "";
        }}
      />

      <div className="relative flex flex-col w-full max-w-6xl max-h-[96vh] rounded-3xl bg-white border border-slate-200/90 shadow-2xl text-slate-900 overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/90 bg-slate-50/90">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <LayoutGrid className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Multiple Photos on 1 Page
                <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-bold">
                  A4 Print Sheet
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Arrange, resize, and print multiple photos, ID cards, or passport photos together on a single A4 page.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Mobile Navigation Tabs (visible on mobile only) */}
        <div className="lg:hidden flex items-center border-b border-slate-200 bg-slate-50/95 p-1.5 gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab("canvas")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer",
              mobileTab === "canvas"
                ? "bg-white text-emerald-950 shadow-2xs border border-emerald-300 ring-1 ring-emerald-500/20"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Eye className="size-3.5 text-emerald-600" />
            <span>Sheet Canvas</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("presets")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer",
              mobileTab === "presets"
                ? "bg-white text-emerald-950 shadow-2xs border border-emerald-300 ring-1 ring-emerald-500/20"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <LayoutGrid className="size-3.5 text-emerald-600" />
            <span>Presets ({images.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("settings")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer",
              mobileTab === "settings"
                ? "bg-white text-emerald-950 shadow-2xs border border-emerald-300 ring-1 ring-emerald-500/20"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Layers className="size-3.5 text-emerald-600" />
            <span>Margins &amp; Apply</span>
          </button>
        </div>

        {/* Main Workspace: Left Controls + Center Canvas + Right Settings */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden min-h-0">
          {/* Left Panel: Layout Presets & Images List (col-span-3) */}
          <div className={cn("lg:col-span-3 border-r border-slate-200/90 bg-slate-50/60 p-4 space-y-4 overflow-y-auto max-h-[80vh] no-scrollbar", mobileTab !== "presets" && "hidden lg:block")}>
            {/* Template Selector */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                1. Choose Layout Preset
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => handleTemplateChange(tmpl.id)}
                    className={cn(
                      "flex flex-col items-start rounded-xl p-2 text-left text-xs transition border cursor-pointer",
                      template === tmpl.id
                        ? "border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-xs ring-1 ring-emerald-500/20"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100/70 hover:border-slate-300"
                    )}
                  >
                    <span className="font-semibold truncate w-full">{tmpl.iconLabel}</span>
                    <span className={cn("text-[10px] truncate w-full mt-0.5", template === tmpl.id ? "text-emerald-700 font-medium" : "text-slate-400")}>
                      {tmpl.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Images on Sheet List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  2. Photos on Page ({images.length})
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  <Plus className="size-3.5" /> Add Photo
                </button>
              </div>

              {images.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/40 transition"
                >
                  <Upload className="size-6 text-emerald-600 mx-auto" />
                  <p className="mt-2 text-xs font-bold text-slate-700">Tap to Add Photos</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Upload photos from device or gallery</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {images.map((img, idx) => (
                    <div
                      key={img.id}
                      onClick={() => setSelectedId(img.id)}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-xl border p-2 text-xs transition cursor-pointer",
                        selectedId === img.id
                          ? "border-emerald-600 bg-emerald-50 text-emerald-950 font-bold ring-1 ring-emerald-500/20 shadow-2xs"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.dataUrl}
                          alt={img.filename}
                          className="size-8 rounded-md object-cover bg-slate-100 shrink-0 border border-slate-200"
                        />
                        <span className="truncate text-xs font-medium text-slate-800">
                          #{idx + 1} {img.filename || "Photo"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          title="Rotate 90°"
                          onClick={() => handleRotateImage(img.id)}
                          className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"
                        >
                          <RotateCw className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Duplicate"
                          onClick={() => handleDuplicateImage(img.id)}
                          className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"
                        >
                          <Copy className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => handleDeleteImage(img.id)}
                          className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick Fill / Duplicate button */}
              {images.length === 1 && template !== "custom" && (
                <button
                  type="button"
                  onClick={() => handleReplicateToFill(images[0].id)}
                  className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-850 hover:bg-emerald-100 transition cursor-pointer shadow-2xs"
                >
                  <Sparkles className="size-3.5 text-emerald-600" />
                  Fill All Sheet Slots with This Photo
                </button>
              )}
            </div>
          </div>

          {/* Center: Live Interactive A4 Sheet Canvas (col-span-6) */}
          <div className={cn("lg:col-span-6 flex flex-col items-center justify-center p-3 sm:p-4 bg-slate-100/90 relative overflow-auto min-h-[380px] sm:min-h-[420px]", mobileTab !== "canvas" && "hidden lg:flex")}>
            {/* Zoom Controls */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/95 border border-slate-200/90 rounded-xl px-2 py-1 shadow-md z-20 backdrop-blur-xs">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}
                className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="size-3.5" />
              </button>
              <span className="text-[11px] font-bold text-slate-700 min-w-9 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))}
                className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="size-3.5" />
              </button>
            </div>

            {/* A4 Sheet Container */}
            <div
              ref={sheetRef}
              style={{
                width: orientation === "portrait" ? `${320 * zoom}px` : `${452 * zoom}px`,
                height: orientation === "portrait" ? `${452 * zoom}px` : `${320 * zoom}px`,
                aspectRatio: orientation === "portrait" ? "210 / 297" : "297 / 210",
              }}
              onClick={() => setSelectedId(null)}
              className="relative bg-white shadow-2xl rounded-xs border-2 border-slate-300 overflow-hidden transition-all duration-150 select-none cursor-default max-w-full"
            >
              {/* Safe Print Margins Guide */}
              <div
                style={{
                  top: `${(marginMm / (orientation === "portrait" ? 297 : 210)) * 100}%`,
                  bottom: `${(marginMm / (orientation === "portrait" ? 297 : 210)) * 100}%`,
                  left: `${(marginMm / (orientation === "portrait" ? 210 : 297)) * 100}%`,
                  right: `${(marginMm / (orientation === "portrait" ? 210 : 297)) * 100}%`,
                }}
                className="absolute border border-dashed border-emerald-500/50 pointer-events-none z-0"
              />

              {/* Placed Images on Sheet */}
              {images.map((img) => {
                const isSelected = selectedId === img.id;

                return (
                  <div
                    key={img.id}
                    onPointerDown={(e) => handlePointerDown(e, img.id, "move")}
                    style={{
                      left: `${img.x}%`,
                      top: `${img.y}%`,
                      width: `${img.width}%`,
                      height: `${img.height}%`,
                    }}
                    className={cn(
                      "absolute flex items-center justify-center p-0.5 transition-shadow cursor-move z-10",
                      isSelected
                        ? "ring-2 ring-emerald-600 shadow-xl z-20"
                        : "hover:ring-1 hover:ring-emerald-400/80"
                    )}
                  >
                    <div
                      style={{
                        transform: `rotate(${img.rotation}deg)`,
                      }}
                      className={cn(
                        "w-full h-full relative overflow-hidden flex items-center justify-center transition-transform",
                        (photoBorder || img.border) && "border border-slate-300"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.dataUrl}
                        alt={img.filename}
                        draggable={false}
                        className={cn(
                          "w-full h-full pointer-events-none select-none",
                          img.objectFit === "cover" ? "object-cover" : "object-contain"
                        )}
                      />
                    </div>

                    {/* Resize Handles for Selected Image */}
                    {isSelected && (
                      <>
                        {/* SE Corner Resize Handle */}
                        <div
                          onPointerDown={(e) => handlePointerDown(e, img.id, "resize", "se")}
                          className="absolute -bottom-3 -right-3 size-8 flex items-center justify-center cursor-se-resize select-none touch-none z-30"
                        >
                          <div className="size-4 rounded-full bg-emerald-600 border-2 border-white shadow-md ring-1 ring-emerald-950/20" />
                        </div>
                        {/* SW Corner */}
                        <div
                          onPointerDown={(e) => handlePointerDown(e, img.id, "resize", "sw")}
                          className="absolute -bottom-3 -left-3 size-8 flex items-center justify-center cursor-sw-resize select-none touch-none z-30"
                        >
                          <div className="size-4 rounded-full bg-emerald-600 border-2 border-white shadow-md ring-1 ring-emerald-950/20" />
                        </div>
                        {/* NE Corner */}
                        <div
                          onPointerDown={(e) => handlePointerDown(e, img.id, "resize", "ne")}
                          className="absolute -top-3 -right-3 size-8 flex items-center justify-center cursor-ne-resize select-none touch-none z-30"
                        >
                          <div className="size-4 rounded-full bg-emerald-600 border-2 border-white shadow-md ring-1 ring-emerald-950/20" />
                        </div>
                        {/* NW Corner */}
                        <div
                          onPointerDown={(e) => handlePointerDown(e, img.id, "resize", "nw")}
                          className="absolute -top-3 -left-3 size-8 flex items-center justify-center cursor-nw-resize select-none touch-none z-30"
                        >
                          <div className="size-4 rounded-full bg-emerald-600 border-2 border-white shadow-md ring-1 ring-emerald-950/20" />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Empty Sheet Placeholder */}
              {images.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                  <ImageIcon className="size-10 text-slate-300 mb-2" />
                  <p className="text-xs font-bold text-slate-600">A4 Blank Sheet</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Choose a preset on the left or add photos to begin.
                  </p>
                </div>
              )}
            </div>

            <p className="mt-3 text-[11px] text-slate-500 flex items-center gap-1">
              <Move className="size-3 text-emerald-600" />
              Click &amp; drag photos on sheet to reposition or resize corner handles
            </p>

            {/* Mobile Bottom Quick Actions */}
            <div className="lg:hidden mt-3 w-full max-w-sm flex items-center gap-2 z-20">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 py-2.5 px-3 text-xs font-bold text-emerald-800 shadow-2xs active:scale-95 cursor-pointer"
              >
                <Plus className="size-3.5 text-emerald-600" />
                <span>Add Photo</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileTab("settings")}
                className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 px-3 text-xs font-bold text-white shadow-xs active:scale-95 cursor-pointer"
              >
                <Check className="size-3.5" />
                <span>Margins &amp; Apply</span>
              </button>
            </div>
          </div>

          {/* Right Panel: Page, Orientation & Output Controls (col-span-3) */}
          <div className={cn("lg:col-span-3 border-l border-slate-200/90 bg-slate-50/60 p-4 space-y-4 overflow-y-auto max-h-[80vh] no-scrollbar", mobileTab !== "settings" && "hidden lg:block")}>
            {/* Orientation */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                Page Orientation
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleOrientationChange("portrait")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-bold transition cursor-pointer",
                    orientation === "portrait"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500/20 shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                  )}
                >
                  📄 A4 Portrait
                </button>
                <button
                  type="button"
                  onClick={() => handleOrientationChange("landscape")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl border p-2.5 text-xs font-bold transition cursor-pointer",
                    orientation === "landscape"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500/20 shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                  )}
                >
                  📑 A4 Landscape
                </button>
              </div>
            </div>

            {/* Selected Image Controls (If one is active) */}
            {selectedId && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 space-y-2.5 shadow-2xs">
                <p className="text-xs font-bold text-emerald-900 flex items-center justify-between">
                  <span>Selected Photo Controls</span>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="text-[10px] text-emerald-700 hover:text-emerald-900 font-semibold underline cursor-pointer"
                  >
                    Deselect
                  </button>
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRotateImage(selectedId)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs cursor-pointer"
                  >
                    <RotateCw className="size-3 text-emerald-600" /> Rotate 90°
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleFit(selectedId)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs cursor-pointer"
                  >
                    <Maximize2 className="size-3 text-emerald-600" /> Fit / Fill
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicateImage(selectedId)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs cursor-pointer"
                  >
                    <Copy className="size-3 text-emerald-600" /> Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteImage(selectedId)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 hover:border-rose-300 shadow-2xs cursor-pointer"
                  >
                    <Trash2 className="size-3 text-rose-600" /> Remove
                  </button>
                </div>
              </div>
            )}

            {/* Print Guides & Spacing Options */}
            <div className="space-y-3 pt-1">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-600 font-semibold">Page Margins:</span>
                  <span className="font-bold text-emerald-900">{marginMm} mm</span>
                </div>
                <div className="flex gap-1.5">
                  {[0, 5, 8, 12, 16].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleMarginChange(m)}
                      className={cn(
                        "flex-1 rounded-lg border py-1 text-xs font-medium transition cursor-pointer",
                        marginMm === m
                          ? "border-emerald-600 bg-emerald-600 text-white font-bold shadow-2xs"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:border-slate-300"
                      )}
                    >
                      {m === 0 ? "0" : `${m}mm`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-600 font-semibold">Gap Between Photos:</span>
                  <span className="font-bold text-emerald-900">{gapMm} mm</span>
                </div>
                <div className="flex gap-1.5">
                  {[0, 3, 5, 8, 12].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => handleGapChange(g)}
                      className={cn(
                        "flex-1 rounded-lg border py-1 text-xs font-medium transition cursor-pointer",
                        gapMm === g
                          ? "border-emerald-600 bg-emerald-600 text-white font-bold shadow-2xs"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:border-slate-300"
                      )}
                    >
                      {g === 0 ? "0" : `${g}mm`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <label className="flex items-center justify-between gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                  <span className="flex items-center gap-1.5">
                    <Scissors className="size-3.5 text-emerald-600" />
                    Dashed Cutting Guides
                  </span>
                  <input
                    type="checkbox"
                    checked={showCuttingGuides}
                    onChange={(e) => setShowCuttingGuides(e.target.checked)}
                    className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                  <span className="flex items-center gap-1.5">
                    <Layers className="size-3.5 text-emerald-600" />
                    Thin Photo Outline
                  </span>
                  <input
                    type="checkbox"
                    checked={photoBorder}
                    onChange={(e) => {
                      setPhotoBorder(e.target.checked);
                      setImages((prev) => prev.map((i) => ({ ...i, border: e.target.checked })));
                    }}
                    className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                  />
                </label>
              </div>
            </div>

            {/* Apply & Add to Order Button */}
            <div className="pt-3 border-t border-slate-200">
              <button
                type="button"
                disabled={isRendering || images.length === 0}
                onClick={handleGenerateAndApply}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-[0_4px_0_#047857,0_10px_20px_-2px_rgba(5,150,105,0.3)] transition hover:bg-emerald-700 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 cursor-pointer"
              >
                {isRendering ? (
                  <>
                    <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Rendering 300 DPI A4 Page...</span>
                  </>
                ) : (
                  <>
                    <Check className="size-4" />
                    <span>Apply &amp; Add Page to Print</span>
                  </>
                )}
              </button>
              <p className="mt-1.5 text-[10px] text-center text-slate-400 font-medium">
                Compiles crystal clear 300 DPI A4 sheet ready for instant printing.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
