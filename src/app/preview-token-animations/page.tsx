"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, RotateCcw, AlertTriangle, Layers, Sliders, CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Mock public shop & documents for interactive preview
const MOCK_SHOP = {
  id: "shop_preview_01",
  name: "Apex Cyber & Print Point",
  public_id: "apex-cyber",
  address: "Shop #4, College Gate Road",
  status: "online",
};

const MOCK_DOCS = [
  { id: "doc-1", name: "Annual_Report_2026.pdf", pageCount: 12 },
  { id: "doc-2", name: "Design_Brief_V2.pdf", pageCount: 3 },
];

const MOCK_ESTIMATE = {
  total: 42.0,
  totalPages: 15,
  colorPages: 2,
  bwPages: 13,
};

const MINIMAL_STEPS = [
  { label: "Validating", text: "Verifying document parameters..." },
  { label: "Calibrating", text: "Calibrating print layouts & paper settings..." },
  { label: "Connecting", text: "Connecting to shop counter terminal..." },
  { label: "Allocating", text: "Allocating priority queue token..." },
  { label: "Ready", text: "Token allocated. Ready for counter pickup." },
];

const SEGMENT_STEPS = [
  { label: "Validate" },
  { label: "Calibrate" },
  { label: "Terminal" },
  { label: "Assign" },
];

