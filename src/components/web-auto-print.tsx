"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type LiveStatus = { agentConnected: boolean; paymentsReady: boolean; printers: Array<{ id: string; name: string; online: boolean; color: boolean }> };
export function WebAutoPrintStation({ shopName }: { shopName: string }) {
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/shop/status", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Connection status unavailable. Printing readiness is unconfirmed.");
        const next: LiveStatus = await response.json();
        if (!controller.signal.aborted) { setStatus(next); setError(""); }
      } catch (err) { if (!controller.signal.aborted) { setStatus(null); setError(err instanceof Error ? err.message : "Status unavailable"); } }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  const ready = status?.agentConnected && status.printers.some(p => p.online);
  return <Card className="border-brand-200 bg-gradient-to-br from-white to-emerald-50/50">
    <CardHeader><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Automatic printing — {shopName}</h2><Badge tone={ready ? "success" : "warning"}>{ready ? "Printer connected" : "Waiting for printer"}</Badge></div><p className="mt-2 text-sm text-muted">The Windows agent picks up paid jobs automatically. Connection status refreshes every 2 seconds.</p></CardHeader>
    <CardContent><div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-line bg-white p-4"><p className="text-xs text-muted">Windows agent</p><p className="mt-1 font-semibold">{status?.agentConnected ? "Connected" : "Disconnected / checking"}</p><Link className="text-sm text-brand-700 underline" href="/shop/printer">Pair agent</Link></div>
      <div className="rounded-xl border border-line bg-white p-4"><p className="text-xs text-muted">Physical printers</p><p className="mt-1 font-semibold">{status?.printers.filter(p => p.online).length || 0} connected</p>{status?.printers.map(p => <p key={p.id} className="mt-1 text-xs">{p.name}: {p.online ? "Connected" : "Offline"}</p>)}</div>
      <div className="rounded-xl border border-line bg-white p-4"><p className="text-xs text-muted">Payments</p><p className="mt-1 font-semibold">{status?.paymentsReady ? "Razorpay configured" : "Razorpay keys required"}</p><p className="mt-1 text-xs text-muted">Only verified, captured payments release print jobs.</p></div>
    </div>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<p className="mt-4 text-xs text-muted">Submitted means Windows accepted the job. Confirm completion in Jobs after checking the printed pages.</p></CardContent>
  </Card>;
}

export function WebPrintButton({
  jobId,
  documentName = "Document",
  status,
}: {
  jobId: string;
  documentName?: string;
  status: string;
  amount?: number;
}) {
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const url = `/api/shop/print-document?jobId=${jobId}`;
      const printWindow = window.open(url, "_blank");
      if (printWindow) {
        printWindow.focus();
      } else {
        // Iframe fallback if popup blocker is active
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = url;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          iframe.contentWindow?.print();
        };
      }

      // Automatically mark as completed in background (no manual confirmation required)
      if (status !== "completed") {
        fetch("/api/shop/complete-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, status: "completed" }),
        }).catch(() => {});
      }
    } catch {
      // Manual print error
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handlePrint}
        disabled={printing}
        className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-700 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wider text-white shadow-[0_2.5px_0_0_#064e3b,0_4px_8px_rgba(5,150,105,0.2)] border-t border-emerald-300/40 hover:from-emerald-400 hover:to-emerald-600 active:translate-y-[2px] active:shadow-[0_1px_0_0_#064e3b] disabled:opacity-50 transition-all cursor-pointer select-none"
      >
        <Printer className="size-3 shrink-0 drop-shadow-xs" />
        <span>{printing ? "Printing..." : "Print (Web)"}</span>
      </button>
      <a
        href={`/api/shop/print-document?jobId=${jobId}`}
        target="_blank"
        rel="noopener noreferrer"
        download={documentName}
        className="inline-flex items-center justify-center rounded-lg bg-gradient-to-b from-slate-50 to-slate-100 border border-slate-300 p-1.5 text-slate-700 shadow-[0_1.5px_0_0_#cbd5e1] hover:bg-slate-200 active:translate-y-[1px] active:shadow-none transition-all"
        title="Download PDF"
      >
        <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

