import { describe, expect, it } from "vitest";
import { effectiveBillingMode, subscriptionWarningDays } from "./subscription";

const now = Date.parse("2026-09-18T12:00:00Z");
const state = (days: number, status = "active") => ({ status, current_period_end: new Date(now + days * 86400000).toISOString() });
describe("subscription expiry", () => {
  it("switches fees at the exact expiry even if the stored status is still active", () => {
    expect(effectiveBillingMode("shop_subscription", state(1), now)).toBe("shop_subscription");
    expect(effectiveBillingMode("shop_subscription", state(0), now)).toBe("customer_fee");
    expect(effectiveBillingMode("shop_subscription", state(-1), now)).toBe("customer_fee");
    expect(effectiveBillingMode("customer_fee", state(1), now)).toBe("customer_fee");
  });
  it("does not waive fees for missing, invalid, or cancelled plans", () => {
    for (const sub of [null, { status: "active" }, { status: "active", current_period_end: "bad" }, state(1, "cancelled")]) {
      expect(effectiveBillingMode("shop_subscription", sub, now)).toBe("customer_fee");
    }
  });
  it("warns only within the final seven days", () => {
    expect(subscriptionWarningDays(state(7.001), now)).toBeNull();
    expect(subscriptionWarningDays(state(7), now)).toBe(7);
    expect(subscriptionWarningDays(state(0.1), now)).toBe(1);
    expect(subscriptionWarningDays(state(0), now)).toBeNull();
    expect(subscriptionWarningDays({ status: "trial", trial_end: state(3).current_period_end }, now)).toBe(3);
  });
});
