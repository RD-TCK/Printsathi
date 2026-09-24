"use client";

import { useState, useTransition } from "react";
import { Trash2, AlertTriangle, X, CheckCircle2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";

type DiscardJobButtonProps = {
  jobId: string;
  orderId?: string;
  status: string;
  failureReason?: string | null;
  amount?: number;
};

export function DiscardJobButton({
  jobId,
  orderId,
  status,
  failureReason,
  amount,
}: DiscardJobButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("Customer rejected misprint / defective print");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const isDiscarded =
    status === "failed" &&
    Boolean(failureReason && /discard|reject|misprint|defective/i.test(failureReason));

  if (isDiscarded) {
    return (
      <div className="inline-flex flex-col items-start">
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
          <Trash2 className="size-3 text-rose-500" />
          Discarded (Misprint)
        </span>
        <span className="text-[9px] text-rose-600 font-medium max-w-28 truncate" title={failureReason || ""}>
          No revenue counted
        </span>
      </div>
    );
  }

  const handleDiscard = async () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/shop/discard-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            orderId,
            reason: reason.trim() || "Customer rejected misprint (Discarded by shop owner)",
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to discard print job");

        setIsOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not discard job");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-gradient-to-b from-rose-500 via-rose-600 to-rose-700 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wider text-white shadow-[0_2.5px_0_0_#881337,0_4px_8px_rgba(225,29,72,0.2)] border-t border-rose-300/40 hover:from-rose-400 hover:to-rose-600 active:translate-y-[2px] active:shadow-[0_1px_0_0_#881337] transition-all cursor-pointer select-none"
        title="Discard if customer rejected the print or print came out wrong. Excludes from revenue."
      >
        <Trash2 className="size-3 shrink-0 drop-shadow-xs" />
        <span>Discard Misprint</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 text-rose-600">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-rose-100 shadow-inner">
                  <AlertTriangle className="size-6 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Discard Misprinted Job?</h3>
                  <p className="text-xs text-muted">Customer rejection or defective print</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-950">
              <p className="font-bold">
                ⚠️ This will mark the print as discarded and <u>exclude</u> {amount != null ? `₹${amount.toFixed(2)}` : "the amount"} from today&apos;s and weekly shop revenue calculation.
              </p>
            </div>

            <div className="mt-4 space-y-2">
              <label htmlFor="discard-reason" className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Reason for Discard
              </label>
              <select
                id="discard-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl border border-line bg-slate-50 p-2.5 text-xs font-semibold text-slate-900 focus:border-brand-600 focus:bg-white focus:outline-none"
              >
                <option value="Customer rejected misprint / defective print">
                  Customer rejected misprint / defective print
                </option>
                <option value="Printer paper jam / ink smudge">
                  Printer paper jam / ink smudge
                </option>
                <option value="Wrong side printed / double sided error">
                  Wrong side printed / double sided error
                </option>
                <option value="Customer cancelled before taking prints">
                  Customer cancelled before taking prints
                </option>
                <option value="Other / Misprint">Other / Misprint</option>
              </select>
            </div>

            {error && (
              <p className="mt-3 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                {error}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-slate-100 to-slate-200 border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-[0_2px_0_0_#cbd5e1] hover:bg-slate-200 active:translate-y-[2px] active:shadow-none transition-all cursor-pointer"
              >
                Keep Job
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                disabled={isPending}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-b from-rose-500 via-rose-600 to-rose-700 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-[0_4px_0_0_#881337,0_8px_16px_rgba(225,29,72,0.3)] border-t border-rose-300/40 hover:from-rose-400 hover:to-rose-600 active:translate-y-[3px] active:shadow-[0_1px_0_0_#881337] disabled:opacity-50 transition-all cursor-pointer select-none"
              >
                <Trash2 className="size-4 shrink-0 drop-shadow-xs" />
                <span>{isPending ? "Discarding..." : "Discard & Exclude from Revenue"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
