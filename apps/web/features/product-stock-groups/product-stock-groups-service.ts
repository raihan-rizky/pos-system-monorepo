import type { Prisma } from "@pos/db";

import { calculateDisplayStock, normalizeUnitMultiplier } from "./stock-display";
import { normalizeStockGroupKey, type StockGroupKeyInput } from "./stock-grouping";

type Tx = Prisma.TransactionClient;

export interface EnsureStockGroupInput extends StockGroupKeyInput {
  storeId: string;
  displayName: string;
  baseUnit: string;
  baseStock: number;
}

export async function ensureProductStockGroup(
  tx: Tx,
  input: EnsureStockGroupInput,
) {
  const groupKey = normalizeStockGroupKey(input);
  if (!("productStockGroup" in tx) || !tx.productStockGroup) {
    return {
      group: {
        id: "__stock_group_unavailable__",
        storeId: input.storeId,
        groupKey,
        displayName: input.displayName,
        baseUnit: input.baseUnit,
        baseStock: input.baseStock,
      },
      created: true,
    };
  }
  const existing = await tx.productStockGroup.findUnique({
    where: { storeId_groupKey: { storeId: input.storeId, groupKey } },
  });

  if (existing) {
    return { group: existing, created: false };
  }

  const group = await tx.productStockGroup.create({
    data: {
      storeId: input.storeId,
      groupKey,
      displayName: input.displayName,
      baseUnit: input.baseUnit,
      baseStock: input.baseStock,
    },
  });

  return { group, created: true };
}

export function createProductStockGroupEnsurer(tx: Tx) {
  const cache = new Map<
    string,
    Awaited<ReturnType<typeof ensureProductStockGroup>>
  >();

  return async (input: EnsureStockGroupInput) => {
    const groupKey = normalizeStockGroupKey(input);
    const cacheKey = `${input.storeId}|${groupKey}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const ensured = await ensureProductStockGroup(tx, input);
    cache.set(cacheKey, ensured);
    return ensured;
  };
}

export function buildStockGroupCreateData(input: {
  unitMultiplierToBase?: number | null;
  stock?: number | null;
}) {
  const multiplier = normalizeUnitMultiplier(input.unitMultiplierToBase);
  return {
    multiplier,
    baseStock: Number(input.stock ?? 0) * multiplier,
  };
}

export function shouldMarkConversionForReview(input: {
  groupCreated: boolean;
  unitMultiplierProvided: boolean;
  unit: string;
  baseUnit: string;
}) {
  return (
    !input.groupCreated &&
    !input.unitMultiplierProvided &&
    input.unit.trim().toLowerCase() !== input.baseUnit.trim().toLowerCase()
  );
}

export function resolveGroupedStockUpdate(input: {
  requestedDisplayStock: number | undefined;
  multiplier: number;
}) {
  if (input.requestedDisplayStock === undefined) return undefined;
  return input.requestedDisplayStock * input.multiplier;
}

export function mapStockGroupVariant(product: {
  id: string;
  name: string;
  sku: string;
  price: unknown;
  stock: number;
  unit: string;
  unitMultiplierToBase: number;
  conversionNeedsReview: boolean;
  stockGroup?: { baseStock: number } | null;
}) {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    price: Number(product.price),
    unit: product.unit,
    unitMultiplierToBase: product.unitMultiplierToBase,
    conversionNeedsReview: product.conversionNeedsReview,
    stock: product.stockGroup
      ? calculateDisplayStock(product.stockGroup.baseStock, product.unitMultiplierToBase)
      : product.stock,
  };
}
