export type SubscriptionState = {
  status: string;
  trial_end?: string | null;
  current_period_end?: string | null;
};

export function subscriptionEnd(subscription: SubscriptionState | null | undefined) {
  return subscription?.status === "trial" ? subscription.trial_end : subscription?.current_period_end;
}

export function hasSubscriptionAccess(subscription: SubscriptionState | null | undefined, now = Date.now()) {
  const end = subscriptionEnd(subscription);
  return Boolean(subscription && ["active", "trial"].includes(subscription.status) && end && Date.parse(end) > now);
}

export function effectiveBillingMode(mode: string | null | undefined, subscription: SubscriptionState | null | undefined, now = Date.now()): "customer_fee" | "shop_subscription" {
  return mode === "shop_subscription" && hasSubscriptionAccess(subscription, now) ? "shop_subscription" : "customer_fee";
}

export function subscriptionWarningDays(subscription: SubscriptionState | null | undefined, now = Date.now()) {
  if (!hasSubscriptionAccess(subscription, now)) return null;
  const remaining = Date.parse(subscriptionEnd(subscription)!) - now;
  return remaining <= 7 * 86400000 ? Math.ceil(remaining / 86400000) : null;
}
