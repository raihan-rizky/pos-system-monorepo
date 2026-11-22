export function combineSalesAndManualReceivableIncome(
  days: Array<{ date: string; total: number }>,
) {
  const totals = new Map<string, number>();
  const add = (date: string, cents: number) => totals.set(date, (totals.get(date) ?? 0) + cents);
  for (const day of days) if (day.total !== 0) add(day.date, Math.round(day.total * 100));
  const daily = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, cents]) => ({ date, total: cents / 100 }));
  const total = [...totals.values()].reduce((sum, cents) => sum + cents, 0) / 100;
  return { total, daily };
}
