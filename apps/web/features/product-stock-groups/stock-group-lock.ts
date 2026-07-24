import type { Prisma } from "@pos/db";

type StockGroupLockTransaction = Pick<
  Prisma.TransactionClient,
  "$queryRaw"
>;

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
