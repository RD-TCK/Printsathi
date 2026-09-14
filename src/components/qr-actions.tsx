"use client";

import { Check, Clipboard, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function QrActions({ url, dataUrl, enabled }: { url: string; dataUrl: string | null; enabled: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!enabled) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  function print() {
    if (!enabled) return;
    window.print();
  }
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" disabled={!enabled} onClick={copy}>
        {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      <a
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-brand-800 ${enabled && dataUrl ? "hover:bg-brand-50" : "pointer-events-none opacity-50"}`}
        download="printsaathi-shop-qr.png"
        href={dataUrl ?? undefined}
      >
        Download QR
      </a>
      <Button variant="secondary" disabled={!enabled} onClick={print}>
        <Printer className="size-4" />
        Print QR
      </Button>
    </div>
  );
}
