"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface PrinterBrand {
  name: string;
  renderLogo: () => React.ReactNode;
}

const PRINTER_BRANDS: PrinterBrand[] = [
  {
    name: "HP",
    renderLogo: () => (
      <svg viewBox="0 0 120 48" className="h-10 w-auto" role="img" aria-label="HP">
        <circle cx="60" cy="24" r="20" fill="#0096D6" />
        <text
          x="60"
          y="31"
          textAnchor="middle"
          fill="#FFFFFF"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontStyle="italic"
          fontWeight="700"
          fontSize="24"
          letterSpacing="-1"
        >
          hp
        </text>
      </svg>
    ),
  },
  {
    name: "Canon",
    renderLogo: () => (
      <svg viewBox="0 0 140 44" className="h-8 w-auto" role="img" aria-label="Canon">
        <text
          x="70"
          y="31"
          textAnchor="middle"
          fill="#CC0000"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="700"
          fontSize="30"
          letterSpacing="-0.5"
        >
          Canon
        </text>
      </svg>
    ),
  },
  {
    name: "Epson",
    renderLogo: () => (
      <svg viewBox="0 0 140 40" className="h-7 w-auto" role="img" aria-label="Epson">
        <text
          x="70"
          y="28"
          textAnchor="middle"
          fill="#003399"
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight="900"
          fontSize="26"
          letterSpacing="1.5"
        >
          EPSON
        </text>
      </svg>
    ),
  },
  {
    name: "Brother",
    renderLogo: () => (
      <svg viewBox="0 0 150 52" className="h-10 w-auto" role="img" aria-label="Brother at your side">
        <text
          x="75"
          y="26"
          textAnchor="middle"
          fill="#0D4AA6"
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight="900"
          fontSize="26"
          letterSpacing="-1.2"
        >
          brother
        </text>
        <text
          x="75"
          y="42"
          textAnchor="middle"
          fill="#0D4AA6"
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight="500"
          fontSize="11.5"
          letterSpacing="0.2"
        >
          at your side
        </text>
      </svg>
    ),
  },
  {
    name: "Xerox",
    renderLogo: () => (
      <svg viewBox="0 0 140 44" className="h-8 w-auto" role="img" aria-label="Xerox">
        <text
          x="67"
          y="30"
          textAnchor="middle"
          fill="#D92231"
          fontFamily="'Trebuchet MS', Arial, sans-serif"
          fontWeight="700"
          fontSize="28"
          letterSpacing="-0.8"
        >
          xerox
        </text>
        <text
          x="108"
          y="16"
          fill="#D92231"
          fontFamily="Arial, sans-serif"
          fontWeight="600"
          fontSize="7"
        >
          TM
        </text>
      </svg>
    ),
  },
  {
    name: "Ricoh",
    renderLogo: () => (
      <svg viewBox="0 0 165 48" className="h-9 w-auto" role="img" aria-label="Ricoh imagine. change.">
        <rect x="8" y="8" width="28" height="28" rx="3" fill="#CF142B" />
        <path d="M16 28V16h7.5c2.8 0 4.5 1.4 4.5 3.7 0 1.7-1 2.9-2.6 3.3l3 5h-3.4l-2.6-4.6H19V28h-3zm3-7h4c1.3 0 2-.6 2-1.6s-.7-1.6-2-1.6h-4V21z" fill="#FFFFFF" />
        <text
          x="45"
          y="23"
          fill="#CF142B"
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight="900"
          fontSize="18"
          letterSpacing="1.2"
        >
          RICOH
        </text>
        <text
          x="45"
          y="36"
          fill="currentColor"
          className="text-slate-600 dark:text-slate-400"
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight="500"
          fontSize="10.5"
        >
          imagine. change.
        </text>
      </svg>
    ),
  },
  {
    name: "Kyocera",
    renderLogo: () => (
      <svg viewBox="0 0 140 50" className="h-10 w-auto" role="img" aria-label="Kyocera">
        <g transform="translate(52, 6)">
          <polygon points="18,0 26,8 18,16 10,8" fill="#DF0522" />
          <polygon points="18,18 26,26 18,34 10,26" fill="#DF0522" />
          <polygon points="8,8 8,26 0,17" fill="#DF0522" />
          <polygon points="28,8 28,26 19,17" fill="#DF0522" />
        </g>
        <text
          x="70"
          y="48"
          textAnchor="middle"
          fill="currentColor"
          className="text-slate-800 dark:text-slate-200"
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight="800"
          fontSize="8.5"
          letterSpacing="2"
        >
          KYOCERA
        </text>
      </svg>
    ),
  },
  {
    name: "Konica Minolta",
    renderLogo: () => (
      <svg viewBox="0 0 170 44" className="h-8 w-auto" role="img" aria-label="Konica Minolta">
        <circle cx="22" cy="22" r="12" fill="#005BAC" />
        <rect x="8" y="16" width="28" height="2.4" fill="#FFFFFF" />
        <rect x="8" y="21" width="28" height="2.4" fill="#FFFFFF" />
        <rect x="8" y="26" width="28" height="2.4" fill="#FFFFFF" />
        <text
          x="42"
          y="20"
          fill="#005BAC"
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight="800"
          fontSize="12"
          letterSpacing="0.8"
        >
          KONICA MINOLTA
        </text>
        <text
          x="42"
          y="31"
          fill="#64748B"
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight="500"
          fontSize="8.5"
          letterSpacing="0.3"
        >
          bizhub Series
        </text>
      </svg>
    ),
  },
];

