"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const ROTATING_CHAOS_WORDS = [
  "WhatsApp chats",
  "virus pen drives",
  "Gmail inboxes",
  "Telegram groups",
];

export function HeroAnimatedHeading() {
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % ROTATING_CHAOS_WORDS.length);
        setIsAnimating(false);
      }, 300);
    }, 3200);

    return () => clearInterval(interval);
  }, []);

  const currentWord = ROTATING_CHAOS_WORDS[index];

  return (
    <div className="w-full text-center">
      <h1 className="reveal reveal-d1 text-4xl sm:text-5xl lg:text-[3.75rem] font-medium tracking-[-0.03em] text-slate-950 text-center mx-auto max-w-3xl leading-[1.1] [text-shadow:0_2px_18px_rgba(255,255,255,0.85)]">
        <span className="block font-medium text-slate-950">Stop searching</span>
        <span className="inline-flex relative overflow-hidden align-middle h-[1.24em] my-0.5">
          <span
            className={cn(
              "inline-block font-serif italic font-normal text-emerald-800 tracking-[-0.01em] text-[1.12em] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] select-none px-2",
              isAnimating
                ? "-translate-y-full opacity-0"
                : "translate-y-0 opacity-100"
            )}
          >
            {currentWord}
          </span>
        </span>
        <span className="block font-medium text-slate-950">for customer PDFs.</span>
      </h1>
    </div>
  );
}
