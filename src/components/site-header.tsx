"use client";

import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line/80 bg-white/80 backdrop-blur-xl transition-all duration-200 shadow-[0_1px_8px_-2px_rgba(0,0,0,0.06)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
        {/* Brand */}
        <Link
          href="/"
          className="group flex items-center gap-2.5 outline-none"
        >
          <div className="relative flex items-center justify-center transition-transform duration-300 group-hover:scale-105 group-active:scale-95">
            <Logo size={32} className="shrink-0" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-brand-950">
            Print<span className="text-brand-600">iva</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {[
            { label: "Features", href: "/features" },
            { label: "How it works", href: "/how-it-works" },
            { label: "Pricing", href: "/pricing" },
            { label: "Windows Agent", href: "/download" },
          ].map((item) => (
            <Link
              key={item.label}
              className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-brand-50 hover:text-brand-950"
              href={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            className="px-3 py-2 text-[13px] font-medium text-muted transition-colors hover:text-brand-950"
            href="/login"
          >
            Sign in
          </Link>
          <Button asChild size="sm" variant="primary">
            <Link href="/register" className="group">
              Start free trial
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>

        {/* Mobile toggle */}
        <button
          className="flex size-9 items-center justify-center rounded-lg border border-line bg-white text-brand-900 transition-colors hover:bg-brand-50 active:scale-95 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open ? (
        <div className="border-t border-line bg-white px-6 py-6 md:hidden">
          <nav className="flex flex-col gap-1">
            {[
              ["Features", "/features"],
              ["How it works", "/how-it-works"],
              ["Pricing", "/pricing"],
              ["Windows Agent", "/download"],
              ["Sign in", "/login"],
            ].map(([label, href]) => (
              <Link
                key={label}
                href={href}
                onClick={() => setOpen(false)}
                className="rounded-lg p-3 text-sm font-medium text-brand-950 hover:bg-brand-50"
              >
                {label}
              </Link>
            ))}
            <div className="pt-3">
              <Button asChild className="w-full">
                <Link href="/register" onClick={() => setOpen(false)}>
                  Start free trial
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
