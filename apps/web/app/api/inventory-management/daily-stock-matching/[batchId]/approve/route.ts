import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";

import { productSnapshot } from "@/features/batch-operations/helpers/snapshots";
import { summarizeBulkApprovalBundle } from "@/features/bulk-stock-approval/helpers/bundle-status";
import { calculateBaseQuantity, resolveProductDisplayStock } from "@/features/product-stock-groups/stock-display";
import {
  isStockMutationConflict,
  lockStockMutationRows,
  StockMutationConflictError,
} from "@/features/product-stock-groups/stock-group-lock";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const approveSchema = z.object({
  lines: z.array(
    z.object({
      productId: z.string().min(1),
      physicalStock: z.coerce.number().min(0),
    }),
  ).optional().default([]),
});

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function sortedUniqueIds(ids: ReadonlyArray<string>) {
  return Array.from(new Set(ids.filter(Boolean))).sort();
}

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    const user = await requirePermission("inventory.approve", "update");
    const { batchId } = await context.params;
    const input = approveSchema.parse(await request.json().catch(() => ({})));
    const overrideByProductId = new Map(
      input.lines.map((line) => [line.productId, line.physicalStock]),
    );

    const result = await db.$transaction(async (tx) => {
      const batch = await tx.batchOperation.findUnique({
        where: { id: batchId },
        include: { items: true },
      });
      if (!batch || batch.type !== "DAILY_STOCK_MATCHING") {
        throw new Error("BATCH_NOT_FOUND");
      }
      if (batch.status !== "PENDING") throw new Error("ALREADY_DECIDED");

      const logIds = batch.items
        .map((item) => item.inventoryLogId)
        .filter((id): id is string => Boolean(id));
      const logs = await tx.inventoryLog.findMany({
        where: { id: { in: logIds }, status: "PENDING" },
      });
      const logById = new Map(logs.map((log) => [log.id, log]));
      const productIds = Array.from(new Set(batch.items.map((item) => item.productId).filter(Boolean))) as string[];
      productIds.sort();
      const productHints = await tx.product.findMany({
        where: { id: { in: productIds }, storeId: batch.storeId },
        include: { stockGroup: true },
      });
      if (productHints.length !== productIds.length) {
        throw new StockMutationConflictError();
      }

      const hintedGroupIds = sortedUniqueIds(
        productHints
          .map((product) => product.stockGroupId)
          .filter((stockGroupId): stockGroupId is string =>
            Boolean(stockGroupId),
          ),
      );
      const affectedHints = await tx.product.findMany({
        where: {
          storeId: batch.storeId,
          OR: [
            { id: { in: productIds } },
            ...(hintedGroupIds.length > 0
              ? [{ stockGroupId: { in: hintedGroupIds } }]
              : []),
          ],
        },
        include: { stockGroup: true },
      });
      const firstHintById = new Map(
        productHints.map((product) => [product.id, product]),
      );
      if (
        productIds.some(
          (productId) =>
            firstHintById.get(productId)?.stockGroupId !==
            affectedHints.find((product) => product.id === productId)
              ?.stockGroupId,
        )
      ) {
        throw new StockMutationConflictError();
      }

      const affectedProductIds = sortedUniqueIds(
        affectedHints.map((product) => product.id),
      );
      const locks = await lockStockMutationRows(tx, {
        storeId: batch.storeId,
        stockGroupIds: hintedGroupIds,
        productIds: affectedProductIds,
      });
      if (
        locks.lockedStockGroupIds.length !== hintedGroupIds.length ||
        locks.lockedProductIds.length !== affectedProductIds.length
      ) {
        throw new StockMutationConflictError();
      }

      const productsAfterLock = await tx.product.findMany({
        where: {
          storeId: batch.storeId,
          OR: [
            { id: { in: affectedProductIds } },
            ...(hintedGroupIds.length > 0
              ? [{ stockGroupId: { in: hintedGroupIds } }]
              : []),
          ],
        },
        include: { stockGroup: true },
      });
      const affectedHintById = new Map(
        affectedHints.map((product) => [product.id, product]),
      );
      if (
        productsAfterLock.length !== affectedProductIds.length ||
        productsAfterLock.some((product) => {
          const hint = affectedHintById.get(product.id);
          return (
            !hint ||
            hint.stockGroupId !== product.stockGroupId ||
            (product.stockGroupId !== null &&
              product.stockGroup?.id !== product.stockGroupId)
          );
        })
      ) {
        throw new StockMutationConflictError();
      }

      const currentById = new Map(
        productsAfterLock.map((product) => [product.id, product]),
      );
      const products = productIds.map((productId) => {
        const product = currentById.get(productId);
        if (!product) throw new StockMutationConflictError();
        return product;
      });
      const productById = new Map(products.map((product) => [product.id, product]));

      const groupTargets = new Map<string, number>();
      const standaloneTargets: Array<{ productId: string; stock: number }> = [];
      const approvedStatuses: Array<{ status: "APPROVED" }> = [];

      for (const item of batch.items) {
        if (!item.inventoryLogId || !item.productId) continue;
        const log = logById.get(item.inventoryLogId);
        const product = productById.get(item.productId);
        if (!log || !product) continue;

        const targetStock = overrideByProductId.get(product.id) ?? log.quantity;
        if (product.stockGroupId && product.stockGroup) {
          const targetBaseStock = calculateBaseQuantity(
            targetStock,
            product.unitMultiplierToBase,
          );
          const existing = groupTargets.get(product.stockGroupId);
          if (existing !== undefined && Math.abs(existing - targetBaseStock) > 1e-6) {
            throw new Error("INCONSISTENT_STOCK_GROUP_TARGET");
          }
          groupTargets.set(product.stockGroupId, targetBaseStock);
        } else {
          standaloneTargets.push({ productId: product.id, stock: targetStock });
        }
      }

      for (const [stockGroupId, baseStock] of groupTargets) {
        await tx.productStockGroup.updateMany({
          where: { id: stockGroupId, storeId: batch.storeId },
          data: { baseStock },
        });
      }
      for (const target of standaloneTargets) {
        await tx.product.updateMany({
          where: { id: target.productId, storeId: batch.storeId },
          data: { stock: target.stock },
        });
      }

      for (const item of batch.items) {
        if (!item.inventoryLogId || !item.productId) continue;
        const log = logById.get(item.inventoryLogId);
        const product = productById.get(item.productId);
        if (!log || !product) continue;
        const beforeStock = resolveProductDisplayStock(product);
        const targetStock = overrideByProductId.get(product.id) ?? log.quantity;

        await tx.inventoryLog.update({
          where: { id: log.id },
          data: {
            quantity: targetStock,
            status: "APPROVED",
            approvedBy: user.id,
            approverName: user.name,
            decidedAt: new Date(),
          },
        });
        await tx.batchOperationItem.update({
          where: { id: item.id },
          data: {
            beforeSnapshot: productSnapshot({
              ...product,
              stock: beforeStock,
            }) as unknown as Prisma.InputJsonValue,
            afterSnapshot: productSnapshot({
              ...product,
              stock: targetStock,
            }) as unknown as Prisma.InputJsonValue,
          },
        });
        approvedStatuses.push({ status: "APPROVED" });
      }

      const summary = asRecord(batch.summary);
      const bundleSummary = summarizeBulkApprovalBundle(approvedStatuses);
      await tx.batchOperation.update({
        where: { id: batch.id },
        data: {
          status: bundleSummary.status,
          summary: {
            ...summary,
            ...bundleSummary,
            reviewedBy: user.id,
            reviewedByName: user.name,
          },
        },
      });

      const periodKey = String(summary.periodKey || "");
      if (periodKey) {
        await tx.inventoryTask.upsert({
          where: {
            storeId_type_periodKey: {
              storeId: batch.storeId,
              type: "DAILY_STOCK_MATCHING",
              periodKey,
            },
          },
          create: {
            storeId: batch.storeId,
            type: "DAILY_STOCK_MATCHING",
            periodType: "DAILY",
            periodKey,
            status: "SUBMITTED",
            submittedBy: batch.createdBy,
            submittedAt: new Date(),
            completionSnapshot: {
              batchOperationId: batch.id,
              reviewedBy: user.id,
              reviewedAt: new Date().toISOString(),
            },
          },
          update: {
            status: "SUBMITTED",
            completionSnapshot: {
              batchOperationId: batch.id,
              reviewedBy: user.id,
              reviewedAt: new Date().toISOString(),
            },
          },
        });
      }

      return { batchId: batch.id, batchSummary: bundleSummary };
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) return apiValidationError(error);
    if (isStockMutationConflict(error)) {
      return apiError(
        "Data stok berubah saat persetujuan diproses. Silakan coba lagi.",
        409,
        { code: "Conflict" },
      );
    }
    if (error instanceof Error) {
      if (error.message === "BATCH_NOT_FOUND") {
        return apiError("Bundle tidak ditemukan", 404, { code: "NotFound" });
      }
      if (error.message === "ALREADY_DECIDED") {
        return apiError("Bundle sudah diputuskan", 409, { code: "Conflict" });
      }
      if (error.message === "INCONSISTENT_STOCK_GROUP_TARGET") {
        return apiError("Input fisik antar varian dalam grup stok tidak konsisten", 422, {
          code: "ValidationError",
        });
      }
    }
    return apiError("Failed to approve daily stock matching", 500, {
      code: "InternalError",
    });
  }
}
