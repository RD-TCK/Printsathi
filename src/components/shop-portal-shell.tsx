"use client";

import Link from "next/link";
import {
  BarChart3,
  CircleUserRound,
  FileText,
  Gauge,
  Menu,
  PackageOpen,
  PanelLeftClose,
  Printer,
  QrCode,
  Settings,
  WalletCards,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { signOut } from "@/app/actions/auth";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navigation = [
  ["Dashboard", "/shop/dashboard", Gauge],
  ["Jobs", "/shop/jobs", FileText],
  ["Printer", "/shop/printer", Printer],
  ["Pricing", "/shop/pricing", PackageOpen],
  ["QR code", "/shop/qr", QrCode],
  ["Analytics", "/shop/analytics", BarChart3],
  ["Subscription", "/shop/subscription", WalletCards],
  ["Settings", "/shop/settings", Settings],
] as const;

export function ShopPortalShell({
  children,
  shopName,
  userName,
  membershipRole,
}: {
  children: ReactNode;
  shopName: string;
  userName: string | null;
  membershipRole: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-canvas">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 -translate-x-full flex-col border-r border-line bg-white transition-transform lg:translate-x-0",
          open && "translate-x-0",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-6">
          <Link href="/" className="text-xl font-bold tracking-tight text-brand-800">
            Print<span className="text-brand-600">Sathi</span>
          </Link>
          <button
            className="rounded-md p-2 text-muted lg:hidden"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="border-b border-line px-5 py-5">
          <p className="truncate text-sm font-semibold text-brand-950">{shopName}</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone="warning">Agent not installed</Badge>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {navigation.map(([label, href, Icon]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-brand-50 hover:text-brand-800"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-4">
          <div className="flex items-center gap-3 px-2 py-3">
            <CircleUserRound className="size-8 text-brand-600" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-brand-950">{userName || "Shop user"}</p>
              <p className="text-xs capitalize text-muted">{membershipRole.replace("_", " ")}</p>
            </div>
          </div>
          <form action={signOut}>
            <button
              className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-slate-50 hover:text-brand-800"
              type="submit"
            >
              <PanelLeftClose className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
      {open ? (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-brand-950/20 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur lg:px-8">
          <button
            className="rounded-md p-2 text-brand-800 lg:hidden"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <div className="hidden text-sm text-muted lg:block">Shop control plane</div>
          <Link className="text-sm font-semibold text-brand-700" href="/">
            View public site
          </Link>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
