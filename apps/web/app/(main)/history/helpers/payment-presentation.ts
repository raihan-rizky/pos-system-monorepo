export interface HistoryPaymentEntry {
  method: string;
  amount: number;
}

export interface HistoryPaymentSource {
  paymentMethod: string;
  amountPaid: number;
  payments?: Array<{ method: string; amount: number }>;
  debtPaymentLogs?: Array<{ paymentMethod: string; amount: number }>;
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
  const installments = (transaction.debtPaymentLogs ?? [])
    .map((payment) => ({
      method: payment.paymentMethod,
      amount: Number(payment.amount),
    }))
    .filter((payment) => payment.amount > 0);

  if (transaction.payments && transaction.payments.length > 0) {
    const initialPayments = transaction.payments.map((payment) => ({
      method: payment.method,
      amount: Number(payment.amount),
    }));
    return installments.length > 0
      ? [...initialPayments.filter((payment) => payment.amount > 0), ...installments]
      : initialPayments;
  }

  if (installments.length > 0) {
    // Older transactions may not have initial payment records. amountPaid
    // includes installments, so remove them before showing the initial amount.
    const paidCents = Math.round(Number(transaction.amountPaid) * 100);
    const installmentCents = installments.reduce(
      (total, payment) => total + Math.round(payment.amount * 100),
      0,
    );
    const initialAmount = Math.max(0, paidCents - installmentCents) / 100;
    return initialAmount > 0
      ? [{ method: transaction.paymentMethod, amount: initialAmount }, ...installments]
      : installments;
  }

  return [{
    method: transaction.paymentMethod,
    amount: Number(transaction.amountPaid),
  }];
}
