"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, ShieldCheck, Zap, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: string, callback: (response: unknown) => void) => void;
    };
  }
}

async function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.Razorpay) return true;

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

interface SubscriptionCheckoutProps {
  currentStatus: string;
  currentPeriodEnd: string | null;
  shopName: string;
}

export function SubscriptionCheckout({
  currentStatus,
  currentPeriodEnd,
  shopName,
}: SubscriptionCheckoutProps) {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<"monthly" | "yearly" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubscribe = async (plan: "monthly" | "yearly") => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoadingPlan(plan);

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        throw new Error("Unable to load Razorpay payment gateway. Please check your internet connection.");
      }

      const res = await fetch("/api/shop/subscription/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();
      if (!res.ok || !data.razorpayOrderId) {
        throw new Error(data.error || "Failed to initialize payment.");
      }

      const options: RazorpayOptions = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency || "INR",
        name: "PrintSaathi",
        description: data.planDescription || (plan === "monthly" ? "Shop Monthly Subscription" : "Shop Yearly Subscription"),
        order_id: data.razorpayOrderId,
        theme: { color: "#2563eb" },
        handler: async (response) => {
          setLoadingPlan(plan);
          try {
            const verifyRes = await fetch("/api/shop/subscription/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                plan,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.success) {
              throw new Error(verifyData.error || "Payment verification failed.");
            }

            setSuccessMsg(verifyData.message || "Subscription activated successfully!");
            router.refresh();
          } catch (verifyErr) {
            setErrorMsg(verifyErr instanceof Error ? verifyErr.message : "Verification error occurred.");
          } finally {
            setLoadingPlan(null);
          }
        },
        modal: {
          ondismiss: () => {
            setLoadingPlan(null);
          },
        },
      };

      const razorpayInstance = new window.Razorpay(options);
      razorpayInstance.open();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setLoadingPlan(null);
    }
  };

  return (
    <div className="space-y-6">
      {errorMsg ? (
        <Alert tone="error" title="Subscription Error">
          {errorMsg}
        </Alert>
      ) : null}

      {successMsg ? (
        <Alert tone="success" title="Subscription Activated!">
          {successMsg}
        </Alert>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 max-w-4xl">
        {/* Monthly Plan Card */}
        <Card className="relative flex flex-col justify-between border-line shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Billed Monthly</span>
              <Badge tone="neutral">Standard</Badge>
            </div>
            <CardTitle className="mt-2 text-2xl font-bold text-brand-950">Monthly Plan</CardTitle>
            <CardDescription>Flexible monthly billing for active print shops.</CardDescription>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-brand-950">₹699</span>
              <span className="text-sm font-medium text-muted">/ month</span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col justify-between flex-1 gap-6">
            <ul className="space-y-3 text-sm text-brand-950">
              <li className="flex items-center gap-2.5">
                <Check className="size-4 text-emerald-600 shrink-0" />
                <span><strong>₹0 Platform Fee</strong> on all customer print jobs</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="size-4 text-emerald-600 shrink-0" />
                <span>Instant 2-second live auto-print queue</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="size-4 text-emerald-600 shrink-0" />
                <span>Unlimited documents & customer QR access</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="size-4 text-emerald-600 shrink-0" />
                <span>Direct shop owner settlements</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="size-4 text-emerald-600 shrink-0" />
                <span>Standard technical support</span>
              </li>
            </ul>

            <Button
              variant="secondary"
              className="w-full py-6 font-semibold text-base"
              disabled={loadingPlan !== null}
              onClick={() => handleSubscribe("monthly")}
            >
              {loadingPlan === "monthly" ? (
                <>
                  <Loader2 className="mr-2 size-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Zap className="mr-2 size-4 text-brand-700" />
                  Subscribe Monthly (₹699)
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Yearly Plan Card */}
        <Card className="relative flex flex-col justify-between border-2 border-brand-600 bg-gradient-to-b from-brand-50/40 via-white to-white shadow-md hover:shadow-lg transition-shadow">
          <div className="absolute -top-3 right-6">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-sm">
              <Sparkles className="size-3" />
              10% DISCOUNT
            </span>
          </div>

          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-700">Best Value · Save 10%</span>
              <Badge tone="success">Recommended</Badge>
            </div>
            <CardTitle className="mt-2 text-2xl font-bold text-brand-950">Yearly Plan</CardTitle>
            <CardDescription>Full year coverage with maximum savings for your shop.</CardDescription>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-brand-950">₹7,499</span>
              <span className="text-sm font-medium text-muted">/ year</span>
              <span className="text-xs text-muted line-through">₹8,388</span>
            </div>
            <p className="text-xs font-semibold text-emerald-700 mt-1">
              Effective ₹624.91/mo · You save ₹889 per year (10% off)
            </p>
          </CardHeader>
          <CardContent className="flex flex-col justify-between flex-1 gap-6">
            <ul className="space-y-3 text-sm text-brand-950">
              <li className="flex items-center gap-2.5">
                <Check className="size-4 text-emerald-600 shrink-0" />
                <span><strong>₹0 Platform Fee</strong> for full 365 days</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="size-4 text-emerald-600 shrink-0" />
                <span>Instant 2-second live auto-print queue</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="size-4 text-emerald-600 shrink-0" />
                <span>Unlimited documents & high-resolution QR kit</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="size-4 text-emerald-600 shrink-0" />
                <span>Direct shop owner settlements</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="size-4 text-emerald-600 shrink-0" />
                <span><strong>Priority WhatsApp & Phone Support</strong></span>
              </li>
            </ul>

            <Button
              variant="primary"
              className="w-full py-6 font-semibold text-base shadow-sm"
              disabled={loadingPlan !== null}
              onClick={() => handleSubscribe("yearly")}
            >
              {loadingPlan === "yearly" ? (
                <>
                  <Loader2 className="mr-2 size-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 size-5" />
                  Subscribe Yearly (₹7,499)
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-4xl rounded-lg border border-line bg-surface-muted/50 p-4 text-xs text-muted leading-relaxed">
        <p>
          <strong>Automatic Model Switching:</strong> If your active subscription expires, your shop will automatically shift to the <em>Take from Customer</em> platform fee model (₹0.50 for ≤5 pages, ₹1.50 for ≥6 pages) so your customers can continue printing without any disruption. You can upgrade or renew your plan at any time.
        </p>
      </div>
    </div>
  );
}
