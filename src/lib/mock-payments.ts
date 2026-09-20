/** Explicit opt-in for test servers; enabled by env flag, in development mode, or when live keys are not set. */
export function mockPaymentsEnabled() {
  const isLiveKey = [process.env.RAZORPAY_KEY_ID, process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID].some(
    (key) => key?.startsWith("rzp_live_")
  );
  if (isLiveKey) return false;

  return (
    process.env.ENABLE_MOCK_PAYMENTS === "true" ||
    process.env.NODE_ENV !== "production" ||
    !process.env.RAZORPAY_KEY_ID
  );
}

export function isMockPayment(payment: { provider?: string; metadata?: Record<string, unknown> | null }) {
  return payment.provider === "mock" && payment.metadata?.source === "printsaathi-test-checkout-v1";
}

export function paymentCanPrint(payment: {
  provider?: string; status?: string; provider_payment_id?: string | null; metadata?: Record<string, unknown> | null;
}) {
  return payment.status === "verified" && Boolean(payment.provider_payment_id) &&
    (payment.provider === "razorpay" || payment.provider === "counter" || (mockPaymentsEnabled() && isMockPayment(payment)));
}
