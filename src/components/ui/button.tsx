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
  primary: "bg-brand-700 text-white hover:bg-brand-800 focus-visible:ring-brand-600",
  secondary: "border border-line bg-white text-brand-800 hover:bg-brand-50 focus-visible:ring-brand-600",
  ghost: "text-brand-800 hover:bg-brand-50 focus-visible:ring-brand-600",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};
const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

export function Button(props: ButtonProps): React.JSX.Element;
export function Button(props: LinkButtonProps): React.JSX.Element;
export function Button(props: ButtonProps | LinkButtonProps) {
  const { className, variant = "primary", size = "md", children } = props;
  const classes = cn(base, variants[variant], sizes[size], className);
  if ("asChild" in props && props.asChild) return <span className={classes}>{children}</span>;
  const { loading, disabled, ...buttonProps } = props;
  return (
    <button className={classes} disabled={disabled || loading} {...buttonProps}>
      {loading ? "Please wait..." : children}
    </button>
  );
}
