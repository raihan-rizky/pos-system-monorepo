import type { InventoryLogRow } from "@/features/pos-checkout/post-commit";

export interface TransactionStockMovement {
  productId: string;
  stockGroupId: string | null;
  baseDelta: number;
}

export type TransactionStockJournalRow = InventoryLogRow & {
  transactionId: string;
  sourceTransactionRef: string;
  stockGroupIdSnapshot: string | null;
  unitMultiplierSnapshot: number;
  stockBaseDelta: number;
};

export function buildTransactionStockJournal(input: {
  transactionId: string;
  inventoryRows: readonly InventoryLogRow[];
  stockMovements: readonly TransactionStockMovement[];
}): TransactionStockJournalRow[] {
  const movementsByProductId = new Map<string, TransactionStockMovement>();
  for (const movement of input.stockMovements) {
    if (
      !movement.productId ||
      !Number.isFinite(movement.baseDelta) ||
      movement.baseDelta > 0 ||
      movementsByProductId.has(movement.productId)
    ) {
      throw new Error("Bukti perubahan stok tidak lengkap.");
    }
    movementsByProductId.set(movement.productId, movement);
  }

  const totalQuantityByProductId = new Map<string, number>();
  for (const row of input.inventoryRows) {
    if (!row.productId || !Number.isFinite(row.quantity) || row.quantity <= 0) {
      throw new Error("Bukti perubahan stok tidak lengkap.");
    }
    totalQuantityByProductId.set(
      row.productId,
      (totalQuantityByProductId.get(row.productId) ?? 0) + row.quantity,
    );
  }

  return input.inventoryRows.map((row) => {
    const movement = movementsByProductId.get(row.productId);
    const totalQuantity = totalQuantityByProductId.get(row.productId);
    if (
      !movement ||
      totalQuantity == null ||
      totalQuantity <= 0 ||
      movement.baseDelta >= 0
    ) {
      throw new Error("Bukti perubahan stok tidak lengkap.");
    }

    return {
      ...row,
      transactionId: input.transactionId,
      sourceTransactionRef: input.transactionId,
      stockGroupIdSnapshot: movement.stockGroupId,
      unitMultiplierSnapshot: movement.stockGroupId
        ? Math.abs(movement.baseDelta) / totalQuantity
        : 1,
      stockBaseDelta: movement.baseDelta * (row.quantity / totalQuantity),
    };
  });
}
