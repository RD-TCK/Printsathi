"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Download, Play } from "lucide-react";
import { HeroAnimatedHeading } from "@/components/hero-animated-heading";
import { AnchorCoords, PrintPhysicsCanvas } from "@/components/print-physics-canvas";
import { cn } from "@/lib/utils";

const SCROLL_STORY_STEPS = [
  {
    step: "01",
    eyebrow: "Step 01 — Scan QR",
    headline: "Customer walks up and scans the counter QR.",
    detail: "No app download, no WhatsApp number sharing. Mobile camera opens your live print counter instantly.",
    chip: "QR stand active",
  },
  {
    step: "02",
    eyebrow: "Step 02 — Upload & Price",
    headline: "Document transfers straight from phone to printer.",
    detail: "PDFs, notes, and photos upload directly — page count, B&W vs Color, and duplex pricing calculate live.",
    chip: "12 Pages | ₹24.00",
  },
  {
    step: "03",
    eyebrow: "Step 03 — Verified Payment",
    headline: "UPI payment confirms the print job.",
    detail: "Razorpay verifies payment before a single page enters your Windows print queue.",
    chip: "Razorpay Verified | Token #07",
  },
  {
    step: "04",
    eyebrow: "Step 04 — Direct Spooling",
    headline: "Your printer starts printing in seconds.",
    detail: "Windows Desktop Agent sends B&W jobs to laser printers and color pages to ink tanks automatically.",
    chip: "Printing complete",
  },
] as const;

const STEP_ACCENTS = [
  {
    eyebrow: "text-emerald-700 dark:text-emerald-400",
    bar: "bg-blue-600 dark:bg-blue-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/12 dark:text-emerald-300",
    activeBtn: "bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-400",
  },
  {
    eyebrow: "text-emerald-700 dark:text-emerald-400",
    bar: "bg-blue-600 dark:bg-blue-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/12 dark:text-emerald-300",
    activeBtn: "bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-400",
  },
  {
    eyebrow: "text-blue-700 dark:text-blue-400",
    bar: "bg-blue-600 dark:bg-blue-500",
    chip: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/12 dark:text-blue-300",
    activeBtn: "bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:text-white dark:border-blue-400",
  },
  {
    eyebrow: "text-emerald-700 dark:text-emerald-400",
    bar: "bg-blue-600 dark:bg-blue-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/12 dark:text-emerald-300",
    activeBtn: "bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-400",
  },
] as const;

