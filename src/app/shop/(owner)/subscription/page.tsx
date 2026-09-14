import { getShopContext, formatStatus } from "@/lib/shop-portal";
import { ShopPageHeader } from "@/components/shop-page";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function daysRemaining(date: string | null) {
  if (!date) return null;
  return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 86400000));
}

export default async function SubscriptionPage() {
  const context = await getShopContext();
  if (!context) return <Alert tone="error">Shop workspace unavailable.</Alert>;
  const { data: subscription, error } = await context.client
    .from("subscriptions")
    .select("status, trial_start, trial_end, current_period_start, current_period_end, provider_subscription_id")
    .eq("shop_id", context.shop.id)
    .maybeSingle();
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
  const trialDays = daysRemaining(subscription.trial_end);
  return (
    <div className="space-y-8">
      <ShopPageHeader
        eyebrow="Plan & access"
        title="Subscription"
        description="This page reads the current backend state. A new shop starts on a 15-day free trial; subscription billing can be connected separately without affecting customer order payments."
      />
      <Card className="max-w-3xl">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-brand-950">PrintSathi shop plan</h2>
              <p className="mt-1 text-sm text-muted">
                Customer order payments are separate from shop subscription billing.
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
                  <p className="text-xs uppercase tracking-wide text-muted">Trial started</p>
                  <p className="mt-2 font-semibold text-brand-950">
                    {subscription.trial_start
                      ? new Date(subscription.trial_start).toLocaleDateString()
                      : "Not recorded"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Trial ends</p>
                  <p className="mt-2 font-semibold text-brand-950">
                    {subscription.trial_end ? new Date(subscription.trial_end).toLocaleDateString() : "Not recorded"}
                  </p>
                  <p className="mt-1 text-xs text-brand-700">
                    {trialDays === null ? "" : `${trialDays} days remaining`}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Plan status</p>
                  <p className="mt-2 font-semibold text-brand-950">{formatStatus(subscription.status)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Renewal</p>
                  <p className="mt-2 font-semibold text-brand-950">
                    {subscription.current_period_end
                      ? new Date(subscription.current_period_end).toLocaleDateString()
                      : "Not available"}
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
