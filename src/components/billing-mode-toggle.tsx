"use client";

import { useTransition } from "react";
import { CheckCircle2, Circle, Users, CreditCard, Sparkles, ShieldCheck } from "lucide-react";
import { updateShopBillingMode } from "@/app/shop/actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BillingMode = "customer_fee" | "shop_subscription";

interface BillingModeToggleProps {
  currentMode: BillingMode;
}

export function BillingModeToggle({ currentMode }: BillingModeToggleProps) {
  const [isPending, startTransition] = useTransition();

  const handleSelectMode = (mode: BillingMode) => {
    if (mode === currentMode || isPending) return;
    const formData = new FormData();
    formData.append("billingMode", mode);
    startTransition(async () => {
      await updateShopBillingMode(formData);
    });
  };

  return (
    <Card className="max-w-3xl overflow-hidden border-line">
      <CardHeader className="bg-gradient-to-r from-brand-50/70 to-emerald-50/40 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-brand-600" />
              <h2 className="text-xl font-bold text-brand-950">Platform Fee &amp; Billing Model</h2>
            </div>
            <p className="mt-1 text-sm text-muted">
              Choose how platform fees are handled for your shop.
            </p>
          </div>
          {isPending ? (
            <Badge tone="warning">Saving changes...</Badge>
          ) : (
            <Badge tone="success">
              {currentMode === "customer_fee" ? "Customer Fee Active" : "Shop Plan Active"}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Option 1: Take from Customer (Default) */}
          <div
            onClick={() => handleSelectMode("customer_fee")}
            className={cn(
              "relative flex flex-col justify-between rounded-2xl border-2 p-5 cursor-pointer transition-all duration-200",
              currentMode === "customer_fee"
                ? "border-brand-600 bg-brand-50/40 shadow-md ring-2 ring-brand-600/15"
                : "border-line bg-white hover:border-brand-200 hover:bg-slate-50/50",
              isPending && "opacity-60 cursor-wait",
            )}
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                    <Users className="size-5" />
                  </div>
                  <h3 className="font-bold text-brand-950">Take from Customer</h3>
                </div>
                {currentMode === "customer_fee" ? (
                  <CheckCircle2 className="size-6 text-brand-600" />
                ) : (
                  <Circle className="size-6 text-slate-300" />
                )}
              </div>

              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-brand-900">₹0</span>
                <span className="text-xs font-semibold text-muted">/ month for shop</span>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-600">
                A small convenience fee is automatically added to the customer&apos;s checkout total:
              </p>

              <div className="mt-3 space-y-1.5 rounded-xl bg-white/80 p-3 text-xs border border-emerald-100">
                <div className="flex items-center justify-between text-slate-700">
                  <span>1 to 5 total pages:</span>
                  <span className="font-bold text-emerald-800">+ ₹0.50</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>6+ total pages:</span>
                  <span className="font-bold text-emerald-800">+ ₹1.50</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold text-brand-700">
              <ShieldCheck className="size-3.5" />
              <span>Recommended &bull; Zero fixed cost</span>
            </div>
          </div>

          {/* Option 2: Pay Subscription */}
          <div
            onClick={() => handleSelectMode("shop_subscription")}
            className={cn(
              "relative flex flex-col justify-between rounded-2xl border-2 p-5 cursor-pointer transition-all duration-200",
              currentMode === "shop_subscription"
                ? "border-brand-600 bg-brand-50/40 shadow-md ring-2 ring-brand-600/15"
                : "border-line bg-white hover:border-brand-200 hover:bg-slate-50/50",
              isPending && "opacity-60 cursor-wait",
            )}
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-800">
                    <CreditCard className="size-5" />
                  </div>
                  <h3 className="font-bold text-brand-950">Pay Subscription</h3>
                </div>
                {currentMode === "shop_subscription" ? (
                  <CheckCircle2 className="size-6 text-brand-600" />
                ) : (
                  <Circle className="size-6 text-slate-300" />
                )}
              </div>

              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-brand-900">Shop Plan</span>
                <span className="text-xs font-semibold text-muted">Fixed monthly</span>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-600">
                The shop owner pays a monthly subscription. Customers are charged <b>₹0.00 platform fee</b> and only pay your print page rates.
              </p>

              <div className="mt-3 rounded-xl bg-white/80 p-3 text-xs border border-indigo-100 text-slate-700">
                <div className="flex items-center justify-between">
                  <span>Customer platform fee:</span>
                  <span className="font-bold text-indigo-700">₹0.00 (Free)</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700">
              <Sparkles className="size-3.5" />
              <span>Clean customer invoices</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
