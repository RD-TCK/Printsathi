"use client";

import { useState, useTransition } from "react";
import { toggleAcceptingOrders } from "@/app/shop/actions";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function AcceptingOrdersSwitch({
  initialAccepting = true,
}: {
  initialAccepting?: boolean;
}) {
  const [accepting, setAccepting] = useState(initialAccepting);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    const nextValue = !accepting;
    setAccepting(nextValue);

    startTransition(async () => {
      const res = await toggleAcceptingOrders(nextValue);
      if (!res.success) {
        // Revert optimistic update on failure
        setAccepting(!nextValue);
        alert(res.error || "Failed to update accepting orders setting.");
      }
    });
  };

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <span
          className={cn(
            "size-2 rounded-full transition-colors",
            accepting ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
          )}
        />
        <span className="hidden sm:inline text-brand-950">
          Accepting Orders:
        </span>
        <span
          className={cn(
            "font-bold uppercase tracking-wider text-[11px] px-1.5 py-0.5 rounded",
            accepting
              ? "bg-emerald-100 text-emerald-800"
              : "bg-slate-100 text-slate-600"
          )}
        >
          {accepting ? "Yes" : "No"}
        </span>
      </div>

      {/* Interactive Switch */}
      <button
        type="button"
        role="switch"
        aria-checked={accepting}
        aria-label="Toggle accepting orders"
        disabled={isPending}
        onClick={handleToggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed",
          accepting ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-300 hover:bg-slate-400"
        )}
      >
        <span className="sr-only">Toggle accepting orders</span>
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center",
            accepting ? "translate-x-5" : "translate-x-0"
          )}
        >
          {isPending && (
            <Loader2 className="size-3 animate-spin text-brand-700" />
          )}
        </span>
      </button>
    </div>
  );
}
