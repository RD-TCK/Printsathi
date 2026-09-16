import Link from "next/link";
import { Download, Printer } from "lucide-react";
export default function DownloadPage() {
  return <main className="mx-auto max-w-4xl px-6 py-16">
    <Link href="/" className="font-semibold text-brand-700">PrintSaathi</Link>
    <div className="mt-10 rounded-3xl bg-brand-900 p-8 text-white sm:p-12"><Printer className="mb-5 size-10"/><h1 className="text-3xl font-bold sm:text-4xl">Automatic printing for your shop</h1><p className="mt-4 max-w-xl text-white/80">Run the Windows agent on the computer connected to your printer. Paid customer documents arrive automatically with their paper and color settings.</p><a href="/api/agent/download" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-brand-900"><Download className="size-5"/>Download Windows agent</a></div>
    <ol className="mt-8 grid gap-4 sm:grid-cols-3">{[
      ["1. Connect your printer", "Install its Windows driver. Print a Windows test page and check that paper comes out."],
      ["2. Pair your agent", "Open the downloaded agent. In your shop dashboard, open Printer, generate a pairing code, and enter it in the agent."],
      ["3. Accept paid orders", "Keep the agent running and the printer powered on. Add prices and Razorpay keys, then share your customer QR code."],
    ].map(([title, description]) => <li key={title} className="rounded-2xl border border-line bg-white p-5"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{description}</p></li>)}</ol>
    <p className="mt-6 text-sm text-muted">Requires Windows 10 or 11 and a supported printer driver. The agent starts processing while it is running; downloading it does not install a Windows service.</p><Link href="/shop/printer" className="mt-6 inline-block font-semibold text-brand-700 underline">Open printer setup</Link>
  </main>;
}
