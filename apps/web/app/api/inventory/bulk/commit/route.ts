import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { sendRolePushEvent } from "@/lib/push-events";
import { apiError, apiValidationError } from "@/lib/api/responses";

const logger = getLogger("api:inventory:bulk:commit");
import { productSnapshot, stockDelta } from "@/features/batch-operations/helpers/snapshots";
import {
  SupplierValidationError,
  validateRestockSupplier,
} from "@/features/suppliers/services/suppliers-service";

const REASONS_BY_TYPE = {
  IN: ["RESTOCK", "SALE_RETURN"],
  OUT: ["WASTE", "USAGE", "SUPPLIER_RETURN"],
  ADJUSTMENT: ["OPNAME", "MANUAL_ADJUSTMENT"],
} as const;

const bulkCommitSchema = z
  .object({
    productIds: z.array(z.string().min(1)).min(1).max(500),
    type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
    reason: z.enum([
      "RESTOCK",
      "SALE_RETURN",
      "WASTE",
      "USAGE",
      "SUPPLIER_RETURN",
      "OPNAME",
      "MANUAL_ADJUSTMENT",
    ]),
    quantities: z.record(z.string(), z.coerce.number().int().min(0)),
    unitCosts: z.record(z.string(), z.number().min(0).nullable()).optional().default({}),
    supplierId: z.string().trim().min(1).optional(),
    supplierName: z.string().trim().max(120).optional().default(""),
    note: z.string().trim().min(1, "Note is required"),
  })
  .refine(
    (data) =>
      (REASONS_BY_TYPE[data.type] as readonly string[]).includes(data.reason),
    {
      message: "Reason is not valid for the selected type",
      path: ["reason"],
    },
  );

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const input = bulkCommitSchema.parse(await request.json());
    const storeId = user.storeId || "store-main";
    const isOwner = user.role === "OWNER";
    const restockSupplier =
      input.type === "IN" && input.reason === "RESTOCK"
        ? await validateRestockSupplier(input.supplierId)
        : null;
    const supplierDisplayName = restockSupplier?.name || input.supplierName;
    const bundleName = supplierDisplayName || input.note;

    const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const products = await tx.product.findMany({ where: { id: { in: input.productIds }, storeId, isActive: true } });

      if (products.length !== input.productIds.length) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const impacts = products.map((product) => {
        const quantity = input.quantities[product.id] ?? 0;
        const delta = stockDelta(input.type, product.stock, quantity);
        return { product, quantity, delta, afterStock: product.stock + delta };
      });

      if (impacts.some((impact) => impact.quantity <= 0)) throw new Error("QUANTITY_REQUIRED");
      if (isOwner && impacts.some((impact) => impact.afterStock < 0)) throw new Error("NEGATIVE_STOCK");

      const batch = await tx.batchOperation.create({
        data: {
          type: "BULK_STOCK_ADJUSTMENT",
          status: isOwner ? "COMMITTED" : "PENDING",
          storeId,
          createdBy: user.id,
          summary: {
            type: input.type,
            productCount: impacts.length,
            totalCount: impacts.length,
            pendingCount: isOwner ? 0 : impacts.length,
            approvedCount: isOwner ? impacts.length : 0,
            rejectedCount: 0,
            pendingApproval: !isOwner,
            productName: bundleName,
            supplierId: restockSupplier?.id ?? null,
            supplierName: supplierDisplayName,
            note: input.note,
          },
        },
      });

      let inventoryLogCount = 0;

      for (const impact of impacts) {
        const beforeSnapshot = productSnapshot(impact.product);
        const updated = isOwner
          ? await tx.product.update({
              where: { id: impact.product.id },
              data: { stock: impact.afterStock },
            })
          : { ...impact.product, stock: impact.afterStock };
        const log = await tx.inventoryLog.create({
          data: {
            productId: impact.product.id,
            supplierId: restockSupplier?.id ?? null,
            type: input.type,
            reason: input.reason,
            quantity: input.type === "ADJUSTMENT" && !isOwner ? impact.quantity : Math.abs(input.type === "ADJUSTMENT" ? impact.delta : impact.quantity),
            unitCost: resolveUnitCost(
              input.unitCosts[impact.product.id],
              impact.product.costPrice,
            ),
            note: bundleName,
            createdBy: user.id,
            person: user.name,
            status: isOwner ? "APPROVED" : "PENDING",
            approvedBy: isOwner ? user.id : null,
            approverName: isOwner ? user.name : null,
            decidedAt: isOwner ? new Date() : null,
          },
        });
        inventoryLogCount += 1;

        await tx.batchOperationItem.create({
          data: {
            batchOperationId: batch.id,
            productId: impact.product.id,
            sku: impact.product.sku,
            action: input.type === "IN" ? "STOCK_IN" : input.type === "OUT" ? "STOCK_OUT" : "ADJUSTMENT",
            beforeSnapshot: beforeSnapshot as unknown as Prisma.InputJsonValue,
            afterSnapshot: productSnapshot(updated) as unknown as Prisma.InputJsonValue,
            inventoryLogId: log.id,
          },
        });
      }

      await tx.batchOperation.update({
        where: { id: batch.id },
        data: {
          summary: {
            type: input.type,
            updatedProductCount: isOwner ? impacts.length : 0,
            inventoryLogCount,
            totalCount: impacts.length,
            pendingCount: isOwner ? 0 : impacts.length,
            approvedCount: isOwner ? impacts.length : 0,
            rejectedCount: 0,
            pendingApproval: !isOwner,
            productName: bundleName,
            supplierId: restockSupplier?.id ?? null,
            supplierName: supplierDisplayName,
            note: input.note,
          },
        },
      });

      return {
        updatedProductCount: isOwner ? impacts.length : 0,
        inventoryLogCount,
        batchOperationId: batch.id,
        status: isOwner ? "COMMITTED" : "PENDING",
        pendingApproval: !isOwner,
        undoAvailable: isOwner,
      };
    });

    if (result.pendingApproval) {
      try {
        await sendRolePushEvent({
          eventName: "bulk-inventory-request-created",
          storeId,
          roles: ["OWNER", "ADMIN"],
          featureKey: "inventoryRequests",
          payload: {
            title: "Permintaan stok bulk baru",
            body: `${user.name || "User"} membuat ${result.inventoryLogCount} permintaan stok bulk.`,
            url: "/products?tab=logs",
            tag: `bulk-inventory-request:${result.batchOperationId}`,
          },
        });
      } catch (notificationError) {
        logger.error("inventory.bulk.commit.notification_failed", {
          error: notificationError,
          batchOperationId: result.batchOperationId,
          actorId: user.id,
          actorRole: user.role,
          storeId,
        });
      }
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) {
      return apiValidationError(error);
    }
    if (error instanceof Error) {
      if (error instanceof SupplierValidationError) {
        return apiError("Validation error", 422, {
          code: "ValidationError",
          errors: { supplierId: [error.message] },
        });
      }
      if (error.message === "PRODUCT_NOT_FOUND") {
        return apiError("Some selected products were not found", 404, { code: "NotFound" });
      }
      if (error.message === "QUANTITY_REQUIRED") {
        return apiError("Every selected product needs a quantity", 422, {
          code: "ValidationError",
          errors: { quantities: ["Every selected product needs a quantity"] },
        });
      }
      if (error.message === "NEGATIVE_STOCK") {
        return apiError("Stock cannot be negative", 422, {
          code: "ValidationError",
          errors: { stock: ["Stock cannot be negative"] },
        });
      }
    }
    logger.error("inventory.bulk.commit.failed", { error });
    return apiError("Failed to commit bulk stock update", 500, { code: "InternalError" });
  }
}

function resolveUnitCost(
  override: number | null | undefined,
  productCostPrice: { toString: () => string } | number | null,
): number | null {
  if (override === null) return null;
  if (override !== undefined) return override;
  if (productCostPrice === null) return null;
  return Number(productCostPrice.toString());
}

