import { effectiveBillingMode, hasSubscriptionAccess } from "@/lib/subscription";
import { getShopContext, formatStatus } from "@/lib/shop-portal";
import { ShopPageHeader } from "@/components/shop-page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BillingModeToggle } from "@/components/billing-mode-toggle";
import { SubscriptionCheckout } from "@/components/subscription-checkout";

export const dynamic = "force-dynamic";

function daysRemaining(date: string | null) {
  if (!date) return null;
  return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 86400000));
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const context = await getShopContext();
  if (!context) return <Alert tone="error">Shop workspace unavailable.</Alert>;

  const [{ data: subscription, error }, { data: settings }] = await Promise.all([
    context.client
      .from("subscriptions")
      .select("status, trial_start, trial_end, current_period_start, current_period_end, provider_subscription_id")
      .eq("shop_id", context.shop.id)
      .maybeSingle(),
    context.client
      .from("shop_settings")
      .select("billing_mode")
      .eq("shop_id", context.shop.id)
      .maybeSingle(),
  ]);

  if (error)
    return (
      <Alert tone="error" title="Subscription unavailable">
        Could not read the shop subscription state.
      </Alert>
    );

  if (!subscription)
    return (
      <Alert tone="warning" title="No subscription record">
        No subscription has been provisioned for this shop.
      </Alert>
    );

  if (!hasSubscriptionAccess(subscription)) subscription.status = "expired";
  const trialDays = daysRemaining(subscription.trial_end);
  const activeDays = daysRemaining(subscription.current_period_end);
  const currentBillingMode = effectiveBillingMode(settings?.billing_mode, subscription);

  return (
    <div className="space-y-8">
      <ShopPageHeader
        eyebrow="Plan & access"
        title="Subscription & Billing"
        description="Manage your shop plan and choose between customer-funded platform convenience fees or standard subscription billing."
      />

      {params?.success ? (
        <Alert tone="success" className="max-w-4xl">
          {params.success}
        </Alert>
      ) : null}

      {params?.error ? (
        <Alert tone="error" className="max-w-4xl">
          {params.error}
        </Alert>
      ) : null}

      {/* Interactive Billing Mode Toggle */}
      <BillingModeToggle currentMode={currentBillingMode} />

      {/* Subscription Plan Details */}
      <Card className="max-w-4xl border-line">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-brand-950">Current Shop Status</h2>
              <p className="mt-1 text-sm text-muted">
                Customer order payments are settled separately from shop subscription billing.
              </p>
            </div>
            <Badge tone={subscription.status === "active" || subscription.status === "trial" ? "success" : "warning"}>
              {formatStatus(subscription.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2">
            {subscription.status === "trial" ? (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted font-bold">Trial started</p>
                  <p className="mt-2 font-semibold text-brand-950">
                    {subscription.trial_start
                      ? new Date(subscription.trial_start).toLocaleDateString()
                      : "Not recorded"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted font-bold">Trial ends</p>
                  <p className="mt-2 font-semibold text-brand-950">
                    {subscription.trial_end ? new Date(subscription.trial_end).toLocaleDateString() : "Not recorded"}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-brand-700">
                    {trialDays === null ? "" : `${trialDays} days remaining`}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted font-bold">Plan status</p>
                  <p className="mt-2 font-semibold text-brand-950">{formatStatus(subscription.status)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted font-bold">Expiry date</p>
                  <p className="mt-2 font-semibold text-brand-950">
                    {subscription.current_period_end
                      ? new Date(subscription.current_period_end).toLocaleDateString()
                      : "Not available"}
                  </p>
                  {activeDays !== null ? (
                    <p className="mt-1 text-xs font-semibold text-brand-700">
                      {activeDays} days remaining
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Available Plans & Razorpay Checkout */}
      <div className="space-y-4 max-w-4xl">
        <div>
          <h2 className="text-xl font-bold text-brand-950">Choose or Renew Subscription</h2>
          <p className="text-sm text-muted mt-1">
            Subscribe to eliminate customer platform convenience fees and enable direct instant printing.
          </p>
        </div>
        <SubscriptionCheckout
          shopName={context.shop.name}
          shopId={context.shop.id}
        />
      </div>
    </div>
  );
}
