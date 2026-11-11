export function combineSalesAndManualReceivableIncome(
  days: Array<{ date: string; total: number }>,
  reportIncome: Array<{ id?: string; date: string; amounts: Record<string, number> }>,
) {
  const totals = new Map<string, number>();
  const add = (date: string, cents: number) => totals.set(date, (totals.get(date) ?? 0) + cents);
  for (const day of days) if (day.total !== 0) add(day.date, Math.round(day.total * 100));
  for (const row of reportIncome) {
    if (!row.id?.startsWith("manual:")) continue;
    const cents = Object.values(row.amounts).reduce((sum, amount) => sum + Math.round(amount * 100), 0);
    if (cents !== 0) add(row.date, cents);
  }
  const daily = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, cents]) => ({ date, total: cents / 100 }));
  const total = [...totals.values()].reduce((sum, cents) => sum + cents, 0) / 100;
  return { total, daily };
}
