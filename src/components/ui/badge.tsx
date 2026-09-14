import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "success" | "warning" | "neutral" | "danger";
export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const tones = {
    success: "bg-brand-100 text-brand-800",
    warning: "bg-amber-100 text-amber-800",
    neutral: "bg-slate-100 text-slate-700",
    danger: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone], className)}
      {...props}
    />
  );
}
