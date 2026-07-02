import { randomUUID } from "crypto";
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

export interface EnsuredProductStockGroup {
  group: {
    id: string;
    storeId: string;
    groupKey: string;
    displayName: string;
    baseUnit: string;
    baseStock: number;
  };
  created: boolean;
}

export function stockGroupEnsureCacheKey(input: StockGroupKeyInput & { storeId: string }) {
  return `${input.storeId}|${normalizeStockGroupKey(input)}`;
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

export async function ensureProductStockGroups(
  tx: Tx,
  inputs: ReadonlyArray<EnsureStockGroupInput>,
): Promise<Map<string, EnsuredProductStockGroup>> {
  const uniqueInputs = new Map<
    string,
    EnsureStockGroupInput & { groupKey: string }
  >();

  for (const input of inputs) {
    const groupKey = normalizeStockGroupKey(input);
    const cacheKey = `${input.storeId}|${groupKey}`;
    if (uniqueInputs.has(cacheKey)) continue;
    uniqueInputs.set(cacheKey, { ...input, groupKey });
  }

  const result = new Map<string, EnsuredProductStockGroup>();
  if (uniqueInputs.size === 0) return result;

  if (
    !("productStockGroup" in tx) ||
    !tx.productStockGroup ||
    typeof tx.productStockGroup.findMany !== "function" ||
    typeof tx.productStockGroup.createMany !== "function"
  ) {
    for (const input of uniqueInputs.values()) {
      result.set(
        `${input.storeId}|${input.groupKey}`,
        await ensureProductStockGroup(tx, input),
      );
    }
    return result;
  }

  const existingGroups = await tx.productStockGroup.findMany({
    where: {
      OR: Array.from(uniqueInputs.values()).map((input) => ({
        storeId: input.storeId,
        groupKey: input.groupKey,
      })),
    },
  });
  const existingKeys = new Set(
    existingGroups.map((group) => `${group.storeId}|${group.groupKey}`),
  );

  for (const group of existingGroups) {
    result.set(`${group.storeId}|${group.groupKey}`, {
      group,
      created: false,
    });
  }

  const missingInputs = Array.from(uniqueInputs.values()).filter(
    (input) => !existingKeys.has(`${input.storeId}|${input.groupKey}`),
  );
  const createdGroups = missingInputs.map((input) => ({
    id: randomUUID(),
    storeId: input.storeId,
    groupKey: input.groupKey,
    displayName: input.displayName,
    baseUnit: input.baseUnit,
    baseStock: input.baseStock,
  }));

  if (createdGroups.length > 0) {
    await tx.productStockGroup.createMany({
      data: createdGroups,
    });
    for (const group of createdGroups) {
      result.set(`${group.storeId}|${group.groupKey}`, {
        group,
        created: true,
      });
    }
  }

  return result;
}

export function createProductStockGroupEnsurer(tx: Tx) {
  const cache = new Map<
    string,
    Awaited<ReturnType<typeof ensureProductStockGroup>>
  >();

  return async (input: EnsureStockGroupInput) => {
    const cacheKey = stockGroupEnsureCacheKey(input);
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
