/** Allocate retained initial receipts, returning change from cash first.
 * Keep each row's date/identity so a report can filter after allocation. */
export function netInitialPayments<T extends { method: string; amount: unknown }>(
  payments: T[],
  input: { total: unknown; amountPaid: unknown; change?: unknown },
): Array<Omit<T, "amount"> & { amount: number }> {
  const cents = (value: unknown) => {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
  };
  const rows = payments.map((row) => ({ ...row, amount: row.method === "TEMPO" ? 0 : cents(row.amount) }));
  const gross = rows.reduce((sum, row) => sum + row.amount, 0);
  const retained = Math.min(gross, cents(input.total), cents(input.amountPaid), Math.max(0, gross - cents(input.change)));
  let refund = gross - retained;
  // For legacy non-cash overpayments, use a deterministic largest-tender order.
  const order = rows.map((row, index) => ({ index, cash: row.method === "CASH", amount: row.amount }))
    .sort((a, b) => Number(b.cash) - Number(a.cash) || b.amount - a.amount || a.index - b.index);
  for (const { index } of order) {
    const returned = Math.min(refund, rows[index].amount);
    rows[index].amount -= returned;
    refund -= returned;
  }
  return rows.map((row) => ({ ...row, amount: row.amount / 100 }));
}
