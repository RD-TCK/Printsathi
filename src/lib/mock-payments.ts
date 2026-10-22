/**
 * Explicit opt-in for test servers; enabled by env flag or in development mode, never with live keys.
 * A production server without platform Razorpay keys must NOT fall back to mock: shops bring their own
 * gateway keys, so a missing platform key would let any customer release print jobs without paying.
 */
export function mockPaymentsEnabled() {
  const isLiveKey = [process.env.RAZORPAY_KEY_ID, process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID].some((key) =>
    key?.startsWith("rzp_live_"),
  );
  if (isLiveKey) return false;

  return process.env.ENABLE_MOCK_PAYMENTS === "true" || process.env.NODE_ENV !== "production";
}

export function isMockPayment(payment: { provider?: string; metadata?: Record<string, unknown> | null }) {
  return payment.provider === "mock" && payment.metadata?.source === "printsaathi-test-checkout-v1";
}

export function paymentCanPrint(payment: {
  provider?: string;
  status?: string;
  provider_payment_id?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return (
    payment.status === "verified" &&
    Boolean(payment.provider_payment_id) &&
    (payment.provider === "razorpay" ||
      payment.provider === "counter" ||
      (mockPaymentsEnabled() && isMockPayment(payment)))
  );
}