export default function PreviewTokenAnimationsPage() {
  const [progress, setProgress] = useState(45);
  const [activeStep, setActiveStep] = useState(2);
  const [isSimulating, setIsSimulating] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"all" | "linear" | "segmented" | "editorial" | "island">("all");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startSimulation = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsSimulating(true);
    setHasError(false);
    setProgress(0);
    setActiveStep(0);

    const steps = [
      { p: 16, s: 0, delay: 100 },
      { p: 40, s: 1, delay: 650 },
      { p: 65, s: 2, delay: 1300 },
      { p: 88, s: 3, delay: 1950 },
      { p: 100, s: 4, delay: 2600 },
    ];

    steps.forEach(({ p, s, delay }) => {
      setTimeout(() => {
        setProgress(p);
        setActiveStep(s);
        if (p === 100) {
          setIsSimulating(false);
        }
      }, delay);
    });
  };

  const resetSimulation = () => {
    setIsSimulating(false);
    setProgress(45);
    setActiveStep(2);
    setHasError(false);
  };

  const currentStep = MINIMAL_STEPS[Math.min(activeStep, MINIMAL_STEPS.length - 1)];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-mono text-slate-700 mb-2 border border-slate-200">
              <span className="size-2 rounded-full bg-slate-500 animate-pulse" />
              <span>Minimalist Animation Suite (4 Variants)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Customer Token Loading Animations
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-xl">
              Clean, modern, and quiet progress bar designs without loud or explicit colors. Monochromatic slate palette with high typographical discipline.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition"
            >
              Back to Home
            </Link>
          </div>
        </div>

        {/* Interactive Controls Bar */}
        <Card className="p-4 sm:p-5 border-slate-200/80 bg-white shadow-xs rounded-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Playback Actions */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={startSimulation}
                disabled={isSimulating}
                className="bg-slate-900 hover:bg-slate-800 text-white gap-2 font-medium"
              >
                <Play className="size-3.5 fill-current" />
                <span>{isSimulating ? "Simulating Sequence..." : "Run Token Animation"}</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={resetSimulation}
                className="border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5"
              >
                <RotateCcw className="size-3.5" />
                <span>Reset</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setHasError(!hasError)}
                className={cn(
                  "border-slate-200 gap-1.5 text-xs transition",
                  hasError ? "bg-rose-50 text-rose-700 border-rose-300" : "text-slate-600"
                )}
              >
                <AlertTriangle className="size-3.5" />
                <span>{hasError ? "Hide Error Notice" : "Test Error Notice"}</span>
              </Button>
            </div>

            {/* Manual Progress Scrub Slider */}
            <div className="flex items-center gap-3 w-full lg:w-72">
              <span className="text-xs font-mono text-slate-500 shrink-0">Progress:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={progress}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setProgress(val);
                  if (val < 25) setActiveStep(0);
                  else if (val < 50) setActiveStep(1);
                  else if (val < 75) setActiveStep(2);
                  else if (val < 98) setActiveStep(3);
                  else setActiveStep(4);
                }}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
              />
              <span className="text-xs font-mono font-bold text-slate-800 w-10 text-right">{progress}%</span>
            </div>

            {/* View Selector */}
            <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200/60 shrink-0">
              {(["all", "linear", "segmented", "editorial", "island"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSelectedTab(tab)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer capitalize",
                    selectedTab === tab
                      ? "bg-white text-slate-900 shadow-2xs font-semibold"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {tab === "all" ? "All 4 Grid" : tab}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Visual Showcase Grid */}
        <div className={cn(
          "gap-6",
          selectedTab === "all" ? "grid grid-cols-1 md:grid-cols-2" : "max-w-2xl mx-auto"
        )}>
          {/* OPTION 1: Minimal Linear (Vercel / Linear Monolith) */}
          {(selectedTab === "all" || selectedTab === "linear") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-500 px-1">
                <span className="font-semibold text-slate-800">Variant 1: Minimal Linear</span>
                <span className="text-slate-400">Vercel / Linear Aesthetic</span>
              </div>
              <Card className="p-6 border-slate-200/80 bg-white shadow-xs rounded-2xl relative overflow-hidden">
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                      <span className="size-1.5 rounded-full bg-slate-400 animate-pulse" />
                      <span>Counter Queue</span>
                    </div>
                    <div className="text-xs font-mono text-slate-400">
                      {MOCK_DOCS.length} files • {MOCK_ESTIMATE.totalPages} pages • ₹{MOCK_ESTIMATE.total.toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
                      Generating Token...
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Connecting with <b>{MOCK_SHOP.name}</b>’s counter printer for instant pickup.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-600 font-medium">{currentStep.text}</span>
                      <span className="font-mono text-slate-500 font-medium">{progress}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-900 transition-all duration-300 ease-out"
                        style={{ width: `${Math.max(6, progress)}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>Hardware spooling active</span>
                    <span>Zero cloud retention</span>
                  </div>

                  {hasError && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                      <p className="font-semibold text-slate-900">Printer connection timeout</p>
                      <p className="text-slate-500 mt-0.5">Counter agent is refreshing spool socket. Click retry below.</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* OPTION 2: Segmented Stepper (Stripe Dashboard) */}
          {(selectedTab === "all" || selectedTab === "segmented") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-500 px-1">
                <span className="font-semibold text-slate-800">Variant 2: Segmented Stepper</span>
                <span className="text-slate-400">Stripe Dashboard Aesthetic</span>
              </div>
              <Card className="p-6 border-slate-200/80 bg-white shadow-xs rounded-2xl relative overflow-hidden">
                <div className="space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100/60 pb-2.5">
                    <div className="text-xs font-medium text-slate-500">
                      Counter Token Dispatch • <span className="text-slate-800 font-semibold">{MOCK_SHOP.name}</span>
                    </div>
                    <div className="font-mono text-xs font-semibold text-slate-700">
                      {progress}%
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
                      Processing Print Request
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Preparing your document payload and queue slot.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-4 gap-2">
                      {SEGMENT_STEPS.map((seg, idx) => {
                        const segStart = idx * 25;
                        const segEnd = (idx + 1) * 25;
                        const segFill = Math.min(100, Math.max(0, ((progress - segStart) / 25) * 100));
                        return (
                          <div key={seg.label} className="space-y-1">
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full bg-slate-800 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${segFill}%` }}
                              />
                            </div>
                            <p
                              className={cn(
                                "text-[10px] font-mono tracking-wider uppercase truncate",
                                progress >= segEnd
                                  ? "text-slate-800 font-semibold"
                                  : progress > segStart
                                  ? "text-slate-600 font-medium"
                                  : "text-slate-300"
                              )}
                            >
                              {seg.label}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50/80 rounded-xl px-3 py-2 border border-slate-100">
                    <span className="font-medium text-slate-700">{currentStep.text}</span>
                    <span className="font-mono text-slate-400 text-[11px]">{MOCK_DOCS.length} files • {MOCK_ESTIMATE.totalPages} pages</span>
                  </div>

                  {hasError && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                      <p className="font-semibold text-slate-900">Printer connection timeout</p>
                      <p className="text-slate-500 mt-0.5">Counter agent is refreshing spool socket. Click retry below.</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* OPTION 3: Editorial Focus (Apple / Calm Studio) */}
          {(selectedTab === "all" || selectedTab === "editorial") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-500 px-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-brand-900">Variant 3: Editorial Focus</span>
                  <span className="rounded bg-brand-100 text-brand-800 px-1.5 py-0.2 text-[9px] font-bold uppercase">
                    Active Customer Design
                  </span>
                </div>
                <span className="text-brand-700 font-sans text-[11px]">Brand Theme Match</span>
              </div>
              <Card className="p-6 sm:p-8 border border-line bg-white shadow-xs rounded-3xl relative overflow-hidden">
                <div className="py-2 text-center space-y-4">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-brand-200/80 bg-brand-50/70 text-brand-700 shadow-2xs">
                    <Layers className="size-6 stroke-[1.75] text-brand-700 animate-pulse" />
                  </div>

                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">
                      Reserving Your Counter Token...
                    </h2>
                    <p className="mt-1 text-xs sm:text-sm text-muted max-w-sm mx-auto">
                      Connecting with <b className="text-ink font-semibold">{MOCK_SHOP.name}</b> for instant counter pickup.
                    </p>
                  </div>

                  <div className="max-w-sm mx-auto space-y-2 pt-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-brand-50 border border-brand-100 p-0.5 shadow-2xs">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-700 transition-all duration-300 ease-out shadow-xs"
                        style={{ width: `${Math.max(6, progress)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-brand-900 font-medium">{currentStep.text}</span>
                      <span className="font-bold text-brand-800">{progress}%</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-line/70 text-xs font-mono text-muted flex items-center justify-center gap-2 sm:gap-3">
                    <span>{MOCK_DOCS.length} files</span>
                    <span>•</span>
                    <span>{MOCK_ESTIMATE.totalPages} pages</span>
                    <span>•</span>
                    <span className="text-brand-950 font-semibold">₹{MOCK_ESTIMATE.total.toFixed(2)}</span>
                  </div>

                  {hasError && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs text-rose-900 text-left">
                      <p className="font-bold text-rose-950">Printer connection timeout</p>
                      <p className="text-rose-800 mt-0.5">Counter agent is refreshing spool socket. Click retry below.</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* OPTION 4: Compact Island (Modern Mobile Pill Widget) */}
          {(selectedTab === "all" || selectedTab === "island") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-500 px-1">
                <span className="font-semibold text-slate-800">Variant 4: Compact Island</span>
                <span className="text-slate-400">Mobile Micro-Card Aesthetic</span>
              </div>
              <Card className="p-6 border-slate-200/80 bg-white shadow-xs rounded-2xl relative overflow-hidden">
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-slate-400 animate-pulse" />
                      <span className="font-semibold text-slate-800">{MOCK_SHOP.name}</span>
                    </div>
                    <span className="font-mono font-semibold text-slate-800">₹{MOCK_ESTIMATE.total.toFixed(2)}</span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200/50 p-0.5">
                      <div
                        className="h-full rounded-full bg-slate-800 transition-all duration-300 ease-out"
                        style={{ width: `${Math.max(6, progress)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-600 font-medium truncate max-w-[220px]">{currentStep.text}</span>
                      <span className="font-mono text-slate-800 font-bold">{progress}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                    <span>{MOCK_DOCS.length} files ({MOCK_ESTIMATE.totalPages} pages)</span>
                    <span>Instant pickup</span>
                  </div>

                  {hasError && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                      <p className="font-semibold text-slate-900">Printer connection timeout</p>
                      <p className="text-slate-500 mt-0.5">Counter agent is refreshing spool socket. Click retry below.</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Comparison Summary Table */}
        <Card className="p-6 border-slate-200/80 bg-white shadow-xs rounded-2xl">
          <h3 className="text-base font-semibold text-slate-900 mb-3">
            Design Variations Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-mono uppercase text-[10px]">
                  <th className="pb-2">Variant</th>
                  <th className="pb-2">Style Inspiration</th>
                  <th className="pb-2">Progress Bar Type</th>
                  <th className="pb-2">Color Palette</th>
                  <th className="pb-2">Best Suited For</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                <tr>
                  <td className="py-2.5 font-semibold text-slate-900">1. Minimal Linear</td>
                  <td className="py-2.5 text-slate-600 font-sans">Linear / Vercel modern dashboard</td>
                  <td className="py-2.5 text-slate-800">Continuous 1.5px ink-slate bar</td>
                  <td className="py-2.5 text-slate-500">Muted Slate (900/600/100)</td>
                  <td className="py-2.5 text-slate-600 font-sans">Cleanest all-around experience</td>
                </tr>
                <tr>
                  <td className="py-2.5 font-semibold text-slate-900">2. Segmented Stepper</td>
                  <td className="py-2.5 text-slate-600 font-sans">Stripe Payment / multi-phase flow</td>
                  <td className="py-2.5 text-slate-800">4 discrete pill segments</td>
                  <td className="py-2.5 text-slate-500">Neutral Graphite & Slate</td>
                  <td className="py-2.5 text-slate-600 font-sans">Explicit step transparency</td>
                </tr>
                <tr>
                  <td className="py-2.5 font-semibold text-slate-900">3. Editorial Focus</td>
                  <td className="py-2.5 text-slate-600 font-sans">Apple / Notion centered card</td>
                  <td className="py-2.5 text-slate-800">Centered floating bar with pulse icon</td>
                  <td className="py-2.5 text-slate-500">Calm Slate & Pure White</td>
                  <td className="py-2.5 text-slate-600 font-sans">Refined, uncluttered focus</td>
                </tr>
                <tr>
                  <td className="py-2.5 font-semibold text-slate-900">4. Compact Island</td>
                  <td className="py-2.5 text-slate-600 font-sans">Dynamic Island / Mobile pill</td>
                  <td className="py-2.5 text-slate-800">Inset 2px high-density bar</td>
                  <td className="py-2.5 text-slate-500">Monochrome with border accents</td>
                  <td className="py-2.5 text-slate-600 font-sans">Mobile screens at shop counters</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
