export type IncomeCategory = "ATK" | "Percetakan";
export type IncomeClassificationInput = {
  transactionCategory?: string | null;
  printingSubcategory?: string | null;
  printingReceipt?: { subcategory?: string | null } | null;
  items: Array<{ subtotal: unknown; printingServiceId?: string | null; product?: { category?: { name?: string | null } | null } | null }>;
};
export type IncomeSubcategoryRow = { category: IncomeCategory; subcategory: string; amount: number };

const printingLabels: Record<string, string> = { SPANDUK: "Spanduk", PERCETAKAN: "Cetak", CETAK: "Cetak", PLAT: "Plat", STEMPEL: "Stempel", PRINT: "Print" };

export function incomeClassification(input: IncomeClassificationInput): { category: IncomeCategory; subcategory: string } {
  const printing = input.transactionCategory === "PERCETAKAN" || Boolean(input.printingReceipt) || input.items.some(item => Boolean(item.printingServiceId));
  return printing
    ? { category: "Percetakan", subcategory: printingLabels[input.printingSubcategory || input.printingReceipt?.subcategory || ""] || "Belum ditentukan" }
    : { category: "ATK", subcategory: "Belum ditentukan" };
}

/** Integer cents and stable remainder ordering keep every breakdown reconciled. */
export function allocateIncomeSubcategories(amount: number, input: IncomeClassificationInput): IncomeSubcategoryRow[] {
  const classification = incomeClassification(input);
  if (classification.category === "Percetakan") return [{ ...classification, amount }];
  const weights = new Map<string, number>();
  for (const item of input.items) {
    const name = item.product?.category?.name?.trim() || "Belum ditentukan";
    const weight = Number(item.subtotal);
    if (Number.isFinite(weight) && weight > 0) weights.set(name, (weights.get(name) ?? 0) + Math.round(weight * 100));
  }
  const sum = [...weights.values()].reduce((total, value) => total + value, 0);
  if (!sum) return [{ ...classification, amount }];
  const total = Math.round(amount * 100);
  const sign = total < 0 ? -1 : 1;
  const rows = [...weights].sort(([a], [b]) => a.localeCompare(b)).map(([subcategory, weight], index) => {
    const exact = Math.abs(total) * weight / sum;
    return { subcategory, index, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = Math.abs(total) - rows.reduce((value, row) => value + row.cents, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining-- > 0) row.cents += 1;
  }
  return rows.map(row => ({ category: "ATK", subcategory: row.subcategory, amount: sign * row.cents / 100 }));
}
