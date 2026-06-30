export interface ReceiptPaymentSource {
  total?: number | string | null;
  amountPaid?: number | string | null;
  paymentMethod?: string | null;
  status?: string | null;
  payments?: Array<{
    method?: string | null;
    amount?: number | string | null;
  }> | null;
  debtPaymentLogs?: Array<{
    id?: string | null;
    createdAt?: string | null;
    paymentMethod?: string | null;
    amount?: number | string | null;
  }> | null;
}

export interface ReceiptPaymentLine {
  label: string;
  amount: number;
  amountFormatted: string;
  subLabel?: string;
}

function toNumber(value: number | string | null | undefined): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizePaymentLabel(method: string | null | undefined): string {
  if (method === "CASH") return "TUNAI";
  return method ?? "UNKNOWN";
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("id-ID");
}

export function getReceiptPrintStatus(
  transaction: ReceiptPaymentSource | null | undefined,
): string | undefined {
  if (!transaction) return undefined;
  const amountPaid = toNumber(transaction.amountPaid);
  const total = toNumber(transaction.total);

  if (transaction.status === "PENDING_APPROVAL" && amountPaid > 0) {
    return amountPaid < total ? "DP" : "COMPLETED";
  }

  return transaction.status ?? undefined;
}

function getInitialPayments(transaction: ReceiptPaymentSource) {
  const declaredPayments = (transaction.payments ?? [])
    .map((payment) => ({
      label: normalizePaymentLabel(payment.method),
      amount: toNumber(payment.amount),
    }))
    .filter((payment) => payment.amount > 0);

  if (declaredPayments.length > 0) return declaredPayments;

  const fallbackAmount = toNumber(transaction.amountPaid);
  if (fallbackAmount <= 0) return [];

  return [
    {
      label: normalizePaymentLabel(transaction.paymentMethod),
      amount: fallbackAmount,
    },
  ];
}

function takePaymentAmounts(
  payments: Array<{ label: string; amount: number }>,
  limit: number,
): Array<{ label: string; amount: number }> {
  const selected: Array<{ label: string; amount: number }> = [];
  let remaining = Math.max(0, limit);

  for (const payment of payments) {
    if (remaining <= 0) break;
    const amount = Math.min(payment.amount, remaining);
    if (amount > 0) {
      selected.push({ label: payment.label, amount });
      remaining -= amount;
    }
  }

  return selected;
}

export function buildReceiptPaymentLines(
  transaction: ReceiptPaymentSource | null | undefined,
  printStatus = getReceiptPrintStatus(transaction),
): ReceiptPaymentLine[] {
  if (!transaction) return [];

  const amountPaid = toNumber(transaction.amountPaid);
  const total = toNumber(transaction.total);
  const initialPayments = getInitialPayments(transaction);
  const debtPaymentLines = (transaction.debtPaymentLogs ?? [])
    .map((payment) => ({
      label: normalizePaymentLabel(payment.paymentMethod),
      amount: toNumber(payment.amount),
      amountFormatted: formatAmount(toNumber(payment.amount)),
      subLabel: "pelunasan",
    }))
    .filter((payment) => payment.amount > 0);

  const debtPaymentTotal = debtPaymentLines.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );
  const hasDebtPayments = debtPaymentLines.length > 0;
  const initialTotal = initialPayments.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );

  const initialLimit = hasDebtPayments
    ? Math.max(0, Math.min(total || amountPaid, amountPaid) - debtPaymentTotal)
    : initialTotal;

  const initialLines = takePaymentAmounts(initialPayments, initialLimit).map(
    (payment) => ({
      label: payment.label,
      amount: payment.amount,
      amountFormatted: formatAmount(payment.amount),
      subLabel: printStatus === "DP" || hasDebtPayments ? "DP" : undefined,
    }),
  );

  return [...initialLines, ...debtPaymentLines];
}
