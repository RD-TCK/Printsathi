"use client";

import Link from "next/link";
import { History, Store } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { PublicShop } from "@/lib/shops/public-lookup";
import {
  subscribeToTokens,
  getTokensSnapshot,
  getServerSnapshot,
  type StoredToken,
} from "@/components/customer-print-flow";

export function ShopHeader({ shop }: { shop: PublicShop }) {
  const rawTokensSnapshot = useSyncExternalStore(subscribeToTokens, getTokensSnapshot, getServerSnapshot);
  const [nowSnapshot] = useState(() => Date.now());

  const savedTokens = useMemo<StoredToken[]>(() => {
    try {
      const parsed = JSON.parse(rawTokensSnapshot);
      if (!Array.isArray(parsed)) return [];
      const cutoff = nowSnapshot - 48 * 60 * 60 * 1000;
      return parsed.filter((t) => {
        if (!t || typeof t !== "object") return false;
        const expTime = new Date(t.expiresAt).getTime();
        const createdTime = t.createdAt ? new Date(t.createdAt).getTime() : expTime;
        return expTime > nowSnapshot && createdTime > cutoff;
      });
    } catch {
      return [];
    }
  }, [rawTokensSnapshot, nowSnapshot]);

  return (
    <header className="flex items-center justify-between gap-2 px-1 pb-2 sm:pb-4 min-w-0">
      <Link href="/" className="group flex items-center gap-1.5 sm:gap-2 shrink-0">
        <span className="flex size-6.5 sm:size-8 items-center justify-center rounded-lg sm:rounded-xl bg-emerald-600 text-xs sm:text-base font-black text-white shadow-md shadow-emerald-900/20 transition-transform group-hover:scale-105 shrink-0">
          P
        </span>
        <span className="text-base sm:text-xl font-black tracking-tight text-slate-900 shrink-0">
          Print<span className="text-emerald-600">iva</span>
        </span>
      </Link>
      <div className="flex items-center justify-end gap-1.5 sm:gap-2 min-w-0 shrink">
        {savedTokens.length > 0 && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("printsathi_open_history"))}
            className="inline-flex items-center gap-1 sm:gap-1.5 rounded-full border border-emerald-300 bg-emerald-50/90 px-2 sm:px-2.5 py-1 text-[10.5px] sm:text-xs font-bold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 transition active:scale-95 cursor-pointer shadow-2xs shrink-0"
            title="View Print History"
          >
            <History className="size-3 sm:size-3.5 text-emerald-600 shrink-0" />
            <span className="hidden xs:inline">Print History</span>
            <span className="xs:hidden">History</span>
            <span>({savedTokens.length})</span>
          </button>
        )}
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-bold text-emerald-900 border border-emerald-200 shadow-2xs min-w-0 max-w-[130px] xs:max-w-[180px] sm:max-w-[280px]"
          title={shop.name}
        >
          <Store className="size-3.5 text-emerald-700 shrink-0" />
          <span className="truncate">{shop.name}</span>
        </span>
      </div>
    </header>
  );
}

