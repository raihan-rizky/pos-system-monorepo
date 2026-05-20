import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import {
  productSnapshot,
  snapshotsMatch,
  type ProductSnapshot,
} from "@/features/batch-operations/helpers/snapshots";
import { getLogger } from "@/lib/logger";

const logger = getLogger("api:batch-operations:undo");

function asSnapshot(value: Prisma.JsonValue | null | undefined) {
  return value as unknown as ProductSnapshot | null;
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

      const productIds = batch.items.map((item) => item.productId).filter((value): value is string => Boolean(value));
      const laterTouch = await tx.batchOperationItem.findFirst({
        where: {
          productId: { in: productIds },
          createdAt: { gt: batch.createdAt },
          batchOperationId: { not: batch.id },
        },
        select: { productId: true, sku: true },
      });
      if (laterTouch) throw new Error(`LATER_BATCH_TOUCH:${laterTouch.sku}`);

      const products = await tx.product.findMany({ where: { id: { in: productIds }, storeId } });
      const productById = new Map(products.map((product) => [product.id, product]));
      const blockedProducts: string[] = [];

      for (const item of batch.items) {
        if (!item.productId || item.action === "SKIP") continue;
        const current = productById.get(item.productId);
        const expected = asSnapshot(item.afterSnapshot);
        if (!current || !expected || !snapshotsMatch(productSnapshot(current), expected)) {
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
        blockedProducts.push(...usedProducts.map((item) => item.product.sku));
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
              afterSnapshot: productSnapshot(updated) as unknown as Prisma.InputJsonValue,
              inventoryLogId: log?.id,
            },
          });
          continue;
        }

        if (!beforeSnapshot) continue;
        const delta = beforeSnapshot.stock - current.stock;
        const restored = await tx.product.update({
          where: { id: current.id },
          data: {
            name: beforeSnapshot.name,
            sku: beforeSnapshot.sku,
            barcode: beforeSnapshot.barcode,
            description: beforeSnapshot.description,
            price: beforeSnapshot.price,
            costPrice: beforeSnapshot.costPrice,
            stock: beforeSnapshot.stock,
            minStock: beforeSnapshot.minStock,
            unit: beforeSnapshot.unit,
            size: beforeSnapshot.size,
            material: beforeSnapshot.material,
            categoryId: beforeSnapshot.categoryId,
            isActive: beforeSnapshot.isActive,
            imageUrl: beforeSnapshot.imageUrl,
          },
        });
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
            afterSnapshot: productSnapshot(restored) as unknown as Prisma.InputJsonValue,
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
    logger.error("batch.undo.failed", { error });
    return NextResponse.json({ message: "Failed to undo batch operation" }, { status: 500 });
  }
}


