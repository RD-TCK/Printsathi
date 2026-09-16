export function capturedPaymentMatches(
  payment: { order_id?: unknown; amount?: unknown; currency?: unknown; status?: unknown },
  expected: { providerOrderId: string; amountPaise: number; currency: string },
): boolean {
  return payment.status === "captured" && payment.order_id === expected.providerOrderId &&
    Number(payment.amount) === expected.amountPaise && payment.currency === expected.currency;
}
