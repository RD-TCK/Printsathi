"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
        <Link href="/" className="text-xl font-bold tracking-tight text-brand-800">
          Print<span className="text-brand-600">Sathi</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          <Link className="text-sm text-muted hover:text-brand-700" href="/features">
            Features
          </Link>
          <Link className="text-sm text-muted hover:text-brand-700" href="/how-it-works">
            How it works
          </Link>
          <Link className="text-sm text-muted hover:text-brand-700" href="/pricing">
            Pricing
          </Link>
          <Link className="text-sm text-muted hover:text-brand-700" href="/login">
            Sign in
          </Link>
          <Button asChild size="sm">
            <Link href="/register">Start free trial</Link>
          </Button>
        </nav>
        <button
          className="rounded-md p-2 text-brand-800 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open ? (
        <nav className="border-t border-line bg-white px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            <Link href="/features" onClick={() => setOpen(false)}>
              Features
            </Link>
            <Link href="/how-it-works" onClick={() => setOpen(false)}>
              How it works
            </Link>
            <Link href="/pricing" onClick={() => setOpen(false)}>
              Pricing
            </Link>
            <Link href="/login" onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <Button asChild>
              <Link href="/register">Start free trial</Link>
            </Button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
