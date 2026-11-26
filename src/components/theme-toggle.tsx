"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const THEME_STORAGE_KEY = "printiva-theme";

function subscribeThemeClass(callback: () => void) {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getThemeSnapshot() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function getServerThemeSnapshot() {
  return false;
}

export function ThemeToggle({ className }: { className?: string }) {
  const isDark = useSyncExternalStore(
    subscribeThemeClass,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  const toggleTheme = () => {
    const nextDark = !getThemeSnapshot();
    document.documentElement.classList.toggle("dark", nextDark);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextDark ? "dark" : "light");
    } catch {
      // Ignore storage access errors in private contexts
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "inline-flex size-8 sm:size-9 items-center justify-center rounded-lg border border-slate-200/90 bg-white/90 text-slate-700 transition-colors hover:bg-slate-100 hover:text-brand-950 active:scale-95 cursor-pointer dark:border-white/[0.1] dark:bg-[#151922] dark:text-slate-300 dark:hover:bg-[#1d222e] dark:hover:text-white",
        className,
      )}
    >
      {isDark ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4" />}
    </button>
  );
}
