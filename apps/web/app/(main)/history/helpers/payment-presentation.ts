export interface HistoryPaymentEntry {
  method: string;
  amount: number;
}

export interface HistoryPaymentSource {
  paymentMethod: string;
  amountPaid: number;
  payments?: Array<{ method: string; amount: number }>;
}

const historyPaymentFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

export function formatHistoryPaymentAmount(
  amount: number | string | null | undefined,
): string {
  const numericAmount = Number(amount);
  return `Rp ${historyPaymentFormatter.format(Number.isFinite(numericAmount) ? numericAmount : 0)}`;
}

export function getHistoryPaymentEntries(
  transaction: HistoryPaymentSource,
): HistoryPaymentEntry[] {
  if (transaction.payments && transaction.payments.length > 0) {
    return transaction.payments.map((payment) => ({
      method: payment.method,
      amount: Number(payment.amount),
    }));
  }

  return [{
    method: transaction.paymentMethod,
    amount: Number(transaction.amountPaid),
  }];
}