export function LandingScrollStage() {
  const heroSectionRef = useRef<HTMLElement | null>(null);
  const heroPrinterDockRef = useRef<HTMLDivElement | null>(null);
  const howPrinterDockRef = useRef<HTMLDivElement | null>(null);
  const howQrDockRef = useRef<HTMLDivElement | null>(null);
  const howUpiDockRef = useRef<HTMLDivElement | null>(null);
  const howStageRef = useRef<HTMLDivElement | null>(null);
  const stickyBoxRef = useRef<HTMLDivElement | null>(null);

  const heroPersonBreathRef = useRef<HTMLDivElement | null>(null);
  const heroPhoneDotRef = useRef<HTMLDivElement | null>(null);
  const howPersonBreathRef = useRef<HTMLDivElement | null>(null);
  const howPhoneDotRef = useRef<HTMLDivElement | null>(null);

  const [activeStep, setActiveStep] = useState(0);
  const [stageProgressPct, setStageProgressPct] = useState(0);

  const anchorsRef = useRef<AnchorCoords>({
    heroPhoneX: 0,
    heroPhoneY: 0,
    howPhoneX: 0,
    howPhoneY: 0,
    printerX: 0,
    printerY: 0,
    printerWidthPx: 320,
    printerYaw: -0.58,
    printerBankZ: 0,
    printerScaleMult: 1,
    printerVisible: true,
    qrX: 0,
    qrY: 0,
    qrScalePx: 120,
    qrVisible: false,
    upiX: 0,
    upiY: 0,
    upiVisible: false,
    heroBeamActive: true,
    howBeamActive: false,
    scrollVelocity: 0,
    scrollProgress: 0,
    stepIndex: 0,
  });

  const jumpToHowStep = (idx: number) => {
    const howEl = howStageRef.current;
    const stickyEl = stickyBoxRef.current;
    if (!howEl) return;
    const stickyTop = window.innerWidth >= 640 ? 80 : 64;
    const stickyH = stickyEl?.offsetHeight ?? Math.round(window.innerHeight * 0.72);
    const rect = howEl.getBoundingClientRect();
    const totalScrollable = Math.max(howEl.offsetHeight - stickyH, 1);
    const sectionTop = window.scrollY + rect.top - stickyTop;
    const targetProgress = idx === 3 ? 0.94 : (idx + 0.35) / SCROLL_STORY_STEPS.length;
    window.scrollTo({
      top: Math.max(0, sectionTop + targetProgress * totalScrollable),
      behavior: "smooth",
    });
  };

  useEffect(() => {
    let mouseX = 0;
    let lastScrollY = window.scrollY;
    let smoothedVel = 0;
    let rafId = 0;
    let lastReportedStep = -1;
    let lastReportedPct = -1;
    const startMs = performance.now();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

    const onPointerMove = (ev: PointerEvent) => {
      mouseX = (ev.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const applyBreathing = (el: HTMLDivElement | null, elapsed: number, phaseOffset: number) => {
      if (!el || reducedMotion) return;
      const breath = Math.sin(elapsed * 1.65 + phaseOffset);
      const liftY = breath * -3.5;
      const scaleY = 1 + breath * 0.013;
      const scaleX = 1 - breath * 0.005;
      const swayDeg = Math.sin(elapsed * 0.9 + phaseOffset) * 0.65 + mouseX * 0.85;
      el.style.transform = `translate3d(0, ${liftY}px, 0) scale(${scaleX}, ${scaleY}) rotate(${swayDeg}deg)`;
    };

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);

      const elapsed = (now - startMs) / 1000;
      const curScroll = window.scrollY;
      const rawVel = Math.abs(curScroll - lastScrollY);
      lastScrollY = curScroll;
      smoothedVel = smoothedVel * 0.85 + rawVel * 0.15;

      // Living breathing human characters in both Hero & How-It-Works!
      applyBreathing(heroPersonBreathRef.current, elapsed, 0);
      applyBreathing(howPersonBreathRef.current, elapsed, 1.1);

      const heroAnchor = heroPrinterDockRef.current;
      const howAnchor = howPrinterDockRef.current;
      const qrAnchor = howQrDockRef.current;
      const upiAnchor = howUpiDockRef.current;
      const howStage = howStageRef.current;
      const heroSec = heroSectionRef.current;
      const heroPhone = heroPhoneDotRef.current;
      const howPhone = howPhoneDotRef.current;

      if (!heroAnchor || !howAnchor) return;

      const hRect = heroAnchor.getBoundingClientRect();
      const tRect = howAnchor.getBoundingClientRect();

      const howAbsTop = howStage ? howStage.getBoundingClientRect().top + curScroll : tRect.top + curScroll;
      const endScroll = Math.max(howAbsTop - 84, 1);
      const rawTravel = Math.max(0, Math.min(1, curScroll / endScroll));
      const travelT = rawTravel * rawTravel * (3 - 2 * rawTravel);

      let howProgress = 0;
      if (howStage) {
        const stickyTop = window.innerWidth >= 640 ? 80 : 64;
        const stickyH = stickyBoxRef.current?.offsetHeight ?? Math.round(window.innerHeight * 0.72);
        const hsRect = howStage.getBoundingClientRect();
        const scrollable = Math.max(howStage.offsetHeight - stickyH, 1);
        howProgress = Math.max(0, Math.min(1, (-hsRect.top + stickyTop) / scrollable));
      }
      const nextStepIdx = Math.min(
        SCROLL_STORY_STEPS.length - 1,
        Math.floor(howProgress * SCROLL_STORY_STEPS.length),
      );
      const nextPct = Math.round(howProgress * 100);
      if (nextStepIdx !== lastReportedStep) {
        lastReportedStep = nextStepIdx;
        setActiveStep(nextStepIdx);
      }
      if (Math.abs(nextPct - lastReportedPct) >= 1) {
        lastReportedPct = nextPct;
        setStageProgressPct(nextPct);
      }

      // Lerp center coordinates smoothly from Hero Right -> How-It-Works Left
      const hCx = hRect.left + hRect.width * 0.5;
      const hCy = hRect.top + hRect.height * 0.5;
      const tCx = tRect.left + tRect.width * 0.5;
      const tCy = tRect.top + tRect.height * 0.5;

      const printerX = hCx + (tCx - hCx) * travelT;
      const printerY = hCy + (tCy - hCy) * travelT;
      const printerWidthPx = hRect.width + (tRect.width - hRect.width) * travelT;

      // Smooth continuous 3D rotation (360° + 60° turn) with zero sudden pop:
      const smoothTurn = travelT * (Math.PI * 2 + 1.05);
      const stepRotate = howProgress * 0.32;
      const printerYaw = -0.55 + smoothTurn + stepRotate;
      const printerBankZ = Math.sin(travelT * Math.PI) * 0.12;
      const printerScaleMult = 1 + Math.max(0, (howProgress - 0.7) / 0.3) * 0.04 * travelT;

      const pastHowBottom = tRect.bottom < -40;
      const printerVisible = !pastHowBottom && printerY > -180 && printerY < window.innerHeight + 180;

      const heroVisible = heroSec ? heroSec.getBoundingClientRect().bottom > 80 : false;
      const hsVisible = howStage
        ? howStage.getBoundingClientRect().top < window.innerHeight * 0.85 &&
          howStage.getBoundingClientRect().bottom > 120
        : false;

      const qrRect = qrAnchor ? qrAnchor.getBoundingClientRect() : null;
      const upiRect = upiAnchor ? upiAnchor.getBoundingClientRect() : null;
      const hpRect = heroPhone ? heroPhone.getBoundingClientRect() : null;
      const sPhoneRect = howPhone ? howPhone.getBoundingClientRect() : null;

      anchorsRef.current = {
        heroPhoneX: hpRect ? hpRect.left + hpRect.width / 2 : 0,
        heroPhoneY: hpRect ? hpRect.top + hpRect.height / 2 : 0,
        howPhoneX: sPhoneRect ? sPhoneRect.left + sPhoneRect.width / 2 : 0,
        howPhoneY: sPhoneRect ? sPhoneRect.top + sPhoneRect.height / 2 : 0,
        printerX,
        printerY,
        printerWidthPx,
        printerYaw,
        printerBankZ,
        printerScaleMult,
        printerVisible,
        qrX: qrRect ? qrRect.left + qrRect.width / 2 : 0,
        qrY: qrRect ? qrRect.top + qrRect.height / 2 : 0,
        qrScalePx: qrRect ? qrRect.width : 120,
        qrVisible: hsVisible && nextStepIdx <= 2,
        upiX: upiRect ? upiRect.left + upiRect.width / 2 : 0,
        upiY: upiRect ? upiRect.top + upiRect.height / 2 : 0,
        upiVisible: hsVisible && nextStepIdx === 2,
        heroBeamActive: heroVisible,
        howBeamActive: hsVisible && nextStepIdx === 1,
        scrollVelocity: smoothedVel,
        scrollProgress: howProgress,
        stepIndex: nextStepIdx,
      };
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  const currentStep = SCROLL_STORY_STEPS[activeStep] ?? SCROLL_STORY_STEPS[0];
  const stepAccent = STEP_ACCENTS[activeStep] ?? STEP_ACCENTS[0];

  return (
    <>
      {/* Unified Real 3D Three.js Stage: Rotating 3D Printer + 3D QR Stand + 3D Razorpay Shield + Curled Paper Burst */}
      <PrintPhysicsCanvas anchorsRef={anchorsRef} />

      {/* ━━━ HERO SECTION ━━━ */}
      <section
        ref={heroSectionRef}
        className="relative sm:min-h-[calc(100svh-4rem)] flex flex-col justify-between sm:justify-center overflow-x-clip border-b border-line dark:border-white/[0.08]"
      >
        <div className="absolute inset-0 -z-20 bg-gradient-to-b from-[#e8f6ee] via-[#f7fbf9] to-sky-50/75 dark:from-[#17232e] dark:via-[#121722] dark:to-[#172030]" />
        <div
          className="hidden dark:block absolute inset-0 -z-10 pointer-events-none bg-[radial-gradient(ellipse_78%_54%_at_50%_18%,rgba(16,185,129,0.14),rgba(56,189,248,0.08)_48%,transparent_76%)]"
          aria-hidden="true"
        />

        {/* Centered Headline & CTAs (always crisp z-20 above 3D canvas z-10) */}
        <div className="relative z-20 mx-auto max-w-2xl px-5 sm:px-6 pt-8 pb-2 sm:pb-24 sm:pt-12 lg:px-8 w-full flex flex-col items-center text-center">
          <HeroAnimatedHeading />

          <p className="reveal reveal-d2 mt-4 sm:mt-5 max-w-[34ch] sm:max-w-lg mx-auto text-[15px] sm:text-base leading-[1.6] text-slate-600 dark:text-slate-300 font-normal text-center">
            Customers scan your desk QR, pay via UPI, and print directly on your counter PC in seconds.
          </p>

          <div className="reveal reveal-d3 mt-6 sm:mt-7 flex flex-col items-center gap-4 w-full">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
              <Link
                href="/register"
                className="inline-flex items-center justify-center w-[240px] sm:w-auto h-11 px-6 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 text-sm font-semibold shadow-sm shadow-emerald-600/15 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.38),0_12px_28px_-8px_rgba(16,185,129,0.42)] transition-all active:scale-[0.98] whitespace-nowrap"
              >
                Start ₹100 for 7 Days Trial
              </Link>

              <a
                href="#how-it-works-simulation"
                className="inline-flex items-center justify-center gap-2 w-[240px] sm:w-auto h-11 px-6 rounded-full border border-slate-300/85 bg-white/95 text-slate-800 hover:text-slate-950 hover:bg-white hover:border-slate-400 shadow-2xs transition-all active:scale-[0.98] dark:border-white/[0.15] dark:bg-[#1c2435] dark:bg-gradient-to-b dark:from-[#232c40] dark:to-[#192030] dark:text-slate-100 dark:hover:text-white dark:hover:from-[#29344b] dark:hover:to-[#1f283b] dark:hover:border-white/25 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_10px_24px_-10px_rgba(0,0,0,0.55)] text-sm font-medium whitespace-nowrap"
              >
                <Play className="size-3.5 fill-slate-800 text-slate-800 dark:fill-emerald-400 dark:text-emerald-400 shrink-0" />
                <span>See how it works</span>
              </a>
            </div>

            <div className="inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>Windows 10 &amp; 11 Agent</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <Link
                href="/download"
                className="font-medium text-emerald-800 hover:text-emerald-950 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline inline-flex items-center gap-1"
              >
                Download v1.8.36 (.exe)
                <Download className="size-3 text-emerald-800 dark:text-emerald-400" />
              </Link>
            </div>
          </div>
        </div>

        {/* Dedicated Bottom Visual Stage (cleanly below text on mobile, framing edges on desktop) */}
        <div className="relative w-full h-[175px] sm:h-0 mt-5 sm:mt-0 pointer-events-none select-none shrink-0">
          {/* Left Hero Actor: Living Breathing Person Holding Phone Sending Docs */}
          <div className="absolute bottom-0 left-3 sm:left-3 lg:left-[4%] z-0 w-[124px] sm:w-[215px] md:w-[255px] lg:w-[305px] xl:w-[335px]">
            <div ref={heroPersonBreathRef} className="relative origin-bottom will-change-transform">
              <Image
                src="/hero-person-phone.webp"
                alt="Customer sending PDF directly from smartphone to Printiva printer"
                width={787}
                height={952}
                priority
                className="w-full h-auto object-contain drop-shadow-[0_18px_32px_rgba(15,23,42,0.16)] dark:drop-shadow-[0_20px_36px_rgba(0,0,0,0.65)]"
              />
              <div
                ref={heroPhoneDotRef}
                className="pointer-events-none absolute right-[8%] top-[42%] size-px opacity-0"
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Right Hero Dock: Elevated Cleanly on Both Mobile & Desktop */}
          <div
            ref={heroPrinterDockRef}
            className="absolute bottom-2 sm:bottom-20 lg:bottom-24 right-3 sm:right-6 lg:right-[6%] z-0 w-[140px] sm:w-[190px] md:w-[225px] lg:w-[255px] xl:w-[275px] aspect-[4/3]"
            aria-hidden="true"
          />
        </div>
      </section>

      {/* ━━━ HOW IT WORKS: STICKY 3D SCROLL SIMULATION DIRECTLY BELOW HERO (MOBILE & DESKTOP) ━━━ */}
      <section
        id="how-it-works-simulation"
        className="relative py-8 sm:py-14 lg:py-16 border-b border-line dark:border-white/[0.08]"
      >
        <div
          className="absolute inset-0 -z-20 bg-gradient-to-b from-sky-50/75 via-[#f9fcfb] to-emerald-50/55 dark:from-[#172030] dark:via-[#121722] dark:to-[#162129]"
          aria-hidden="true"
        />
        <div
          className="hidden dark:block absolute inset-0 -z-10 pointer-events-none bg-[radial-gradient(ellipse_62%_55%_at_32%_46%,rgba(56,189,248,0.11),rgba(16,185,129,0.08)_52%,transparent_78%)]"
          aria-hidden="true"
        />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div ref={howStageRef} className="relative min-h-[168vh] sm:min-h-[215vh] lg:min-h-[235vh]">
            <div
              ref={stickyBoxRef}
              className="sticky top-16 sm:top-20 z-20 lg:min-h-[520px] grid gap-4 sm:gap-6 lg:gap-8 lg:grid-cols-[1.2fr_0.8fr] items-start lg:items-center py-3 sm:py-4"
            >
              {/* LEFT SIDE: Open Live 3D Diorama (z-0 sits below z-10 Three.js 3D canvas cleanly!) */}
              <div className="relative h-[205px] sm:h-[360px] lg:h-[520px] flex items-center justify-between">

                {/* LEFT SLOT: Real 3D Rotating Printer Docks Here! */}
                <div className="relative flex items-center justify-center w-[54%] h-full">
                  <div
                    ref={howPrinterDockRef}
                    className="w-[134px] sm:w-[205px] lg:w-[250px] aspect-[4/3]"
                    aria-hidden="true"
                  />
                  {/* Center UPI 3D Shield Anchor (Spins during Step 03!) */}
                  <div
                    ref={howUpiDockRef}
                    className="pointer-events-none absolute top-1 sm:-top-2 right-1 sm:right-2 size-16 sm:size-24"
                    aria-hidden="true"
                  />
                </div>

                {/* RIGHT DIORAMA SLOT: 3D QR Counter Stand + Spawned Breathing Customer */}
                <div className="relative flex items-end justify-center w-[46%] h-full pb-1 sm:pb-4">
                  {/* Real 3D Acrylic QR Stand Anchor */}
                  <div
                    ref={howQrDockRef}
                    className="pointer-events-none mb-8 sm:mb-20 mr-1 w-[68px] sm:w-[115px] aspect-square shrink-0"
                    aria-hidden="true"
                  />

                  {/* Spawned Real Customer with Phone */}
                  <div
                    className={cn(
                      "pointer-events-none select-none w-[88px] sm:w-[165px] lg:w-[200px] transition-all duration-500",
                      activeStep <= 2
                        ? "opacity-100 translate-y-0 scale-100"
                        : "opacity-25 translate-y-3 scale-90",
                    )}
                  >
                    <div ref={howPersonBreathRef} className="relative origin-bottom will-change-transform">
                      <Image
                        src="/hero-person-phone.webp"
                        alt="Customer scanning Printiva counter QR with smartphone"
                        width={787}
                        height={952}
                        className="w-full h-auto object-contain drop-shadow-[0_16px_28px_rgba(15,23,42,0.16)] scale-x-[-1]"
                      />
                      <div
                        ref={howPhoneDotRef}
                        className="pointer-events-none absolute left-[10%] top-[42%] size-px opacity-0"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT SIDE: Single Dynamic Scroll Step (z-20 always stays above Three.js z-10!) */}
              <div className="relative z-20 flex flex-col justify-center space-y-3.5 sm:space-y-5 lg:pl-6 rounded-2xl border border-slate-200/80 bg-white/95 dark:border-white/[0.11] dark:bg-[#192131]/92 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_48px_-16px_rgba(0,0,0,0.6)] backdrop-blur-sm p-4 sm:p-0 sm:border-0 sm:bg-transparent sm:dark:bg-transparent sm:dark:shadow-none sm:dark:backdrop-blur-none">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span>Step {currentStep.step} of 04</span>
                  <span className={cn("font-mono font-semibold", stepAccent.eyebrow)}>{stageProgressPct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-white/[0.08] overflow-hidden">
                  <div
                    className={cn("h-full transition-all duration-200", stepAccent.bar)}
                    style={{ width: `${Math.max(8, stageProgressPct)}%` }}
                  />
                </div>

                {/* Single Active Step Narrative */}
                <div
                  key={currentStep.step}
                  className="space-y-2 sm:space-y-3 py-0.5 transition-all duration-300"
                >
                  <p className={cn("text-xs font-semibold", stepAccent.eyebrow)}>
                    {currentStep.eyebrow}
                  </p>
                  <h2 className="text-[1.45rem] sm:text-3xl lg:text-4xl font-bold tracking-tight text-brand-950 dark:text-white leading-[1.16]">
                    {currentStep.headline}
                  </h2>
                  <p className="text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300 max-w-md">
                    {currentStep.detail}
                  </p>
                  <div className={cn("inline-flex items-center rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold", stepAccent.chip)}>
                    {currentStep.chip}
                  </div>
                </div>

                {/* Responsive Step Tabs (centered compact row on mobile & desktop) */}
                <div className="grid grid-cols-4 max-w-[280px] sm:max-w-none mx-auto sm:mx-0 sm:flex items-center gap-2 pt-1 w-full">
                  {SCROLL_STORY_STEPS.map((st, idx) => (
                    <button
                      key={st.step}
                      type="button"
                      onClick={() => jumpToHowStep(idx)}
                      className={cn(
                        "py-2 sm:px-3 sm:py-1.5 rounded-lg font-mono text-xs font-semibold border transition-all cursor-pointer text-center",
                        idx === activeStep
                          ? stepAccent.activeBtn
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 dark:bg-[#1d2536] dark:text-slate-300 dark:border-white/[0.12] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] dark:hover:border-white/25 dark:hover:text-white",
                      )}
                    >
                      {st.step}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
