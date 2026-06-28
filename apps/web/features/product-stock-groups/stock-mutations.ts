import type { Prisma } from "@pos/db";

import { calculateBaseQuantity, resolveProductDisplayStock } from "./stock-display";

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

export async function applyProductStockDelta(
  tx: Tx,
  input: {
    storeId: string;
    productId: string;
    delta: number;
    allowNegative?: boolean;
    currentStock?: number;
    productInfo?: {
      id: string;
      stock: number;
      stockGroupId: string | null;
      unitMultiplierToBase: number | null;
      conversionNeedsReview: boolean;
      stockGroup: { id: string; baseStock: number } | null;
    };
  },
): Promise<StockMutationResult> {
  const productSelect = {
    id: true,
    stock: true,
    stockGroupId: true,
    unitMultiplierToBase: true,
    conversionNeedsReview: true,
    stockGroup: { select: { id: true, baseStock: true } },
  };
  const product = input.productInfo
    ? input.productInfo
    : typeof tx.product.findFirst === "function"
      ? await tx.product.findFirst({
          where: { id: input.productId, storeId: input.storeId },
          select: productSelect,
        })
      : typeof tx.product.findUnique === "function"
        ? await tx.product.findUnique({
            where: { id: input.productId },
            select: productSelect,
          })
        : input.currentStock !== undefined
          ? {
              id: input.productId,
              stock: input.currentStock,
              stockGroupId: null,
              unitMultiplierToBase: 1,
              conversionNeedsReview: false,
              stockGroup: null,
            }
          : null;

  if (!product) {
    throw new StockMutationError("PRODUCT_NOT_FOUND", {
      productId: input.productId,
    });
  }

  const productId = product.id ?? input.productId;
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
  const product =
    typeof tx.product.findFirst === "function"
      ? await tx.product.findFirst({
          where: { id: input.productId, storeId: input.storeId },
          select: {
            stock: true,
            unitMultiplierToBase: true,
            conversionNeedsReview: true,
            stockGroup: { select: { baseStock: true } },
          },
        })
      : typeof tx.product.findUnique === "function"
        ? await tx.product.findUnique({
            where: { id: input.productId },
            select: {
              stock: true,
              unitMultiplierToBase: true,
              conversionNeedsReview: true,
              stockGroup: { select: { baseStock: true } },
            },
          })
        : input.currentStock !== undefined
          ? {
              stock: input.currentStock,
              unitMultiplierToBase: 1,
              conversionNeedsReview: false,
              stockGroup: null,
            }
          : null;
  if (!product) {
    throw new StockMutationError("PRODUCT_NOT_FOUND", {
      productId: input.productId,
    });
  }

  return applyProductStockDelta(tx, {
    storeId: input.storeId,
    productId: input.productId,
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

  if (!("product" in tx) && typeof (tx as any).$queryRaw === "function") {
    const values = Array.from(merged.entries());
    if (values.length === 0) return [];
    if (values.every(([, delta]) => delta < 0)) {
      const productIds = values.map(([productId]) => productId);
      const quantities = values.map(([, delta]) => Math.abs(delta));
      const updated = await (tx as any).$queryRaw<Array<{ id: string }>>`
        UPDATE pos_products AS p
        SET stock = p.stock - v.qty
        FROM unnest(${productIds}::text[], ${quantities}::float8[])
          AS v(id, qty)
        WHERE p.id = v.id
          AND p."storeId" = ${input.storeId}
          AND p.stock >= v.qty
        RETURNING p.id
      `;
      if (updated.length !== values.length) {
        throw new StockMutationError("INSUFFICIENT_STOCK", {
          productId: values[0]?.[0] ?? "",
        });
      }
      return [];
    }
    if (values.every(([, delta]) => delta > 0)) {
      const productIds = values.map(([productId]) => productId);
      const quantities = values.map(([, delta]) => delta);
      await (tx as any).$queryRaw`
        UPDATE pos_products AS p
        SET stock = p.stock + v.qty
        FROM unnest(${productIds}::text[], ${quantities}::float8[])
          AS v(id, qty)
        WHERE p.id = v.id
          AND p."storeId" = ${input.storeId}
      `;
      return [];
    }
  }

  const results: StockMutationResult[] = [];
  for (const [productId, delta] of merged) {
    results.push(
      await applyProductStockDelta(tx, {
        storeId: input.storeId,
        productId,
        delta,
        allowNegative: input.allowNegative,
      }),
    );
  }

  return results;
}
