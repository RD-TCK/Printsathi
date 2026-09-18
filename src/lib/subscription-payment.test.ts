import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { activateSubscriptionPayment } from "./subscription-payment";
import { fetchRazorpayOrder, fetchRazorpayPayment } from "./razorpay/server";
vi.mock("./razorpay/server", () => ({ fetchRazorpayOrder: vi.fn(), fetchRazorpayPayment: vi.fn() }));
const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient;
const expected = { shopId: "shop-1", plan: "monthly", orderId: "order-1" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchRazorpayPayment).mockResolvedValue({ order_id: "order-1", amount: 69900, currency: "INR", status: "captured", amount_refunded: 0 } as never);
  vi.mocked(fetchRazorpayOrder).mockResolvedValue({ amount: 69900, currency: "INR", notes: { purpose: "shop_subscription", shop_id: "shop-1", plan_type: "monthly" } } as never);
  rpc.mockResolvedValue({ data: "2026-10-18", error: null });
});
it("activates a captured payment through the atomic ledger", async () => {
  await expect(activateSubscriptionPayment(client, "pay-1", expected)).resolves.toBe("2026-10-18");
  expect(rpc).toHaveBeenCalledWith("activate_shop_subscription", { p_shop_id: "shop-1", p_plan: "monthly", p_payment_id: "pay-1", p_order_id: "order-1" });
});
it("rejects another shop's payment and plan tampering", async () => {
  await expect(activateSubscriptionPayment(client, "pay-1", { ...expected, shopId: "shop-2" })).rejects.toThrow("match");
  await expect(activateSubscriptionPayment(client, "pay-1", { ...expected, plan: "yearly" })).rejects.toThrow("match");
  expect(rpc).not.toHaveBeenCalled();
});
it("recovers an existing payment only for its shop, deriving the plan from Razorpay", async () => {
  await expect(activateSubscriptionPayment(client, "pay-1", { shopId: "shop-1" })).resolves.toBe("2026-10-18");
  rpc.mockClear();
  await expect(activateSubscriptionPayment(client, "pay-1", { shopId: "shop-2" })).rejects.toThrow("match");
  expect(rpc).not.toHaveBeenCalled();
});
it("explains missing database setup without telling the owner to pay again", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Function missing" } });
  await expect(activateSubscriptionPayment(client, "pay-1", expected)).rejects.toThrow("Do not pay again");
  expect(log).toHaveBeenCalledWith("Subscription activation failed", expect.objectContaining({ code: "PGRST202" }));
  log.mockRestore();
});
it.each([null, { status: "authorized" }, { amount: 69800 }, { currency: "USD" }, { amount_refunded: 100 }])("rejects unverified or mismatched payments: %j", async (override) => {
  vi.mocked(fetchRazorpayPayment).mockResolvedValue(override === null ? null : { order_id: "order-1", amount: 69900, currency: "INR", status: "captured", amount_refunded: 0, ...override } as never);
  await expect(activateSubscriptionPayment(client, "pay-1", expected)).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
