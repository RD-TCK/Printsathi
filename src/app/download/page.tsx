import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Download Print Automation Software for Windows — Printiva Desktop Agent",
  description:
    "Download Printiva print automation software for Windows 10 and 11 (64-bit). Connect your USB, Wi-Fi, or network printer to automatically print paid customer documents in seconds.",
  path: "/download",
  keywords: [
    "download print automation software",
    "printing software for Windows 10",
    "photocopy software download",
    "automatic print agent Windows",
    "xerox shop software PC download",
  ],
});

export default function DownloadPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          ["Home", "/"],
          ["Download", "/download"],
        ])}
      />
      <Link href="/" className="font-semibold text-brand-700">
        Printiva
      </Link>
      <div className="mt-10 rounded-3xl bg-brand-900 p-8 text-white sm:p-12">
        <Printer className="mb-5 size-10" />
        <h1 className="text-3xl font-bold sm:text-4xl">Automatic printing for your shop</h1>
        <p className="mt-4 max-w-xl text-white/80">
          Run the Windows agent on the computer connected to your printer. Paid customer documents arrive automatically
          with their paper and color settings.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <a
            href="/api/agent/download"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-brand-900 shadow-sm transition hover:bg-white/90"
          >
            <Download className="size-5" />
            Download Windows Agent (v1.8.34)
          </a>
          <span className="text-xs text-white/70">
            Version 1.8.34 &bull; 64-bit Windows 10/11
          </span>
        </div>
      </div>
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          [
            "1. Connect your printer",
            "Install its Windows driver. Print a Windows test page and check that paper comes out.",
          ],
          [
            "2. Pair your agent",
            "Open the downloaded agent. In your shop dashboard, open Printer, generate a pairing code, and enter it in the agent.",
          ],
          [
            "3. Accept paid orders",
            "Keep the agent running and the printer powered on. Add prices and Razorpay keys, then share your customer QR code.",
          ],
        ].map(([title, description]) => (
          <li key={title} className="rounded-2xl border border-line bg-white p-5">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-muted">
        Requires Windows 10 or 11 and a supported printer driver. The agent starts processing while it is running;
        downloading it does not install a Windows service.
      </p>
      <Link href="/shop/printer" className="mt-6 inline-block font-semibold text-brand-700 underline">
        Open printer setup
      </Link>
    </main>
  );
}
