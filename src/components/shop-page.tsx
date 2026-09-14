import type { ReactNode } from "react";
import { ArrowUpRight, CircleHelp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ShopPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-950">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <span
          className={cn(
            "size-2 rounded-full",
            tone === "success" ? "bg-brand-600" : tone === "warning" ? "bg-amber-500" : "bg-slate-300",
          )}
        />
      </div>
      <p className="mt-4 text-2xl font-semibold text-brand-950">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </Card>
  );
}

export function StatusRow({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const colors = { neutral: "bg-slate-300", success: "bg-brand-600", warning: "bg-amber-500", danger: "bg-red-500" };
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-4 last:border-0">
      <div className="flex items-center gap-3">
        <span className={cn("size-2.5 rounded-full", colors[tone])} />
        <div>
          <p className="text-sm font-semibold text-brand-950">{label}</p>
          <p className="mt-1 text-xs text-muted">{detail}</p>
        </div>
      </div>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{value}</span>
    </div>
  );
}

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <Card className="flex min-h-48 flex-col items-center justify-center p-8 text-center">
      <CircleHelp className="size-7 text-brand-600" />
      <h2 className="mt-4 font-semibold text-brand-950">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
    </Card>
  );
}

export function LinkAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800" href={href}>
      {children}
      <ArrowUpRight className="size-4" />
    </a>
  );
}
