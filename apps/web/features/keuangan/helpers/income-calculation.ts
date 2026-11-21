export type IncomeCalculation = {
  total: number;
  daily: Array<{ date: string; total: number; manualReceivable: number; supplierRefund?: number }>;
  components: { sales: number; manualIncome: number; manualReceivable: number } | null;
  supplierRefund?: number;
};

type IncomeCalculationPeriod = {
  days: Array<{ date: string; total: number }>;
  contributions?: Array<{
    id: string;
    date: string;
    source: "transaction" | "manual" | "manual-receivable" | "supplier-refund";
    amount: number;
  }>;
};

export function buildIncomeCalculation(
  period: IncomeCalculationPeriod,
): IncomeCalculation {
  const days = new Map<string, { total: number; manualReceivable: number }>();
  for (const row of period.days) {
    const day = days.get(row.date) ?? { total: 0, manualReceivable: 0 };
    day.total += Math.round(row.total * 100);
    days.set(row.date, day);
  }
  let receivableCents = period.contributions === undefined ? undefined : 0;
  const refundsByDate = new Map<string, number>();
  let refundCents = 0;
  for (const row of period.contributions ?? []) {
    const amount = Math.round(row.amount * 100);
    if (row.source === "supplier-refund") {
      refundsByDate.set(row.date, (refundsByDate.get(row.date) ?? 0) + amount);
      refundCents += amount;
      continue;
    }
    if (row.source !== "manual-receivable") continue;
    const day = days.get(row.date) ?? { total: 0, manualReceivable: 0 };
    day.manualReceivable += amount;
    days.set(row.date, day);
    receivableCents = (receivableCents ?? 0) + amount;
  }
  const daily = [...days.entries()].filter(([, day]) => day.total !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => {
      const refund = refundsByDate.get(date) ?? 0;
      return { date, total: day.total / 100, manualReceivable: day.manualReceivable / 100,
        ...(refund ? { supplierRefund: refund / 100 } : {}) };
    });
  const totalCents = daily.reduce((sum, row) => sum + Math.round(row.total * 100), 0);
  const sales = period.contributions?.filter(row => row.source === "transaction").reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  const manual = period.contributions?.filter(row => row.source === "manual").reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  const components = sales !== undefined && manual !== undefined && receivableCents !== undefined
    && sales + manual + receivableCents + refundCents === totalCents
    ? { sales: sales / 100, manualIncome: manual / 100, manualReceivable: receivableCents / 100 }
    : null;
  return { total: totalCents / 100, daily, components, ...(refundCents ? { supplierRefund: refundCents / 100 } : {}) };
}
