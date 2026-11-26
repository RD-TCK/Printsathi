"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const ROTATING_CHAOS_WORDS = [
  "WhatsApp chats",
  "virus pen drives",
  "Gmail inboxes",
  "Telegram threads",
];

export function HeroAnimatedHeading() {
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (reduced) return;

    let swapTimer: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      setIsAnimating(true);
      swapTimer = setTimeout(() => {
        setIndex((prev) => (prev + 1) % ROTATING_CHAOS_WORDS.length);
        setIsAnimating(false);
      }, 260);
    }, 3200);

    return () => {
      clearInterval(interval);
      if (swapTimer) clearTimeout(swapTimer);
    };
  }, []);

  const currentWord = ROTATING_CHAOS_WORDS[index];

  return (
    <div className="w-full text-center">
      <h1 className="reveal reveal-d1 text-[2rem] sm:text-5xl lg:text-[3.5rem] font-semibold tracking-[-0.035em] text-slate-950 dark:text-white text-center mx-auto max-w-[17ch] sm:max-w-2xl leading-[1.09]">
        <span className="block">Stop searching</span>
        <span className="inline-flex items-center justify-center relative overflow-hidden align-bottom h-[1.24em] my-0.5">
          <span
            className={cn(
              "inline-block font-semibold text-emerald-700 dark:text-emerald-400 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] select-none px-1",
              isAnimating ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100",
            )}
          >
            {currentWord}
          </span>
        </span>
        <span className="block">for customer PDFs.</span>
      </h1>
    </div>
  );
}
