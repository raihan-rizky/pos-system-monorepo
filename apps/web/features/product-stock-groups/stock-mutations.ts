import type { Prisma } from "@pos/db";

import { calculateBaseQuantity, resolveProductDisplayStock } from "./stock-display";
import {
  lockStockMutationRows,
  StockMutationConflictError,
} from "./stock-group-lock";

type Tx = Prisma.TransactionClient;

export class StockMutationError extends Error {
  constructor(
    message:
      | "PRODUCT_NOT_FOUND"
      | "INSUFFICIENT_STOCK"
      | "CONVERSION_NEEDS_REVIEW",
    public readonly details: {
      productId: string;
      available?: number;
      requested?: number;
    },
  ) {
    super(message);
  }
}

export interface StockMutationResult {
  productId: string;
  stockGroupId: string | null;
  beforeStock: number;
  afterStock: number;
  baseDelta: number;
}

interface ProductStockState {
  id: string;
  stock: number;
  stockGroupId: string | null;
  unitMultiplierToBase: number | null;
  conversionNeedsReview: boolean;
  stockGroup: { id: string; baseStock: number } | null;
}

const productStockSelect = {
  id: true,
  stock: true,
  stockGroupId: true,
  unitMultiplierToBase: true,
  conversionNeedsReview: true,
  stockGroup: { select: { id: true, baseStock: true } },
} as const;

async function loadProductStockState(
  tx: Tx,
  input: {
    storeId: string;
    productId: string;
  },
): Promise<ProductStockState | null> {
  if (typeof tx.product.findFirst === "function") {
    return tx.product.findFirst({
      where: { id: input.productId, storeId: input.storeId },
      select: productStockSelect,
    });
  }
  if (typeof tx.product.findUnique === "function") {
    return tx.product.findUnique({
      where: { id: input.productId },
      select: productStockSelect,
    });
  }
  return null;
}

async function loadProductStockStates(
  tx: Tx,
  input: {
    storeId: string;
    productIds: ReadonlyArray<string>;
  },
): Promise<ProductStockState[]> {
  if (typeof tx.product.findMany === "function") {
    return tx.product.findMany({
      where: {
        id: { in: [...input.productIds] },
        storeId: input.storeId,
      },
      select: productStockSelect,
    });
  }

  const products: ProductStockState[] = [];
  for (const productId of input.productIds) {
    const product = await loadProductStockState(tx, {
      storeId: input.storeId,
      productId,
    });
    if (product) products.push(product);
  }
  return products;
}

function assertMembershipUnchanged(
  hint: ProductStockState,
  current: ProductStockState,
) {
  if (
    hint.id !== current.id ||
    hint.stockGroupId !== current.stockGroupId ||
    (current.stockGroupId !== null &&
      current.stockGroup?.id !== current.stockGroupId)
  ) {
    throw new StockMutationConflictError(
      "Keanggotaan grup stok produk berubah saat diproses",
    );
  }
}

async function lockAndReloadProductStockState(
  tx: Tx,
  input: {
    storeId: string;
    productId: string;
  },
) {
  const hint = await loadProductStockState(tx, input);

  if (!hint) {
    throw new StockMutationError("PRODUCT_NOT_FOUND", {
      productId: input.productId,
    });
  }

  const locks = await lockStockMutationRows(tx, {
    storeId: input.storeId,
    stockGroupIds: hint.stockGroupId ? [hint.stockGroupId] : [],
    productIds: [hint.id],
  });
  if (
    !locks.lockedProductIds.includes(hint.id) ||
    (hint.stockGroupId !== null &&
      !locks.lockedStockGroupIds.includes(hint.stockGroupId))
  ) {
    throw new StockMutationConflictError(
      "Produk atau grup stok tidak lagi tersedia saat diproses",
    );
  }

  const current = await loadProductStockState(tx, input);
  if (!current) {
    throw new StockMutationConflictError(
      "Produk tidak lagi tersedia saat diproses",
    );
  }
  assertMembershipUnchanged(hint, current);
  return current;
}

async function applyLockedProductStockDelta(
  tx: Tx,
  input: {
    storeId: string;
    delta: number;
    allowNegative?: boolean;
    product: ProductStockState;
  },
): Promise<StockMutationResult> {
  const product = input.product;
  const productId = product.id;
  const beforeStock = resolveProductDisplayStock(product);

  if (!product.stockGroupId || !product.stockGroup) {
    const afterStock = product.stock + input.delta;
    if (!input.allowNegative && afterStock < 0) {
      throw new StockMutationError("INSUFFICIENT_STOCK", {
        productId: product.id,
        available: product.stock,
        requested: Math.abs(input.delta),
      });
    }

    if (typeof tx.product.updateMany === "function") {
      const updateResult = await tx.product.updateMany({
        where: {
          id: productId,
          storeId: input.storeId,
          ...(!input.allowNegative && input.delta < 0
            ? { stock: { gte: Math.abs(input.delta) } }
            : {}),
        },
        data: { stock: { increment: input.delta } },
      });
      if (updateResult.count !== 1) {
        throw new StockMutationError("INSUFFICIENT_STOCK", {
          productId,
          available: product.stock,
          requested: Math.abs(input.delta),
        });
      }
    } else {
      await tx.product.update({
        where: { id: productId },
        data: { stock: afterStock },
      });
    }

    return {
      productId,
      stockGroupId: null,
      beforeStock,
      afterStock,
      baseDelta: input.delta,
    };
  }

  if (product.conversionNeedsReview) {
    throw new StockMutationError("CONVERSION_NEEDS_REVIEW", {
      productId: product.id,
    });
  }

  const baseDelta = calculateBaseQuantity(
    input.delta,
    product.unitMultiplierToBase,
  );
  const afterBaseStock = product.stockGroup.baseStock + baseDelta;
  if (!input.allowNegative && afterBaseStock < 0) {
    throw new StockMutationError("INSUFFICIENT_STOCK", {
      productId: product.id,
      available: beforeStock,
      requested: Math.abs(input.delta),
    });
  }

  const updateResult = await tx.productStockGroup.updateMany({
    where: {
      id: product.stockGroupId,
      storeId: input.storeId,
      ...(!input.allowNegative && baseDelta < 0
        ? { baseStock: { gte: Math.abs(baseDelta) } }
        : {}),
    },
    data: { baseStock: { increment: baseDelta } },
  });
  if (updateResult.count !== 1) {
    throw new StockMutationError("INSUFFICIENT_STOCK", {
      productId: product.id,
      available: beforeStock,
      requested: Math.abs(input.delta),
    });
  }

  return {
    productId: product.id,
    stockGroupId: product.stockGroupId,
    beforeStock,
    afterStock: beforeStock + input.delta,
    baseDelta,
  };
}

