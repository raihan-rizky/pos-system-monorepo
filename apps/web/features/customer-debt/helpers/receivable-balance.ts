export type ReceivableBalanceInput = {
  transactions: Array<{
    status: string;
    paymentMethod: string;
    total: unknown;
    amountPaid: unknown;
  }>;
  manualReceivables: Array<{ amount: unknown; amountPaid: unknown }>;
};

function toCents(value: unknown): number {
  let numeric: number;
  try {
    numeric = typeof value === "number" ? value : Number(value ?? 0);
  } catch {
    return 0;
  }
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function remainingCents(amount: unknown, amountPaid: unknown): number {
  const total = Math.max(0, toCents(amount));
  const paid = Math.min(total, Math.max(0, toCents(amountPaid)));
  return total - paid;
}

export function calculateReceivableBalance(input: ReceivableBalanceInput): number {
  let balanceCents = 0;

  for (const transaction of input.transactions) {
    if (transaction.status !== "COMPLETED" || transaction.paymentMethod !== "TEMPO") continue;
    balanceCents += remainingCents(transaction.total, transaction.amountPaid);
  }

  for (const receivable of input.manualReceivables) {
    balanceCents += remainingCents(receivable.amount, receivable.amountPaid);
  }

  return balanceCents / 100;
}
