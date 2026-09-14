import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Alert({
  title,
  children,
  tone = "info",
  className,
}: {
  title?: string;
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "error";
  className?: string;
}) {
  const tones = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    success: "border-brand-100 bg-brand-50 text-brand-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={cn("rounded-lg border p-4 text-sm", tones[tone], className)} role="status">
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : ""}>{children}</div>
    </div>
  );
}