export async function applyProductStockDelta(
  tx: Tx,
  input: {
    storeId: string;
    productId: string;
    delta: number;
    allowNegative?: boolean;
    currentStock?: number;
    productInfo?: ProductStockState;
  },
): Promise<StockMutationResult> {
  const product =
    input.productInfo ??
    (await lockAndReloadProductStockState(tx, {
      storeId: input.storeId,
      productId: input.productId,
    }));

  return applyLockedProductStockDelta(tx, {
    storeId: input.storeId,
    delta: input.delta,
    allowNegative: input.allowNegative,
    product,
  });
}

export async function setProductDisplayStock(
  tx: Tx,
  input: {
    storeId: string;
    productId: string;
    stock: number;
    allowNegative?: boolean;
    currentStock?: number;
  },
) {
  const product = await lockAndReloadProductStockState(tx, {
    storeId: input.storeId,
    productId: input.productId,
  });
  return applyLockedProductStockDelta(tx, {
    storeId: input.storeId,
    product,
    delta: input.stock - resolveProductDisplayStock(product),
    allowNegative: input.allowNegative,
  });
}

export async function applyProductStockDeltas(
  tx: Tx,
  input: {
    storeId: string;
    items: ReadonlyArray<{ productId: string; delta: number }>;
    allowNegative?: boolean;
  },
) {
  const merged = new Map<string, number>();
  for (const item of input.items) {
    if (!item.productId || !Number.isFinite(item.delta) || item.delta === 0) {
      continue;
    }
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.delta);
  }

  const entries = Array.from(merged.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) return [];

  const productIds = entries.map(([productId]) => productId);
  const hints = await loadProductStockStates(tx, {
    storeId: input.storeId,
    productIds,
  });
  const hintById = new Map(hints.map((product) => [product.id, product]));
  const missingProductId = productIds.find(
    (productId) => !hintById.has(productId),
  );
  if (missingProductId) {
    throw new StockMutationError("PRODUCT_NOT_FOUND", {
      productId: missingProductId,
    });
  }

  const stockGroupIds = hints
    .map((product) => product.stockGroupId)
    .filter((stockGroupId): stockGroupId is string => Boolean(stockGroupId));
  const locks = await lockStockMutationRows(tx, {
    storeId: input.storeId,
    stockGroupIds,
    productIds,
  });
  if (
    locks.lockedProductIds.length !== productIds.length ||
    locks.lockedStockGroupIds.length !== new Set(stockGroupIds).size
  ) {
    throw new StockMutationConflictError(
      "Produk atau grup stok berubah saat transaksi diproses",
    );
  }

  const currentProducts = await loadProductStockStates(tx, {
    storeId: input.storeId,
    productIds,
  });
  const currentById = new Map(
    currentProducts.map((product) => [product.id, product]),
  );
  for (const productId of productIds) {
    const hint = hintById.get(productId);
    const current = currentById.get(productId);
    if (!hint || !current) {
      throw new StockMutationConflictError(
        "Produk berubah saat transaksi diproses",
      );
    }
    assertMembershipUnchanged(hint, current);
  }

  const results: StockMutationResult[] = [];
  const currentBaseStockByGroupId = new Map<string, number>();
  for (const [productId, delta] of entries) {
    const current = currentById.get(productId);
    if (!current) {
      throw new StockMutationConflictError(
        "Produk berubah saat transaksi diproses",
      );
    }
    const stockGroup = current.stockGroup;
    const product =
      current.stockGroupId && stockGroup
        ? {
            ...current,
            stockGroup: {
              ...stockGroup,
              baseStock:
                currentBaseStockByGroupId.get(current.stockGroupId) ??
                stockGroup.baseStock,
            },
          }
        : current;
    const result = await applyLockedProductStockDelta(tx, {
      storeId: input.storeId,
      product,
      delta,
      allowNegative: input.allowNegative,
    });
    results.push(result);
    if (result.stockGroupId) {
      const beforeBaseStock = product.stockGroup?.baseStock ?? 0;
      currentBaseStockByGroupId.set(
        result.stockGroupId,
        beforeBaseStock + result.baseDelta,
      );
    }
  }

  return results;
}
