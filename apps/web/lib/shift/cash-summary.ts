type Numeric = number | { toString(): string };

/** Net cash retained by the drawer, including the cash part of split tenders. */
export function cashReceived(transaction: {
  paymentMethod?: string;
  status: string;
  total: Numeric;
  amountPaid: Numeric;
  change?: Numeric;
  payments?: { method: string; amount: Numeric }[];
}) {
  if (transaction.payments?.length) {
    const cash = transaction.payments.reduce((sum, payment) =>
      sum + (payment.method === "CASH" ? Number(payment.amount) : 0), 0);
    return Math.max(0, cash - Number(transaction.change ?? 0));
  }
  // Older transactions have no payment rows; their primary method is the only evidence.
  if (transaction.paymentMethod && transaction.paymentMethod !== "CASH") return 0;
  return Number(transaction.status === "DP" ? transaction.amountPaid : transaction.total);
}
