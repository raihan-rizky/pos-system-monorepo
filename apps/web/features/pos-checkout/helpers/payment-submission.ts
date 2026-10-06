export type CheckoutPaymentMode = "PAID" | "DP" | "TEMPO";

export interface PaymentSubmissionInput {
  mode: CheckoutPaymentMode;
  selectedPaymentMethods: ReadonlyArray<string>;
  amountsPaid: Readonly<Record<string, number>>;
}

export function buildPaymentSubmission(input: PaymentSubmissionInput) {
  const payments = input.selectedPaymentMethods
    .map((method) => ({ method, amount: input.amountsPaid[method] || 0 }))
    .filter((payment) => payment.amount > 0);

  return {
    paymentMethod:
      input.mode === "TEMPO"
        ? "TEMPO"
        : input.selectedPaymentMethods[0] || "CASH",
    paymentStatus: input.mode === "DP" ? "DP" : "COMPLETED",
    amountPaid: payments.reduce((sum, payment) => sum + payment.amount, 0),
    payments,
  };
}

export interface CanSubmitPaymentInput {
  mode: CheckoutPaymentMode;
  amountPaid: number;
  total: number;
  hasCustomer: boolean;
  hasInvalidManualPrice: boolean;
}

export function canSubmitPayment(input: CanSubmitPaymentInput): boolean {
  if (
    !Number.isFinite(input.amountPaid) ||
    input.amountPaid < 0 ||
    !Number.isFinite(input.total) ||
    input.total <= 0 ||
    input.hasInvalidManualPrice
  ) {
    return false;
  }

  if (input.mode === "TEMPO") {
    return input.hasCustomer && input.amountPaid < input.total;
  }
  if (input.mode === "DP") {
    return input.amountPaid < input.total;
  }
  return input.amountPaid >= input.total;
}
