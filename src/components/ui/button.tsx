import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: false;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
};
type LinkButtonProps = {
  asChild: true;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  className?: string;
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-emerald-600 text-white border border-emerald-700 shadow-md shadow-emerald-900/15 btn-tactile-primary hover:bg-emerald-700 focus-visible:ring-emerald-500 active:scale-[0.985]",
  secondary:
    "border border-slate-200 bg-white text-slate-900 shadow-xs btn-tactile-secondary hover:bg-slate-50 hover:border-slate-300 focus-visible:ring-emerald-500 active:scale-[0.985]",
  ghost:
    "text-slate-900 hover:bg-black/[0.04] hover:text-black focus-visible:ring-emerald-500 active:scale-[0.985] transition-colors",
  danger:
    "bg-rose-600 text-white border border-rose-700 shadow-xs hover:bg-rose-700 active:scale-[0.985] focus-visible:ring-rose-500",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs font-semibold rounded-lg",
  md: "h-10 px-4 text-sm font-semibold rounded-xl",
  lg: "h-12 px-6 text-base font-bold rounded-xl",
};
const base =
  "inline-flex items-center justify-center gap-2 font-semibold cursor-pointer select-none transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 tracking-tight";

export function Button(props: ButtonProps): React.JSX.Element;
export function Button(props: LinkButtonProps): React.JSX.Element;
export function Button(props: ButtonProps | LinkButtonProps) {
  const { className, variant = "primary", size = "md", children } = props;
  const classes = cn(base, variants[variant], sizes[size], className);
  if ("asChild" in props && props.asChild) {
    return (
      <span
        className={cn(
          classes,
          "inline-flex [&>*]:inline-flex [&>*]:items-center [&>*]:gap-2 [&>*]:w-full [&>*]:h-full [&>*]:justify-center",
        )}
      >
        {children}
      </span>
    );
  }
  const { loading, disabled, ...buttonProps } = props;
  return (
    <button className={classes} disabled={disabled || loading} {...buttonProps}>
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <svg className="size-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {typeof children === "string" ? "Please wait..." : children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
