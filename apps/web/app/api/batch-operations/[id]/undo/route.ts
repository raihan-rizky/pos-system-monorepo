import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import {
  productSnapshot,
  snapshotsMatch,
  type ProductSnapshot,
} from "@/features/batch-operations/helpers/snapshots";
import {
  isStockMutationConflict,
  lockStockMutationRows,
  StockMutationConflictError,
} from "@/features/product-stock-groups/stock-group-lock";
import { getLogger } from "@/lib/logger";

const logger = getLogger("api:batch-operations:undo");

interface SharedStockUndoMetadata {
  stockGroupId: string;
  baseStockBefore: number;
  baseStockAfter: number;
  unitMultiplier: number;
}

type UndoProductSnapshot = ProductSnapshot & {
  sharedStockUndo?: SharedStockUndoMetadata;
};

function asSnapshot(
  value: Prisma.JsonValue | null | undefined,
): UndoProductSnapshot | null {
  return value as unknown as UndoProductSnapshot | null;
}

function productFieldsOnly(
  snapshot: UndoProductSnapshot,
): ProductSnapshot {
  const {
    sharedStockUndo: _sharedStockUndo,
    ...productFields
  } = snapshot;
  return productFields;
}

function normalizedMultiplier(value: number | null | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 1;
}

function sameNumber(left: number, right: number) {
  return Math.abs(left - right) <= 1e-6;
}

function isStockAction(action: string) {
  return (
    action === "STOCK_IN" ||
    action === "STOCK_OUT" ||
    action === "ADJUSTMENT"
  );
}

function isValidSharedStockUndo(
  value: SharedStockUndoMetadata | undefined,
): value is SharedStockUndoMetadata {
  return Boolean(
    value &&
      value.stockGroupId &&
      Number.isFinite(value.baseStockBefore) &&
      Number.isFinite(value.baseStockAfter) &&
      Number.isFinite(value.unitMultiplier) &&
      value.unitMultiplier > 0,
  );
}

