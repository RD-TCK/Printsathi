"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  CircleUserRound,
  Home,
  LogOut,
  Menu,
  Package,
  Printer,
  QrCode,
  Search,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { signOut } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

const nav = [
  { label: "My Orders", href: "/customer", icon: ClipboardList },
  { label: "Track Order", href: "/track", icon: Search },
  { label: "Print at a Shop", href: "/shops", icon: Printer },
] as const;

export function CustomerPortalShell({
  children,
  userName,
  email,
}: {
  children: ReactNode;
  userName?: string | null;
  email?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 -translate-x-full flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0",
          open && "translate-x-0",
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-6">
          <Link href="/" className="text-xl font-bold tracking-tight text-slate-800">
            Print<span className="text-emerald-600">Sathi</span>
          </Link>
          <button
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Customer badge */}
        <div className="border-b border-slate-200 bg-emerald-50/60 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100">
              <CircleUserRound className="size-5 text-emerald-700" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {userName || "Customer"}
              </p>
              {email && (
                <p className="truncate text-xs text-slate-500">{email}</p>
              )}
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                <Package className="size-2.5" /> Customer Portal
              </span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {nav.map(({ label, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-emerald-50 text-emerald-800 font-semibold"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
                )}
              >
                <Icon
                  className={cn(
                    "size-4",
                    active ? "text-emerald-600" : "text-slate-400",
                  )}
                />
                {label}
                {active && (
                  <span className="ml-auto size-1.5 rounded-full bg-emerald-500" />
                )}
              </Link>
            );
          })}

          {/* Divider */}
          <div className="my-3 border-t border-slate-100" />

          <Link
            href="/"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <Home className="size-4 text-slate-400" />
            PrintSathi Home
          </Link>
        </nav>

        {/* Sign out */}
        <div className="border-t border-slate-200 p-4">
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-700 transition-colors"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-8">
          <button
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <div className="hidden items-center gap-2 text-sm text-slate-500 lg:flex">
            <QrCode className="size-4 text-emerald-600" />
            <span className="font-medium text-slate-700">Customer Portal</span>
            <span className="text-slate-300">·</span>
            <span>Manage and track your print orders</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/shops"
              className="hidden rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:inline-flex items-center gap-1.5"
            >
              <Printer className="size-3.5 text-emerald-600" />
              Print at a Shop
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
