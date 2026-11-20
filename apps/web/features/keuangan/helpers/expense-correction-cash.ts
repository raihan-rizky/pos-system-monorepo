type SettlementCashEntry = {
  kind: "REFUND" | "CREDIT" | "ENTRY_ERROR";
  amountCents: number;
  paidAt: string;
  receivedAt: string | null;
};

export type ExpenseCashDay = { date: string; total: number };

export function totalExpenseCash(rows: readonly Pick<ExpenseCashDay, "total">[]): number {
  return rows.reduce((sum, row) => sum + Math.round(row.total * 100), 0) / 100;
}

export function applyExpenseCashRows<T extends ExpenseCashDay>(
  rows: readonly T[],
  adjustments: readonly ExpenseCashDay[],
  makeDay: (date: string) => T,
): T[] {
  const days = new Map(rows.map(row => [row.date, row]));
  for (const { date, total } of adjustments) {
    const row = days.get(date) ?? makeDay(date);
    days.set(date, { ...row, total: (Math.round(row.total * 100) + Math.round(total * 100)) / 100 });
  }
  return [...days.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function buildExpenseCorrectionCash(
  settlements: readonly SettlementCashEntry[],
  month: string,
  through: string,
) {
  const outflow = new Map<string, number>();
  const refunds = new Map<string, number>();
  function add(group: Map<string, number>, date: string, amount: number) {
    if (date.startsWith(month) && date <= through) {
      group.set(date, (group.get(date) ?? 0) + amount);
    }
  }
  for (const settlement of settlements) {
    if (settlement.kind === "ENTRY_ERROR") continue;
    add(outflow, settlement.paidAt, settlement.amountCents);
    if (settlement.kind === "REFUND" && settlement.receivedAt) {
      add(refunds, settlement.receivedAt, settlement.amountCents);
    }
  }
  const daily = (group: Map<string, number>) => [...group.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, total]) => ({ date, total: total / 100 }));
  return { outflow: daily(outflow), refunds: daily(refunds) };
}
