const receivableFields = new Set([
  "totalDebt", "totalDebtOutstanding", "debtCollectedInPeriod", "debtAmount", "debtOutstanding",
  "debtRemaining", "debtPaidInPeriod", "debtUnpaidInPeriod", "debtPaidOffInPeriod",
  "runningDebtRemaining", "averagePaymentDays", "debtPaidOffAmount", "debtUnpaidAmount",
  "dpTransactionCount", "dpPaidOffCount",
]);

/** Remove receivable metrics from customer recap responses without fabricating zero balances. */
export function redactReceivableMetrics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactReceivableMetrics);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !receivableFields.has(key))
      .map(([key, item]) => [key, redactReceivableMetrics(item)]),
  );
}
