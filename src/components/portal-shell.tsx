import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function PortalShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
          <Link href="/" className="text-xl font-bold tracking-tight text-brand-800">
            Print<span className="text-brand-600">iva</span>
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">Exit</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-950">{title}</h1>
        <p className="mt-2 max-w-2xl text-muted">{description}</p>
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
