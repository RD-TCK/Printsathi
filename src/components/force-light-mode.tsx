"use client";

import { useEffect } from "react";

const THEME_STORAGE_KEY = "printiva-theme";

/** Forces light mode while mounted (used on the customer print configuration page). */
export function ForceLightMode() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");

    return () => {
      try {
        if (window.localStorage.getItem(THEME_STORAGE_KEY) === "dark") {
          root.classList.add("dark");
        }
      } catch {
        // Ignore storage access errors in private contexts
      }
    };
  }, []);

  return null;
}
