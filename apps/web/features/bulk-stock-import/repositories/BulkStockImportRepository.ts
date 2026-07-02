import { randomUUID } from "crypto";
import type {
  BulkStockImportImpact,
  BulkStockImportMode,
  BulkStockImportProduct,
} from "../helpers/import-core";
import type { Prisma } from "@pos/db";
import { db } from "@pos/db";
import { productSnapshot } from "@/features/batch-operations/helpers/snapshots";
import {
  calculateBaseQuantity,
  resolveProductDisplayStock,
} from "@/features/product-stock-groups/stock-display";
import { StockMutationError } from "@/features/product-stock-groups/stock-mutations";

export interface BulkStockImportUser {
  id: string;
  name?: string | null;
  role: string;
  storeId?: string | null;
}

export interface BulkStockImportSupplier {
  id: string;
  name: string;
}

export interface BulkStockImportCommitResult {
  updatedProductCount: number;
  inventoryLogCount: number;
  batchOperationId: string;
  status: "PENDING" | "COMMITTED";
  pendingApproval: boolean;
  undoAvailable: boolean;
}

export interface BulkStockImportCommitInput {
  storeId: string;
  user: BulkStockImportUser;
  mode: BulkStockImportMode;
  impacts: BulkStockImportImpact[];
  supplier: BulkStockImportSupplier | null;
  note: string;
  allowNegativeStock?: boolean;
}

export interface BulkStockImportRepository {
  findActiveProductsForStockImport(storeId: string): Promise<BulkStockImportProduct[]>;
  findActiveSupplierById(supplierId: string): Promise<BulkStockImportSupplier | null>;
  commitStockImport(input: BulkStockImportCommitInput): Promise<BulkStockImportCommitResult>;
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

type StockImportProductRecord = Awaited<
  ReturnType<typeof findStockImportProductRecords>
>[number];

type StockImportTxProduct = Prisma.ProductGetPayload<{
  include: { stockGroup: true };
}>;

interface StandaloneStockUpdate {
  productId: string;
  delta: number;
}

interface GroupStockUpdate {
  stockGroupId: string;
  productId: string;
  baseDelta: number;
  targetUnitMultiplierToBase: number;
}

async function findStockImportProductRecords(storeId: string) {
  return db.product.findMany({
    where: { storeId, isActive: true },
    include: {
      category: { select: { name: true } },
      stockGroup: true,
    },
  });
}

function toImportProduct(product: StockImportProductRecord): BulkStockImportProduct {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    categoryName: product.category.name,
    unit: product.unit,
    stock: resolveProductDisplayStock(product),
  };
}

function stockActionForMode(mode: BulkStockImportMode) {
  return mode === "ADD" ? "STOCK_IN" : "ADJUSTMENT";
}

function inventoryTypeForMode(mode: BulkStockImportMode) {
  return mode === "ADD" ? "IN" : "ADJUSTMENT";
}

function assertNonNegativeStock(
  productId: string,
  beforeStock: number,
  delta: number,
  allowNegative: boolean,
) {
  if (!allowNegative && beforeStock + delta < 0) {
    throw new StockMutationError("INSUFFICIENT_STOCK", {
      productId,
      available: beforeStock,
      requested: Math.abs(delta),
    });
  }
}

