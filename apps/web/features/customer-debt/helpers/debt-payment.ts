export type DebtQuickAction = "half" | "full";

export function getTransactionDebtRemaining(input: {
  total: number;
  amountPaid: number;
}): number {
  return Math.max(0, Number(input.total) - Number(input.amountPaid));
}

export function getDebtQuickPaymentAmount(
  remaining: number,
  action: DebtQuickAction,
): number {
  const safeRemaining = Math.max(0, Number(remaining));

  if (action === "full") return safeRemaining;

  return Math.round(safeRemaining / 2);
}

export function isValidDebtPayment(input: {
  amount: number;
  remaining: number;
}): boolean {
  const amount = Number(input.amount);
  const remaining = Math.max(0, Number(input.remaining));

  return amount > 0 && amount <= remaining;
}
