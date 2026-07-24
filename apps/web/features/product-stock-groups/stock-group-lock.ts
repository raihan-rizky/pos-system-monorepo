import type { Prisma } from "@pos/db";

type StockGroupLockTransaction = Pick<
  Prisma.TransactionClient,
  "$queryRaw"
>;

export class StockMutationConflictError extends Error {
  readonly code = "STALE_STOCK_RELATION";

  constructor(message = "Relasi stok berubah saat diproses") {
    super(message);
    this.name = "StockMutationConflictError";
  }
}

export function isStockMutationConflict(error: unknown): boolean {
  if (error instanceof StockMutationConflictError) return true;
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === "P2034";
}

function sortedUniqueIds(ids: ReadonlyArray<string>): string[] {
  return Array.from(new Set(ids.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );
}

export async function lockProductStockGroupRow(
  tx: StockGroupLockTransaction,
  input: {
    storeId: string;
    stockGroupId: string;
  },
): Promise<boolean> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "pos_product_stock_groups"
    WHERE "id" = ${input.stockGroupId}
      AND "storeId" = ${input.storeId}
    FOR UPDATE
  `;
  return locked.length === 1;
}

export async function lockProductRow(
  tx: StockGroupLockTransaction,
  input: {
    storeId: string;
    productId: string;
  },
): Promise<boolean> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "pos_products"
    WHERE "id" = ${input.productId}
      AND "storeId" = ${input.storeId}
    FOR UPDATE
  `;
  return locked.length === 1;
}

export async function lockStockMutationRows(
  tx: StockGroupLockTransaction,
  input: {
    storeId: string;
    stockGroupIds: ReadonlyArray<string>;
    productIds: ReadonlyArray<string>;
  },
) {
  const stockGroupIds = sortedUniqueIds(input.stockGroupIds);
  const productIds = sortedUniqueIds(input.productIds);
  const lockedStockGroupIds: string[] = [];
  const lockedProductIds: string[] = [];

  for (const stockGroupId of stockGroupIds) {
    if (
      await lockProductStockGroupRow(tx, {
        storeId: input.storeId,
        stockGroupId,
      })
    ) {
      lockedStockGroupIds.push(stockGroupId);
    }
  }

  for (const productId of productIds) {
    if (
      await lockProductRow(tx, {
        storeId: input.storeId,
        productId,
      })
    ) {
      lockedProductIds.push(productId);
    }
  }

  return {
    stockGroupIds,
    productIds,
    lockedStockGroupIds,
    lockedProductIds,
  };
}
