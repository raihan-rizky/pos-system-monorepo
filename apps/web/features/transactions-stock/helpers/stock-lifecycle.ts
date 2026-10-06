export interface StockLifecycleItem {
  productId: string | null;
  quantity: number;
  rawMaterialProductId?: string | null;
  rawMaterialQuantity?: number | null;
}

export interface StockJournalEntry {
  productId: string;
  stockGroupIdSnapshot: string | null;
  baseDelta: number | null;
}

export interface StockReturn {
  productId: string;
  stockGroupIdSnapshot: string | null;
  baseDelta: number;
}

export function collectStockItems(
  items: readonly StockLifecycleItem[],
): Array<{ productId: string; quantity: number }> {
  const quantities = new Map<string, number>();

  const add = (productId: string | null | undefined, quantity: number | null | undefined) => {
    if (!productId || quantity == null) return;
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new Error("Jumlah stok tidak valid.");
    }
    if (quantity === 0) return;

    const total = (quantities.get(productId) ?? 0) + quantity;
    if (!Number.isFinite(total)) throw new Error("Jumlah stok tidak valid.");
    quantities.set(productId, total);
  };

  for (const item of items) {
    add(item.productId, item.quantity);
    add(item.rawMaterialProductId, item.rawMaterialQuantity);
  }

  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

export function planOutstandingReturns(
  status: string,
  entries: readonly StockJournalEntry[],
  requiresProof: boolean,
): StockReturn[] {
  if (["DRAFT", "PENDING_APPROVAL"].includes(status)) return [];
  if (requiresProof && entries.length === 0) {
    throw new Error("Riwayat stok perlu diperiksa.");
  }

  const totals = new Map<string, StockReturn>();
  for (const row of entries) {
    if (
      typeof row.productId !== "string" ||
      row.productId.trim().length === 0 ||
      (row.stockGroupIdSnapshot !== null &&
        (typeof row.stockGroupIdSnapshot !== "string" ||
          row.stockGroupIdSnapshot.trim().length === 0)) ||
      row.baseDelta == null ||
      !Number.isFinite(row.baseDelta)
    ) {
      throw new Error("Riwayat stok perlu diperiksa.");
    }

    const key = JSON.stringify([row.productId, row.stockGroupIdSnapshot]);
    const total = totals.get(key) ?? {
      productId: row.productId,
      stockGroupIdSnapshot: row.stockGroupIdSnapshot,
      baseDelta: 0,
    };
    total.baseDelta -= row.baseDelta;
    if (!Number.isFinite(total.baseDelta)) {
      throw new Error("Riwayat stok perlu diperiksa.");
    }
    totals.set(key, total);
  }

  if ([...totals.values()].some(({ baseDelta }) => baseDelta < -1e-8)) {
    throw new Error("Riwayat stok perlu diperiksa.");
  }

  return [...totals.values()].filter(({ baseDelta }) => baseDelta > 1e-8);
}
