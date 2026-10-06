export interface PaymentPresentationInput {
  status: string;
  paymentMethod: string;
  total: number;
  amountPaid: number;
}

export interface PaymentPresentation {
  badge: string | null;
  remaining: number;
  settled: boolean;
}

export function getPaymentPresentation(
  input: PaymentPresentationInput,
): PaymentPresentation {
  const active = input.status === "COMPLETED" || input.status === "DP";
  const isTempo = input.paymentMethod === "TEMPO";
  const hasValidAmounts =
    Number.isFinite(input.total) &&
    input.total >= 0 &&
    Number.isFinite(input.amountPaid) &&
    input.amountPaid >= 0;
  const remaining =
    active && hasValidAmounts && (isTempo || input.status === "DP")
      ? Math.max(0, input.total - input.amountPaid)
      : 0;

  return {
    badge: !active ? null : isTempo ? "TEMPO/TAGIHAN" : input.status === "DP" ? "DP" : null,
    remaining,
    settled: active && hasValidAmounts && remaining === 0,
  };
}