async function restoreProductSupplierLinks(
  tx: Prisma.TransactionClient,
  productId: string,
  snapshot: ProductSnapshot | null,
) {
  if (snapshot?.supplierIds === undefined) return;

  await tx.productSupplier.deleteMany({
    where: { productId },
  });

  if (snapshot.supplierIds.length > 0) {
    await tx.productSupplier.createMany({
      data: snapshot.supplierIds.map((supplierId) => ({ productId, supplierId })),
      skipDuplicates: true,
    });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("inventory", "update");
    const { id } = await params;
    const storeId = user.storeId || "store-main";

    const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const batch = await tx.batchOperation.findFirst({
        where: { id, storeId },
        include: { items: true },
      });

      if (!batch) throw new Error("BATCH_NOT_FOUND");
      if (batch.status === "UNDONE") throw new Error("ALREADY_UNDONE");
      if (batch.undoOfBatchId) throw new Error("CANNOT_UNDO_UNDO");

      const productIds = Array.from(
        new Set(
          batch.items
            .map((item) => item.productId)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((left, right) => left.localeCompare(right));
      const laterTouch = await tx.batchOperationItem.findFirst({
        where: {
          productId: { in: productIds },
          createdAt: { gt: batch.createdAt },
          batchOperationId: { not: batch.id },
        },
        select: { productId: true, sku: true },
      });
      if (laterTouch) throw new Error(`LATER_BATCH_TOUCH:${laterTouch.sku}`);

      const productHints = await tx.product.findMany({
        where: { id: { in: productIds }, storeId },
        include: { productSuppliers: { select: { supplierId: true } } },
      });
      const hintById = new Map(
        productHints.map((product) => [product.id, product]),
      );
      const metadataByProductId = new Map<
        string,
        SharedStockUndoMetadata
      >();
      const groupUndoPlans = new Map<
        string,
        {
          stockGroupId: string;
          baseStockBefore: number;
          baseStockAfter: number;
        }
      >();

      for (const item of batch.items) {
        if (!item.productId || !isStockAction(item.action)) continue;
        const beforeSnapshot = asSnapshot(item.beforeSnapshot);
        const afterSnapshot = asSnapshot(item.afterSnapshot);
        const beforeMetadata = beforeSnapshot?.sharedStockUndo;
        const afterMetadata = afterSnapshot?.sharedStockUndo;
        const currentHint = hintById.get(item.productId);

        if (!currentHint?.stockGroupId) {
          if (beforeMetadata || afterMetadata) {
            throw new StockMutationConflictError();
          }
          continue;
        }
        if (
          !isValidSharedStockUndo(beforeMetadata) ||
          !isValidSharedStockUndo(afterMetadata) ||
          beforeMetadata.stockGroupId !== afterMetadata.stockGroupId ||
          !sameNumber(
            beforeMetadata.baseStockBefore,
            afterMetadata.baseStockBefore,
          ) ||
          !sameNumber(
            beforeMetadata.baseStockAfter,
            afterMetadata.baseStockAfter,
          ) ||
          !sameNumber(
            beforeMetadata.unitMultiplier,
            afterMetadata.unitMultiplier,
          )
        ) {
          throw new StockMutationConflictError();
        }

        const existingPlan = groupUndoPlans.get(
          beforeMetadata.stockGroupId,
        );
        if (
          existingPlan &&
          (!sameNumber(
            existingPlan.baseStockBefore,
            beforeMetadata.baseStockBefore,
          ) ||
            !sameNumber(
              existingPlan.baseStockAfter,
              beforeMetadata.baseStockAfter,
            ))
        ) {
          throw new StockMutationConflictError();
        }
        groupUndoPlans.set(beforeMetadata.stockGroupId, {
          stockGroupId: beforeMetadata.stockGroupId,
          baseStockBefore: beforeMetadata.baseStockBefore,
          baseStockAfter: beforeMetadata.baseStockAfter,
        });
        metadataByProductId.set(item.productId, beforeMetadata);
      }

      const stockGroupIds = Array.from(
        new Set([
          ...productHints
            .map((product) => product.stockGroupId)
            .filter((stockGroupId): stockGroupId is string =>
              Boolean(stockGroupId),
            ),
          ...groupUndoPlans.keys(),
        ]),
      ).sort((left, right) => left.localeCompare(right));
      const variantHints =
        stockGroupIds.length === 0
          ? []
          : await tx.product.findMany({
              where: {
                storeId,
                isActive: true,
                stockGroupId: { in: stockGroupIds },
              },
              select: {
                id: true,
                stockGroupId: true,
                isActive: true,
                unitMultiplierToBase: true,
              },
            });
      const candidateProductIds = Array.from(
        new Set([
          ...productIds,
          ...variantHints.map((product) => product.id),
        ]),
      ).sort((left, right) => left.localeCompare(right));
      const locks = await lockStockMutationRows(tx, {
        storeId,
        stockGroupIds,
        productIds: candidateProductIds,
      });
      if (
        locks.lockedStockGroupIds.length !== stockGroupIds.length ||
        locks.lockedProductIds.length !== candidateProductIds.length
      ) {
        throw new StockMutationConflictError();
      }

      const productsAfterLock = await tx.product.findMany({
        where: { id: { in: productIds }, storeId },
        include: { productSuppliers: { select: { supplierId: true } } },
      });
      const variantsAfterLock =
        stockGroupIds.length === 0
          ? []
          : await tx.product.findMany({
              where: {
                storeId,
                isActive: true,
                stockGroupId: { in: stockGroupIds },
              },
              select: {
                id: true,
                stockGroupId: true,
                isActive: true,
                unitMultiplierToBase: true,
              },
            });
      if (
        productsAfterLock.length !== productIds.length ||
        productsAfterLock.some((product) => {
          const hint = hintById.get(product.id);
          return (
            !hint ||
            hint.stockGroupId !== product.stockGroupId ||
            hint.isActive !== product.isActive
          );
        })
      ) {
        throw new StockMutationConflictError();
      }

      const variantHintById = new Map(
        variantHints.map((product) => [product.id, product]),
      );
      if (
        variantsAfterLock.length !== variantHints.length ||
        variantsAfterLock.some((product) => {
          const hint = variantHintById.get(product.id);
          return (
            !hint ||
            hint.stockGroupId !== product.stockGroupId ||
            hint.isActive !== product.isActive ||
            !sameNumber(
              normalizedMultiplier(hint.unitMultiplierToBase),
              normalizedMultiplier(product.unitMultiplierToBase),
            )
          );
        })
      ) {
        throw new StockMutationConflictError();
      }

      const productById = new Map(
        productsAfterLock.map((product) => [product.id, product]),
      );
      for (const [productId, metadata] of metadataByProductId) {
        const current = productById.get(productId);
        if (
          !current ||
          current.stockGroupId !== metadata.stockGroupId ||
          !sameNumber(
            normalizedMultiplier(current.unitMultiplierToBase),
            metadata.unitMultiplier,
          )
        ) {
          throw new StockMutationConflictError();
        }
      }

      const groupIdsToRestore = Array.from(groupUndoPlans.keys()).sort(
        (left, right) => left.localeCompare(right),
      );
      const groupsAfterLock =
        groupIdsToRestore.length === 0
          ? []
          : await tx.productStockGroup.findMany({
              where: {
                id: { in: groupIdsToRestore },
                storeId,
              },
              select: {
                id: true,
                storeId: true,
                baseStock: true,
              },
            });
      const groupAfterLockById = new Map(
        groupsAfterLock.map((group) => [group.id, group]),
      );
      if (
        groupsAfterLock.length !== groupIdsToRestore.length ||
        groupIdsToRestore.some((stockGroupId) => {
          const plan = groupUndoPlans.get(stockGroupId);
          const group = groupAfterLockById.get(stockGroupId);
          return (
            !plan ||
            !group ||
            !sameNumber(group.baseStock, plan.baseStockAfter)
          );
        })
      ) {
        throw new StockMutationConflictError();
      }

      const blockedProducts: string[] = [];

      for (const item of batch.items) {
        if (!item.productId || item.action === "SKIP") continue;
        const current = productById.get(item.productId);
        const expected = asSnapshot(item.afterSnapshot);
        if (
          !current ||
          !expected ||
          !snapshotsMatch(
            productSnapshot(current),
            productFieldsOnly(expected),
          )
        ) {
          blockedProducts.push(item.sku);
        }
      }

      const createdProductIds = batch.items
        .filter((item) => item.action === "CREATE" && item.productId)
        .map((item) => item.productId!);
      if (createdProductIds.length > 0) {
        const usedProducts = await tx.transactionItem.findMany({
          where: { productId: { in: createdProductIds } },
          select: { productId: true, product: { select: { sku: true } } },
          distinct: ["productId"],
        });
        blockedProducts.push(
          ...usedProducts
            .map((item) => item.product?.sku)
            .filter((sku): sku is string => Boolean(sku)),
        );
      }

      if (blockedProducts.length > 0) {
        await tx.batchOperation.update({
          where: { id: batch.id },
          data: { status: "UNDO_BLOCKED" },
        });
        return {
          success: false,
          reversalInventoryLogCount: 0,
          blockedProducts: Array.from(new Set(blockedProducts)),
        };
      }

      const undoBatch = await tx.batchOperation.create({
        data: {
          type: "UNDO",
          status: "COMMITTED",
          storeId,
          createdBy: user.id,
          undoOfBatchId: batch.id,
          summary: {
            undoneBatchId: batch.id,
            originalType: batch.type,
            itemCount: batch.items.length,
          },
        },
      });

      let reversalInventoryLogCount = 0;

      for (const stockGroupId of groupIdsToRestore) {
        const plan = groupUndoPlans.get(stockGroupId);
        if (!plan) throw new StockMutationConflictError();

        const restoredGroup = await tx.productStockGroup.updateMany({
          where: {
            id: stockGroupId,
            storeId,
            baseStock: plan.baseStockAfter,
          },
          data: { baseStock: plan.baseStockBefore },
        });
        if (restoredGroup.count !== 1) {
          throw new StockMutationConflictError();
        }

        const groupVariants = variantsAfterLock
          .filter((variant) => variant.stockGroupId === stockGroupId)
          .sort((left, right) => left.id.localeCompare(right.id));
        for (const variant of groupVariants) {
          const synced = await tx.product.updateMany({
            where: {
              id: variant.id,
              storeId,
              stockGroupId,
              isActive: true,
            },
            data: {
              stock:
                plan.baseStockBefore /
                normalizedMultiplier(variant.unitMultiplierToBase),
            },
          });
          if (synced.count !== 1) {
            throw new StockMutationConflictError();
          }
        }
      }

      for (const item of batch.items) {
        if (!item.productId || item.action === "SKIP") continue;
        const current = productById.get(item.productId);
        const beforeSnapshot = asSnapshot(item.beforeSnapshot);
        const afterSnapshot = asSnapshot(item.afterSnapshot);
        if (!current || !afterSnapshot) continue;

        if (item.action === "CREATE") {
          const delta = -current.stock;
          const updated = await tx.product.update({
            where: { id: current.id },
            data: { stock: 0, isActive: false },
          });
          await restoreProductSupplierLinks(tx, current.id, { ...afterSnapshot, supplierIds: [] });
          const log = delta === 0 ? null : await tx.inventoryLog.create({
            data: {
              productId: current.id,
              type: "OUT",
              reason: "SUPPLIER_RETURN",
              quantity: Math.abs(delta),
              note: `Undo batch ${batch.id}`,
              createdBy: user.id,
          person: user.name,
            },
          });
          if (log) reversalInventoryLogCount += 1;
          await tx.batchOperationItem.create({
            data: {
              batchOperationId: undoBatch.id,
              productId: current.id,
              sku: item.sku,
              action: "UNDO",
              beforeSnapshot: afterSnapshot as unknown as Prisma.InputJsonValue,
              afterSnapshot: productSnapshot({
                ...updated,
                ...(afterSnapshot.supplierIds === undefined ? {} : { supplierIds: [] }),
              }) as unknown as Prisma.InputJsonValue,
              inventoryLogId: log?.id,
            },
          });
          continue;
        }

        if (!beforeSnapshot) continue;
        const delta = beforeSnapshot.stock - current.stock;
        const sharedStockUndo = metadataByProductId.get(current.id);
        const restoredStock = sharedStockUndo
          ? sharedStockUndo.baseStockBefore /
            sharedStockUndo.unitMultiplier
          : beforeSnapshot.stock;
        const restored = await tx.product.update({
          where: { id: current.id },
          data: {
            name: beforeSnapshot.name,
            sku: beforeSnapshot.sku,
            barcode: beforeSnapshot.barcode,
            description: beforeSnapshot.description,
            price: beforeSnapshot.price,
            costPrice: beforeSnapshot.costPrice,
            hargaDinas: beforeSnapshot.hargaDinas,
            hargaAgen: beforeSnapshot.hargaAgen,
            stock: restoredStock,
            minStock: beforeSnapshot.minStock,
            unit: beforeSnapshot.unit,
            size: beforeSnapshot.size,
            material: beforeSnapshot.material,
            categoryId: beforeSnapshot.categoryId,
            ...(beforeSnapshot.brandId !== undefined
              ? { brandId: beforeSnapshot.brandId }
              : {}),
            isActive: beforeSnapshot.isActive,
            imageUrl: beforeSnapshot.imageUrl,
          },
        });
        await restoreProductSupplierLinks(tx, current.id, beforeSnapshot);
        const log = delta === 0 ? null : await tx.inventoryLog.create({
          data: {
            productId: current.id,
            type: delta > 0 ? "IN" : "OUT",
            reason: delta > 0 ? "RESTOCK" : "SUPPLIER_RETURN",
            quantity: Math.abs(delta),
            note: `Undo batch ${batch.id}`,
            createdBy: user.id,
          person: user.name,
          },
        });
        if (log) reversalInventoryLogCount += 1;
        await tx.batchOperationItem.create({
          data: {
            batchOperationId: undoBatch.id,
            productId: current.id,
            sku: item.sku,
            action: "UNDO",
            beforeSnapshot: afterSnapshot as unknown as Prisma.InputJsonValue,
            afterSnapshot: productSnapshot({
              ...restored,
              ...(beforeSnapshot.supplierIds === undefined
                ? {}
                : { supplierIds: beforeSnapshot.supplierIds }),
            }) as unknown as Prisma.InputJsonValue,
            inventoryLogId: log?.id,
          },
        });
      }

      await tx.batchOperation.update({
        where: { id: batch.id },
        data: {
          status: "UNDONE",
          undoneAt: new Date(),
          undoneBy: user.id,
        },
      });

      return {
        success: true,
        reversalInventoryLogCount,
        blockedProducts: [],
        undoBatchOperationId: undoBatch.id,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof Error) {
      if (error.message === "BATCH_NOT_FOUND") return NextResponse.json({ message: "Batch operation not found" }, { status: 404 });
      if (error.message === "ALREADY_UNDONE") return NextResponse.json({ message: "Batch operation is already undone" }, { status: 409 });
      if (error.message === "CANNOT_UNDO_UNDO") return NextResponse.json({ message: "Undo operations cannot be undone" }, { status: 409 });
      if (error.message.startsWith("LATER_BATCH_TOUCH:")) {
        return NextResponse.json({ message: "A later batch touched at least one affected product", blockedProducts: [error.message.replace("LATER_BATCH_TOUCH:", "")] }, { status: 409 });
      }
    }
    if (isStockMutationConflict(error)) {
      return NextResponse.json(
        {
          message:
            "Data produk atau grup stok berubah saat undo diproses. Silakan coba lagi.",
        },
        { status: 409 },
      );
    }
    logger.error("batch.undo.failed", { error });
    return NextResponse.json({ message: "Failed to undo batch operation" }, { status: 500 });
  }
}


