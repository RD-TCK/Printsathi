import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }) {
  return (
    <label className="block space-y-2" htmlFor={id}>
      <span className="text-sm font-medium text-brand-950">{label}</span>
      <input
        id={id}
        className={cn(
          "h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50",
          error && "border-red-400",
          className,
        )}
        {...props}
      />
      {error ? (
        <span className="text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}
