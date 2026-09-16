import { describe, expect, it } from "vitest";
import { capturedPaymentMatches } from "./payment-validation";
const expected = { providerOrderId: "order_shop", amountPaise: 500, currency: "INR" };
const captured = { order_id: "order_shop", amount: 500, currency: "INR", status: "captured" };
describe("payment release validation", () => {
  it("accepts the matching captured payment", () => expect(capturedPaymentMatches(captured, expected)).toBe(true));
  it.each([{ status: "authorized" }, { status: "failed" }, { amount: 499 }, { amount: 501 }, { currency: "USD" }, { order_id: "order_other" }])("rejects mismatched or uncaptured payment %j", update => expect(capturedPaymentMatches({ ...captured, ...update }, expected)).toBe(false));
});
