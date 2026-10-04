"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PrinterStatusRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
