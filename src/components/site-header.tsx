"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let rafId = 0;
    const updateScrollState = () => {
      rafId = 0;
      const y = window.scrollY;
      setScrolled((prev) => (prev ? y > 10 : y > 24));
    };

    const handleScroll = () => {
      if (!rafId) {
        rafId = window.requestAnimationFrame(updateScrollState);
      }
    };

    updateScrollState();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <>
      {/* Invisible spacer in flow (exactly 64px / h-16) so page content never jumps */}
      <div className="h-16 w-full shrink-0" aria-hidden="true" />

      {/* Header Shell: interpolates padding & width smoothly instead of snapping max-w-none <-> max-w-6xl */}
      <header
        className={cn(
          "fixed top-0 inset-x-0 z-50 pointer-events-none transition-[padding] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          scrolled
            ? "pt-3 px-3 sm:pt-4 sm:px-6 lg:px-10 xl:px-[calc(50%-560px)]"
            : "pt-0 px-0"
        )}
      >
        <div
          className={cn(
            "w-full flex items-center justify-between pointer-events-auto select-none backdrop-blur-xl border transition-[height,padding,border-radius,background-color,border-color,box-shadow] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            scrolled
              ? "h-14 px-4 sm:px-6 rounded-[28px] bg-white/92 border-slate-200/80 shadow-[0_12px_36px_rgba(15,26,18,0.1)] dark:bg-[#1a2232]/94 dark:border-white/[0.1] dark:shadow-[0_14px_38px_rgba(0,0,0,0.45)]"
              : "h-16 px-6 lg:px-10 xl:px-12 rounded-none bg-[#fafaf8]/95 border-t-transparent border-x-transparent border-b-[#e7e3dc]/80 shadow-[0_1px_8px_-3px_rgba(15,26,18,0.04)] dark:bg-[#121722]/92 dark:border-b-white/[0.1] dark:shadow-[0_1px_12px_-3px_rgba(0,0,0,0.35)]"
          )}
        >
          {/* ━━━ Left: Brand / Logo ━━━ */}
          <Link href="/" className="group flex items-center gap-2.5 outline-none shrink-0">
            <div className="relative flex items-center justify-center transition-transform duration-300 group-hover:scale-105 group-active:scale-95">
              <Logo size={28} className="shrink-0" />
            </div>
            <span className="text-lg font-bold tracking-tight text-brand-950 dark:text-white">
              Print<span className="text-brand-600 dark:text-emerald-400">iva</span>
            </span>
          </Link>

          {/* ━━━ Right: Nav Links + Theme Toggle + Divider + Login + CTA ━━━ */}
          <div className="hidden items-center gap-3 lg:gap-4 md:flex">
            {/* Navigation Links */}
            <nav className="flex items-center gap-0.5 lg:gap-1">
              {[
                { label: "Features", href: "/features" },
                { label: "How it works", href: "/how-it-works" },
                { label: "Pricing", href: "/pricing" },
              ].map((item) => (
                <Link
                  key={item.label}
                  className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-black/[0.04] hover:text-brand-950 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  href={item.href}
                  prefetch={true}
                >
                  {item.label}
                </Link>
              ))}

              {/* Windows Agent with micro-badge */}
              <Link
                className="group flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-black/[0.04] hover:text-brand-950 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
                href="/download"
                prefetch={true}
              >
                <span>Windows Agent</span>
                <span className="rounded bg-brand-100/70 px-1.5 py-0.5 text-[10px] font-mono font-medium text-brand-800 border border-brand-200/60 transition-colors group-hover:bg-brand-200/70 dark:bg-emerald-950/90 dark:text-emerald-300 dark:border-emerald-800/70 dark:group-hover:bg-emerald-900/70">
                  v1.8
                </span>
              </Link>
            </nav>

            {/* Clean Vertical Divider */}
            <div className="h-4 w-px bg-slate-300/70 dark:bg-slate-800" />

            <ThemeToggle />

            {/* Shop Login */}
            <Link
              className="px-2.5 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:text-brand-950 dark:text-slate-300 dark:hover:text-white"
              href="/login"
              prefetch={true}
            >
              Shop login
            </Link>

            {/* ━━━ Right-Most: ₹100 for 7 Days Trial CTA Button ━━━ */}
            <Link
              href="/register"
              prefetch={true}
              className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-brand-950 px-3.5 py-1.5 text-xs font-semibold text-brand-50 shadow-xs hover:bg-brand-900 active:scale-[0.98] transition-all border border-brand-800/80 dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-400 dark:hover:bg-emerald-400 shrink-0"
            >
              <span>₹100 for 7 Days Trial</span>
            </Link>
          </div>

          {/* ━━━ Mobile Controls (Theme Toggle + Menu Toggle) ━━━ */}
          <div className="flex items-center gap-2 md:hidden pointer-events-auto">
            <ThemeToggle />
            <button
              className="flex size-9 items-center justify-center rounded-lg border border-[#e7e3dc] bg-white/90 text-brand-900 transition-colors hover:bg-[#f2eee6] active:scale-95 dark:border-white/[0.12] dark:bg-[#1b2233] dark:text-slate-200 dark:hover:bg-[#232c41]"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen(!open)}
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        {/* ━━━ Mobile Menu Dropdown ━━━ */}
        {open ? (
          <div
            className={cn(
              "md:hidden transition-all duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] pointer-events-auto",
              scrolled
                ? "mt-2 w-full rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-xl p-5 shadow-2xl dark:border-white/[0.1] dark:bg-[#1a2232]/96"
                : "w-full border-b border-[#e7e3dc] bg-[#fafaf8]/98 backdrop-blur-xl px-6 py-5 shadow-lg dark:border-white/[0.1] dark:bg-[#121722]/98"
            )}
          >
            <nav className="flex flex-col gap-1">
              {[
                ["Features", "/features"],
                ["How it works", "/how-it-works"],
                ["Pricing", "/pricing"],
                ["Download Windows Agent", "/download"],
                ["Shopkeeper Login", "/login"],
              ].map(([label, href]) => (
                <Link
                  key={label}
                  href={href}
                  prefetch={true}
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-3 text-sm font-medium text-brand-950 hover:bg-[#f2eee6] transition-colors dark:text-slate-100 dark:hover:bg-white/[0.06]"
                >
                  {label}
                </Link>
              ))}
              <div className="pt-3">
                <Link
                  href="/register"
                  prefetch={true}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center rounded-full bg-brand-950 px-4 py-3 text-sm font-semibold text-brand-50 shadow-xs active:scale-[0.98] transition-all dark:bg-emerald-500 dark:text-slate-950"
                >
                  <span>₹100 for 7 Days Trial</span>
                </Link>
              </div>
            </nav>
          </div>
        ) : null}
      </header>
    </>
  );
}