export function SupportedPrinters() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isPausedRef = useRef(false);
  const manualPauseUntilRef = useRef(0);
  const virtualScrollRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    let rafId = 0;
    let lastTime = performance.now();
    const speedPxPerSec = 42;

    const getLoopSpan = () => {
      const first = el.children[0] as HTMLElement | undefined;
      const mirror = el.children[PRINTER_BRANDS.length] as HTMLElement | undefined;
      if (first && mirror) {
        return mirror.offsetLeft - first.offsetLeft;
      }
      return el.scrollWidth / 2;
    };

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (!isPausedRef.current && now >= manualPauseUntilRef.current) {
        const span = getLoopSpan();
        if (span > 0) {
          // Resync virtual position if user dragged or clicked arrows
          if (Math.abs(el.scrollLeft - virtualScrollRef.current) > 2) {
            virtualScrollRef.current = el.scrollLeft;
          }
          virtualScrollRef.current += speedPxPerSec * dt;
          if (virtualScrollRef.current >= span) {
            virtualScrollRef.current -= span;
          }
          el.scrollLeft = virtualScrollRef.current;
        }
      } else {
        virtualScrollRef.current = el.scrollLeft;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const scrollByStep = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const step = 440;
    const first = el.children[0] as HTMLElement | undefined;
    const mirror = el.children[PRINTER_BRANDS.length] as HTMLElement | undefined;
    const span = first && mirror ? mirror.offsetLeft - first.offsetLeft : el.scrollWidth / 2;

    manualPauseUntilRef.current = performance.now() + 900;

    if (direction === "left") {
      if (el.scrollLeft < step && span > 0) {
        el.scrollLeft += span;
      }
      el.scrollBy({ left: -step, behavior: "smooth" });
    } else {
      if (span > 0 && el.scrollLeft >= span) {
        el.scrollLeft -= span;
      }
      el.scrollBy({ left: step, behavior: "smooth" });
    }
  };

  const renderedBrands = [...PRINTER_BRANDS, ...PRINTER_BRANDS];

  return (
    <section
      className="bg-[#f8f9fb] border-t border-line py-14 sm:py-16 dark:bg-[#161d2b] dark:border-white/[0.09]"
      onMouseEnter={() => {
        isPausedRef.current = true;
      }}
      onMouseLeave={() => {
        isPausedRef.current = false;
      }}
      onTouchStart={() => {
        isPausedRef.current = true;
      }}
      onTouchEnd={() => {
        manualPauseUntilRef.current = performance.now() + 1200;
        isPausedRef.current = false;
      }}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Centered Title + Right Arrow Controls */}
        <div className="relative flex items-center justify-between sm:justify-center mb-9 gap-4">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-center">
            Supported Printers
          </h2>
          <div className="sm:absolute sm:right-0 flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scrollByStep("left")}
              aria-label="Scroll supported printers left"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-2xs transition-colors hover:border-slate-300 hover:text-slate-950 active:scale-95 cursor-pointer dark:border-white/[0.12] dark:bg-[#1d2536] dark:text-slate-300 dark:hover:border-white/25 dark:hover:text-white"
            >
              <ArrowLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollByStep("right")}
              aria-label="Scroll supported printers right"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-2xs transition-colors hover:border-slate-300 hover:text-slate-950 active:scale-95 cursor-pointer dark:border-white/[0.12] dark:bg-[#1d2536] dark:text-slate-300 dark:hover:border-white/25 dark:hover:text-white"
            >
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Auto-Scrolling Brand Carousel with Subtle Edge Fade */}
      <div className="mx-auto max-w-[1440px] px-2 sm:px-6">
        <div
          ref={scrollRef}
          className="no-scrollbar flex items-center gap-4 overflow-x-auto px-4 py-1 [mask-image:linear-gradient(to_right,transparent_0%,black_5%,black_95%,transparent_100%)]"
        >
          {renderedBrands.map((brand, idx) => (
            <div
              key={`${brand.name}-${idx}`}
              aria-hidden={idx >= PRINTER_BRANDS.length ? true : undefined}
              title={`${brand.name} Printers Supported`}
              className="flex h-[84px] sm:h-[90px] w-[188px] sm:w-[208px] shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white px-5 shadow-2xs transition-all duration-200 hover:border-slate-300 hover:shadow-xs select-none dark:border-white/[0.1] dark:bg-[#1c2334] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:border-white/[0.18]"
            >
              {brand.renderLogo()}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