function addToMap(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function normalizeUnitMultiplier(multiplier: number | null | undefined) {
  return Number.isFinite(multiplier) && Number(multiplier) > 0
    ? Number(multiplier)
    : 1;
}

function roundedDisplayTargetTolerance(
  leftMultiplier: number,
  rightMultiplier: number,
) {
  return Math.max(leftMultiplier, rightMultiplier) * 0.005 + 1e-6;
}

function collectStockUpdate(
  product: StockImportTxProduct,
  delta: number,
  allowNegative: boolean,
  standaloneDeltas: Map<string, number>,
  groupDeltas: Map<string, GroupStockUpdate>,
  options?: {
    mode: BulkStockImportMode;
    targetStock: number;
  },
) {
  if (delta === 0) return;

  if (!product.stockGroupId || !product.stockGroup) {
    assertNonNegativeStock(product.id, product.stock, delta, allowNegative);
    addToMap(standaloneDeltas, product.id, delta);
    return;
  }

  if (product.conversionNeedsReview) {
    throw new StockMutationError("CONVERSION_NEEDS_REVIEW", {
      productId: product.id,
    });
  }

  const baseDelta = calculateBaseQuantity(delta, product.unitMultiplierToBase);
  const existing = groupDeltas.get(product.stockGroupId);
  const unitMultiplier = normalizeUnitMultiplier(product.unitMultiplierToBase);

  if (options?.mode === "SET") {
    const targetBaseStock = calculateBaseQuantity(
      options.targetStock,
      product.unitMultiplierToBase,
    );
    const nextBaseDelta = targetBaseStock - product.stockGroup.baseStock;

    if (existing) {
      const tolerance = roundedDisplayTargetTolerance(
        existing.targetUnitMultiplierToBase,
        unitMultiplier,
      );
      if (Math.abs(existing.baseDelta - nextBaseDelta) <= tolerance) {
        // Consistent targets — prefer the finer-grained variant for precision
        if (unitMultiplier < existing.targetUnitMultiplierToBase) {
          groupDeltas.set(product.stockGroupId, {
            stockGroupId: product.stockGroupId,
            productId: product.id,
            baseDelta: nextBaseDelta,
            targetUnitMultiplierToBase: unitMultiplier,
          });
        }
        return;
      }

      // Inconsistent targets across grouped products — use the finer-grained
      // variant as the authority since it provides the most precise base stock.
      if (unitMultiplier < existing.targetUnitMultiplierToBase) {
        groupDeltas.set(product.stockGroupId, {
          stockGroupId: product.stockGroupId,
          productId: product.id,
          baseDelta: nextBaseDelta,
          targetUnitMultiplierToBase: unitMultiplier,
        });
      }
      return;
    }

    groupDeltas.set(product.stockGroupId, {
      stockGroupId: product.stockGroupId,
      productId: product.id,
      baseDelta: nextBaseDelta,
      targetUnitMultiplierToBase: unitMultiplier,
    });
    return;
  }

  groupDeltas.set(product.stockGroupId, {
    stockGroupId: product.stockGroupId,
    productId: existing?.productId ?? product.id,
    baseDelta: (existing?.baseDelta ?? 0) + baseDelta,
    targetUnitMultiplierToBase:
      existing?.targetUnitMultiplierToBase ?? unitMultiplier,
  });
}

function assertGroupedStockUpdates(
  productsById: Map<string, StockImportTxProduct>,
  groupDeltas: Map<string, GroupStockUpdate>,
  allowNegative: boolean,
) {
  if (allowNegative) return;

  for (const update of groupDeltas.values()) {
    const product = productsById.get(update.productId);
    const beforeBaseStock = product?.stockGroup?.baseStock ?? 0;
    if (beforeBaseStock + update.baseDelta < 0) {
      throw new StockMutationError("INSUFFICIENT_STOCK", {
        productId: update.productId,
        available: resolveProductDisplayStock(product ?? { stock: beforeBaseStock }),
        requested: Math.abs(update.baseDelta),
      });
    }
  }
}

async function applyBulkStandaloneStockUpdates(
  tx: Tx,
  input: {
    storeId: string;
    updates: StandaloneStockUpdate[];
    allowNegative: boolean;
  },
) {
  if (input.updates.length === 0) return;

  const productIds = input.updates.map((update) => update.productId);
  const deltas = input.updates.map((update) => update.delta);
  const updated = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE pos_products AS p
    SET stock = p.stock + v.delta,
        "updatedAt" = NOW()
    FROM unnest(${productIds}::text[], ${deltas}::float8[]) AS v(id, delta)
    WHERE p.id = v.id
      AND p."storeId" = ${input.storeId}
      AND p."stockGroupId" IS NULL
      AND (${input.allowNegative}::boolean OR p.stock + v.delta >= 0)
    RETURNING p.id
  `;

  if (updated.length !== input.updates.length) {
    throw new StockMutationError("INSUFFICIENT_STOCK", {
      productId: input.updates[0]?.productId ?? "",
    });
  }
}

async function applyBulkGroupedStockUpdates(
  tx: Tx,
  input: {
    storeId: string;
    updates: GroupStockUpdate[];
    allowNegative: boolean;
  },
) {
  if (input.updates.length === 0) return;

  const stockGroupIds = input.updates.map((update) => update.stockGroupId);
  const baseDeltas = input.updates.map((update) => update.baseDelta);
  const updatedGroups = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE pos_product_stock_groups AS g
    SET "baseStock" = g."baseStock" + v.delta,
        "updatedAt" = NOW()
    FROM unnest(${stockGroupIds}::text[], ${baseDeltas}::float8[]) AS v(id, delta)
    WHERE g.id = v.id
      AND g."storeId" = ${input.storeId}
      AND (${input.allowNegative}::boolean OR g."baseStock" + v.delta >= 0)
    RETURNING g.id
  `;

  if (updatedGroups.length !== input.updates.length) {
    throw new StockMutationError("INSUFFICIENT_STOCK", {
      productId: input.updates[0]?.productId ?? "",
    });
  }

  await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE pos_products AS p
    SET stock = g."baseStock" /
        CASE
          WHEN p."unitMultiplierToBase" IS NOT NULL
           AND p."unitMultiplierToBase" > 0
          THEN p."unitMultiplierToBase"
          ELSE 1
        END,
        "updatedAt" = NOW()
    FROM pos_product_stock_groups AS g
    WHERE p."stockGroupId" = g.id
      AND p."storeId" = ${input.storeId}
      AND g.id = ANY(${stockGroupIds}::text[])
    RETURNING p.id
  `;
}

export const bulkStockImportRepository: BulkStockImportRepository = {
  async findActiveProductsForStockImport(storeId) {
    const products = await findStockImportProductRecords(storeId);
    return products.map(toImportProduct);
  },

  async findActiveSupplierById(supplierId) {
    const supplier = await db.supplier.findFirst({
      where: { id: supplierId, isActive: true },
      select: { id: true, name: true },
    });
    return supplier;
  },

  async commitStockImport(input) {
    const isOwner = input.user.role === "OWNER";
    const status: BulkStockImportCommitResult["status"] = isOwner
      ? "COMMITTED"
      : "PENDING";
    const pendingApproval = !isOwner;
    const action = stockActionForMode(input.mode);
    const inventoryType = inventoryTypeForMode(input.mode);

    return db.$transaction(async (tx: Tx) => {
      const products = await tx.product.findMany({
        where: {
          id: { in: input.impacts.map((impact) => impact.productId) },
          storeId: input.storeId,
          isActive: true,
        },
        include: { stockGroup: true },
      });
      const productsById = new Map(products.map((product) => [product.id, product]));

      if (products.length !== input.impacts.length) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const batch = await tx.batchOperation.create({
        data: {
          type: "BULK_STOCK_ADJUSTMENT",
          status,
          storeId: input.storeId,
          createdBy: input.user.id,
          summary: {
            source: "BULK_STOCK_IMPORT",
            mode: input.mode,
            totalCount: input.impacts.length,
            pendingCount: pendingApproval ? input.impacts.length : 0,
            approvedCount: isOwner ? input.impacts.length : 0,
            rejectedCount: 0,
            pendingApproval,
            supplierId: input.supplier?.id ?? null,
            supplierName: input.supplier?.name ?? "",
            note: input.note,
          },
        },
      });

      let inventoryLogCount = 0;
      const inventoryLogsToCreate: Prisma.InventoryLogCreateManyInput[] = [];
      const batchOperationItemsToCreate: Prisma.BatchOperationItemCreateManyInput[] = [];

      const standaloneDeltas = new Map<string, number>();
      const groupDeltas = new Map<string, GroupStockUpdate>();
      const allowNegative = input.allowNegativeStock === true;

      for (const impact of input.impacts) {
        const product = productsById.get(impact.productId);
        if (!product) throw new Error("PRODUCT_NOT_FOUND");
        const currentStock = resolveProductDisplayStock(product);
        const delta =
          input.mode === "ADD" ? impact.delta : impact.afterStock - currentStock;
        const afterStock = currentStock + delta;

        const beforeSnapshot = productSnapshot({
          ...product,
          stock: currentStock,
        });

        if (isOwner) {
          collectStockUpdate(
            product,
            delta,
            allowNegative,
            standaloneDeltas,
            groupDeltas,
            {
              mode: input.mode,
              targetStock: afterStock,
            },
          );
        }

        const afterSnapshot = productSnapshot({
          ...product,
          stock: afterStock,
        });

        const logId = randomUUID();
        inventoryLogsToCreate.push({
          id: logId,
          productId: impact.productId,
          supplierId: input.supplier?.id ?? null,
          type: inventoryType,
          reason: input.mode === "ADD" ? "RESTOCK" : "OPNAME",
          quantity: input.mode === "ADD" ? Math.abs(impact.quantity) : impact.quantity,
          unitCost: product.costPrice === null ? null : Number(product.costPrice),
          note: input.note,
          createdBy: input.user.id,
          person: input.user.name ?? null,
          status: isOwner ? "APPROVED" : "PENDING",
          approvedBy: isOwner ? input.user.id : null,
          approverName: isOwner ? input.user.name ?? null : null,
          decidedAt: isOwner ? new Date() : null,
        });
        inventoryLogCount += 1;

        batchOperationItemsToCreate.push({
          batchOperationId: batch.id,
          productId: impact.productId,
          sku: impact.sku,
          action,
          beforeSnapshot: beforeSnapshot as any,
          afterSnapshot: afterSnapshot as any,
          inventoryLogId: logId,
        });
      }

      if (isOwner) {
        assertGroupedStockUpdates(productsById, groupDeltas, allowNegative);
        await applyBulkStandaloneStockUpdates(tx, {
          storeId: input.storeId,
          updates: Array.from(standaloneDeltas, ([productId, delta]) => ({
            productId,
            delta,
          })),
          allowNegative,
        });
        await applyBulkGroupedStockUpdates(tx, {
          storeId: input.storeId,
          updates: Array.from(groupDeltas.values()),
          allowNegative,
        });
      }

      await tx.inventoryLog.createMany({ data: inventoryLogsToCreate });
      await tx.batchOperationItem.createMany({ data: batchOperationItemsToCreate });

      await tx.batchOperation.update({
        where: { id: batch.id },
        data: {
          summary: {
            source: "BULK_STOCK_IMPORT",
            mode: input.mode,
            updatedProductCount: isOwner ? input.impacts.length : 0,
            inventoryLogCount,
            totalCount: input.impacts.length,
            pendingCount: pendingApproval ? input.impacts.length : 0,
            approvedCount: isOwner ? input.impacts.length : 0,
            rejectedCount: 0,
            pendingApproval,
            supplierId: input.supplier?.id ?? null,
            supplierName: input.supplier?.name ?? "",
            note: input.note,
          },
        },
      });

      return {
        updatedProductCount: isOwner ? input.impacts.length : 0,
        inventoryLogCount,
        batchOperationId: batch.id,
        status,
        pendingApproval,
        undoAvailable: isOwner,
      };
    }, { maxWait: 5000, timeout: 600000 });
  },
};
