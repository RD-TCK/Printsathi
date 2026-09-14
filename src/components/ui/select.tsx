import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({
  label,
  children,
  className,
  id,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block space-y-2" htmlFor={id}>
      <span className="text-sm font-medium text-brand-950">{label}</span>
      <select
        id={id}
        className={cn(
          "h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
