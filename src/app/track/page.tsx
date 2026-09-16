"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Package,
  Printer,
  QrCode,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";


type TrackResult = {
  publicId: string;
  status: string;
  shopName: string;
  totalAmount: number;
  totalPages: number;
  createdAt: string;
  paymentStatus: string;
  paymentTxnId?: string | null;
  jobs: Array<{ id: string; status: string; pages: number; filename?: string | null }>;
};

export default function PublicTrackPage() {
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | { found: false } | TrackResult>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/customer/track?id=${encodeURIComponent(orderId.trim())}`);
      const text = await res.text();
      let data: (TrackResult | { found: false }) & { error?: string };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Tracking service error (HTTP ${res.status}). Please try again.`);
      }
      if (!res.ok) throw new Error(data.error || "Could not track order.");
      if (!("found" in data) && !("publicId" in data)) throw new Error("Invalid tracking response.");
      setResult(data);
    } catch (err) {
      let msg = err instanceof Error ? err.message : "Could not track order.";
      if (msg.includes("Unexpected end of JSON input")) {
        msg = "Unable to process tracking response. Please try again.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="text-xl font-bold tracking-tight text-slate-800">
            Print<span className="text-emerald-600">Sathi</span>
          </Link>
          <Link
            href="/customer"
            className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            Sign in to My Orders →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 space-y-8">
        {/* Hero */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-emerald-100">
            <QrCode className="size-8 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Track Your Print Order</h1>
          <p className="mt-2 text-slate-500">
            Enter your order ID from your receipt or confirmation email to check the status.
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleTrack} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="trackInput"
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Paste your Order ID here…"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !orderId.trim()}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <span className="size-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Track
          </button>
        </form>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* No result */}
        {result && "found" in result && !result.found && (
          <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
            <Package className="size-10 text-slate-300" />
            <p className="mt-4 font-semibold text-slate-600">Order not found</p>
            <p className="mt-1 text-sm text-slate-400">
              Check the order ID and try again.
            </p>
          </div>
        )}

        {/* Result */}
        {result && !("found" in result) && <TrackResultCard data={result as TrackResult} />}

        {/* Sign-in CTA */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="font-semibold text-slate-900">Have a PrintSathi account?</p>
            <p className="text-sm text-slate-500">
              Sign in to see all your orders in one place with full history.
            </p>
          </div>
          <Link
            href="/customer"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Go to My Orders <ArrowRight className="size-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}

function TrackResultCard({ data }: { data: TrackResult }) {
  const isVerified = data.paymentStatus === "verified";
  const isFailed = data.paymentStatus === "failed";
  const allDone = data.jobs.every((j) => j.status === "completed");

  return (
    <div className="space-y-4">
      {/* Big status */}
      <div
        className={`flex items-center gap-4 rounded-2xl border px-6 py-5 ${
          allDone && isVerified
            ? "border-emerald-200 bg-emerald-50"
            : isFailed
              ? "border-red-200 bg-red-50"
              : isVerified
                ? "border-blue-200 bg-blue-50"
                : "border-amber-200 bg-amber-50"
        }`}
      >
        {allDone && isVerified ? (
          <CheckCircle2 className="size-8 shrink-0 text-emerald-600" />
        ) : isFailed ? (
          <XCircle className="size-8 shrink-0 text-red-600" />
        ) : isVerified ? (
          <Printer className="size-8 shrink-0 text-blue-600" />
        ) : (
          <Clock className="size-8 shrink-0 text-amber-600" />
        )}
        <div>
          <p className="text-lg font-bold text-slate-900">
            {allDone && isVerified
              ? "Your documents have been printed!"
              : isFailed
                ? "Payment was not completed"
                : isVerified
                  ? "Printing in progress…"
                  : "Awaiting payment confirmation"}
          </p>
          <p className="text-sm text-slate-500">
            Order #{data.publicId} · {data.shopName}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Amount", value: `₹${data.totalAmount.toFixed(2)}` },
            { label: "Pages", value: String(data.totalPages) },
            {
              label: "Payment",
              value: isVerified ? "Verified ✓" : isFailed ? "Failed" : "Pending",
              highlight: isVerified ? "text-emerald-700" : isFailed ? "text-red-700" : "text-amber-700",
            },
            { label: "Date", value: new Date(data.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" }) },
          ].map(({ label, value, highlight }) => (
            <div key={label}>
              <p className="text-xs text-slate-400">{label}</p>
              <p className={`mt-0.5 font-bold text-slate-900 ${highlight ?? ""}`}>{value}</p>
            </div>
          ))}
        </div>

        {isVerified && data.paymentTxnId && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <ShieldCheck className="size-3.5 shrink-0" />
            <span className="font-medium">Razorpay transaction: {data.paymentTxnId}</span>
          </div>
        )}

        {data.jobs.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Print jobs
            </p>
            <div className="space-y-2">
              {data.jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm"
                >
                  <FileText className="size-4 shrink-0 text-slate-400" />
                  <span className="flex-1 truncate text-slate-700">
                    {job.filename || `Job #${job.id.slice(0, 8).toUpperCase()}`}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">{job.pages}p</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 ${
                      job.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : job.status === "failed"
                          ? "bg-red-100 text-red-700"
                          : isVerified
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {job.status === "completed"
                      ? "✓ Printed"
                      : job.status === "failed"
                        ? "Failed"
                        : isVerified
                          ? "Printing…"
                          : "Queued"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
