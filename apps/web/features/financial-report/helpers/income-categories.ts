export type IncomeCategory = "ATK" | "Percetakan" | "Belum ditentukan";
export type IncomeItem = {
  subtotal: unknown;
  printingServiceId?: string | null;
  product?: {
    category?: { name?: string | null } | null;
    catalogSubcategory?: { group: "ATK" | "PERCETAKAN"; name: string } | null;
  } | null;
};
export type IncomeClassificationInput = {
  transactionCategory?: string | null;
  printingSubcategory?: string | null;
  printingReceipt?: { subcategory?: string | null } | null;
  items: IncomeItem[];
};
export type IncomeSubcategoryRow = { category: IncomeCategory; subcategory: string; amount: number };

const printingLabels: Record<string, string> = { SPANDUK: "Spanduk", PERCETAKAN: "Cetak", CETAK: "Cetak", PLAT: "Plat", STEMPEL: "Stempel", PRINT: "Print" };

export function incomeClassification(input: IncomeClassificationInput): { category: IncomeCategory; subcategory: string } {
  const printing = input.transactionCategory === "PERCETAKAN" || Boolean(input.printingReceipt) ||
    (!input.transactionCategory && Boolean(input.printingSubcategory)) || input.items.some(item => Boolean(item.printingServiceId));
  return printing
    ? { category: "Percetakan", subcategory: printingLabels[input.printingSubcategory || input.printingReceipt?.subcategory || ""] || "Belum ditentukan" }
    : { category: input.transactionCategory === "ATK" ? "ATK" : "Belum ditentukan", subcategory: "Belum ditentukan" };
}

export function incomeItemClassification(
  input: IncomeClassificationInput,
  item: IncomeItem,
  hasServiceLine = input.items.some(row => Boolean(row.printingServiceId) || (!row.product && Boolean(input.printingReceipt))),
  fallback = incomeClassification(input),
): Omit<IncomeSubcategoryRow, "amount"> {
  if (item.printingServiceId) return incomeClassification({ ...input, transactionCategory: "PERCETAKAN" });
  const catalog = item.product?.catalogSubcategory;
  if (catalog) return { category: catalog.group === "ATK" ? "ATK" : "Percetakan", subcategory: catalog.name.trim() || "Belum ditentukan" };
  const legacyCategory = item.product?.category?.name?.trim();
  if (legacyCategory && (hasServiceLine || fallback.category !== "Percetakan")) return { category: "ATK", subcategory: legacyCategory };
  if (item.product && hasServiceLine && !legacyCategory) return { category: "Belum ditentukan", subcategory: "Belum ditentukan" };
  return fallback;
}

export type IncomeItemAllocation = IncomeSubcategoryRow & { itemIndex: number | null };

function prepareIncomeItems(input: IncomeClassificationInput) {
  const hasServiceLine = input.items.some(row => Boolean(row.printingServiceId) || (!row.product && Boolean(input.printingReceipt)));
  const fallback = incomeClassification(input);
  const rows = input.items.map((item, itemIndex) => {
    const numeric = Number(item.subtotal);
    return { ...incomeItemClassification(input, item, hasServiceLine, fallback), itemIndex, weight: Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 100) : 0 };
  }).filter(row => row.weight > 0).sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory) || a.itemIndex - b.itemIndex);
  if (rows.some(row => !Number.isSafeInteger(row.weight))) throw new RangeError("Nominal laporan melampaui kapasitas nilai uang.");
  const weights = rows.map((row, index) => ({ ...row, weight: BigInt(row.weight), index }));
  return { fallback, weights, sum: weights.reduce((value, row) => value + row.weight, 0n) };
}

function allocatePreparedIncomeItems(amount: number, prepared: ReturnType<typeof prepareIncomeItems>): IncomeItemAllocation[] {
  const total = Math.round(amount * 100);
  if (!Number.isSafeInteger(total)) throw new RangeError("Nominal laporan melampaui kapasitas nilai uang.");
  if (!prepared.weights.length) return [{ ...prepared.fallback, amount, itemIndex: null }];
  const sign = total < 0 ? -1 : 1;
  const absoluteTotal = BigInt(Math.abs(total));
  const rows = prepared.weights.map(row => ({ ...row, cents: absoluteTotal * row.weight / prepared.sum }));

  // Jefferson always satisfies lower quota. Starting there leaves fewer than
  // one remaining cent per item, even for very large transaction values.
  let remaining = Number(absoluteTotal - rows.reduce((value, row) => value + row.cents, 0n));
  const heap = [...rows];
  const higherPriority = (a: typeof rows[number], b: typeof rows[number]) => {
    const left = a.weight * (b.cents + 1n);
    const right = b.weight * (a.cents + 1n);
    return left > right || (left === right && a.index < b.index);
  };
  const siftDown = (start: number) => {
    let parent = start;
    while (true) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let best = parent;
      if (left < heap.length && higherPriority(heap[left], heap[best])) best = left;
      if (right < heap.length && higherPriority(heap[right], heap[best])) best = right;
      if (best === parent) break;
      [heap[parent], heap[best]] = [heap[best], heap[parent]];
      parent = best;
    }
  };
  for (let index = Math.floor(heap.length / 2) - 1; index >= 0; index--) siftDown(index);
  while (remaining-- > 0) {
    heap[0].cents += 1n;
    siftDown(0);
  }
  return rows.map(row => ({ category: row.category, subcategory: row.subcategory, amount: sign * Number(row.cents) / 100, itemIndex: row.itemIndex }));
}

/** Allocate cents with highest averages, so an item's cumulative share never decreases. */
export function allocateIncomeItems(amount: number, input: IncomeClassificationInput): IncomeItemAllocation[] {
  return allocatePreparedIncomeItems(amount, prepareIncomeItems(input));
}

export function groupIncomeAllocations(allocations: readonly IncomeSubcategoryRow[]): IncomeSubcategoryRow[] {
  const groups = new Map<string, IncomeSubcategoryRow>();
  for (const row of allocations) {
    const key = JSON.stringify([row.category, row.subcategory]);
    const previous = groups.get(key);
    groups.set(key, { category: row.category, subcategory: row.subcategory, amount: (Math.round((previous?.amount ?? 0) * 100) + Math.round(row.amount * 100)) / 100 });
  }
  return [...groups.values()];
}

export function allocateIncomeSubcategories(amount: number, input: IncomeClassificationInput): IncomeSubcategoryRow[] {
  return groupIncomeAllocations(allocateIncomeItems(amount, input));
}

/** Allocate the complete retained ledger before any report filters its dates. */
export function allocateIncomePaymentItems<T extends { id: string; method: string; amount: number; createdAt: Date }>(
  payments: readonly T[], input: IncomeClassificationInput,
): Array<T & { allocations: IncomeItemAllocation[] }> {
  const ordered = payments.filter(row => row.method !== "TEMPO" && row.amount > 0)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  if (!ordered.length) return [];
  const prepared = prepareIncomeItems(input);
  let cumulativeCents = 0;
  const previous = new Map<number | null, number>();
  return ordered.map(row => {
    cumulativeCents += Math.round(row.amount * 100);
    if (!Number.isSafeInteger(cumulativeCents)) throw new RangeError("Nominal laporan melampaui kapasitas nilai uang.");
    const allocations = allocatePreparedIncomeItems(cumulativeCents / 100, prepared).map(part => {
      const current = Math.round(part.amount * 100);
      const allocated = current - (previous.get(part.itemIndex) ?? 0);
      previous.set(part.itemIndex, current);
      return { ...part, amount: allocated / 100 };
    });
    return { ...row, allocations };
  });
}
