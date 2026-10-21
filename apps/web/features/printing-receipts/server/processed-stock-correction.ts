import type { Prisma } from "@pos/db";
import { applyProductStockDeltas } from "@/features/product-stock-groups/stock-mutations";
import { lockStockMutationRows, StockMutationConflictError } from "@/features/product-stock-groups/stock-group-lock";

interface StockIdentity {
  id: string;
  stockGroupId: string | null;
  unitMultiplierToBase: number | null;
  conversionNeedsReview: boolean;
}

export async function applyProcessedMaterialCorrections(tx: Prisma.TransactionClient, input: {
  storeId: string;
  products: readonly StockIdentity[];
  deltas: readonly { productId: string; delta: number }[];
}) {
  if (!input.deltas.length) return [];
  const productIds = [...new Set(input.deltas.map(row => row.productId))];
  const products = input.products.filter(row => productIds.includes(row.id));
  const stockGroupIds = [...new Set(products.flatMap(row => row.stockGroupId ? [row.stockGroupId] : []))];
  if (products.length !== productIds.length) throw new StockMutationConflictError();
  // Acquire the entire correction's locks in the normal group → product order
  // before either batch writes; subsequent stock-writer locks are reentrant.
  const locks = await lockStockMutationRows(tx, { storeId: input.storeId, stockGroupIds, productIds });
  if (locks.lockedProductIds.length !== productIds.length || locks.lockedStockGroupIds.length !== stockGroupIds.length) throw new StockMutationConflictError();
  const current = await tx.product.findMany({
    where: { id: { in: productIds }, storeId: input.storeId },
    select: { id: true, stockGroupId: true, unitMultiplierToBase: true, conversionNeedsReview: true },
  });
  for (const previous of products) {
    const product = current.find(row => row.id === previous.id);
    if (!product || product.stockGroupId !== previous.stockGroupId || product.unitMultiplierToBase !== previous.unitMultiplierToBase || product.conversionNeedsReview !== previous.conversionNeedsReview) throw new StockMutationConflictError();
  }
  // Returning consumed materials first permits an equal replacement from an
  // empty shared group. Both batches retain the stock writer's nonnegative guard.
  const returns = await applyProductStockDeltas(tx, { storeId: input.storeId, items: input.deltas.filter(row => row.delta > 0) });
  const usage = await applyProductStockDeltas(tx, { storeId: input.storeId, items: input.deltas.filter(row => row.delta < 0) });
  return [...returns, ...usage];
}
