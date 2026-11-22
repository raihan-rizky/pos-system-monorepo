export type ComparisonMethod = "CASH" | "TRANSFER" | "DEBIT" | "CREDIT" | "QRIS";
export type ComparisonAmount = { method: ComparisonMethod; amount: string };

const METHODS = new Set<ComparisonMethod>(["CASH", "TRANSFER", "DEBIT", "CREDIT", "QRIS"]);

export function parseComparisonAmounts(value: unknown): ComparisonAmount[] | null {
  if (!Array.isArray(value) || value.length > METHODS.size) return null;
  const seen = new Set<ComparisonMethod>();
  const result: ComparisonAmount[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.method !== "string" || typeof item.amount !== "string") return null;
    const method = item.method as ComparisonMethod;
    const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(item.amount);
    if (!METHODS.has(method) || seen.has(method) || !match) return null;
    seen.add(method);
    result.push({ method, amount: `${match[1].replace(/^0+(?=\d)/, "")}.${(match[2] ?? "").padEnd(2, "0")}` });
  }
  return result;
}

export function snapshotPaymentMethods(rows: Array<{ method: string; amount: number }>): Array<{ method: string; amount: string }> {
  return rows.map(({ method, amount }) => {
    const cents = Math.round(amount * 100);
    if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError("Nominal metode pembayaran tidak valid.");
    return { method, amount: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}` };
  }).sort((a, b) => a.method.localeCompare(b.method));
}
