import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";

import { productSnapshot } from "@/features/batch-operations/helpers/snapshots";
import {
  calculateStockGroupBulkPreview,
  stockGroupBulkAction,
  stockGroupBulkReason,
} from "@/features/inventory-management/helpers/stock-group-bulk";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const stockInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("BASE") }),
  z.object({
    mode: z.literal("VARIANT"),
    variantProductId: z.string().min(1),
  }),
]);

const requestSchema = z.object({
  action: z.enum(["preview", "submit"]).default("preview"),
  stockGroupId: z.string().min(1),
  type: z.enum(["OUT", "ADJUSTMENT"]),
  stockInput: stockInputSchema,
  inputValue: z.coerce.number().min(0),
  note: z.string().trim().max(500).optional().nullable(),
});

async function loadGroup(storeId: string, stockGroupId: string) {
  const group = await db.productStockGroup.findFirst({
    where: { id: stockGroupId, storeId },
    include: {
      products: {
        where: { isActive: true },
        orderBy: [{ unit: "asc" }, { name: "asc" }],
      },
    },
  });
  if (!group) throw new Error("GROUP_NOT_FOUND");

  return {
    id: group.id,
    displayName: group.displayName,
    baseUnit: group.baseUnit,
    baseStock: group.baseStock,
    products: group.products,
    variants: group.products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      stock: product.stock,
      unitMultiplierToBase: product.unitMultiplierToBase,
      conversionNeedsReview: product.conversionNeedsReview,
    })),
  };
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const storeId = user.storeId || "store-main";
    const input = requestSchema.parse(await request.json());
    const group = await loadGroup(storeId, input.stockGroupId);
    const preview = calculateStockGroupBulkPreview({
      type: input.type,
      stockInput: input.stockInput,
      inputValue: input.inputValue,
      group,
    });

    if (preview.changedVariants.length === 0) {
      return apiError("Tidak ada perubahan stok untuk diajukan", 422, {
        code: "ValidationError",
        errors: { inputValue: ["Tidak ada perubahan stok"] },
      });
    }

    if (input.action === "preview") {
      return NextResponse.json({ data: preview });
    }

    const productById = new Map(group.products.map((product) => [product.id, product]));
    const result = await db.$transaction(async (tx) => {
      const batch = await tx.batchOperation.create({
        data: {
          type: "BULK_STOCK_GROUP_ADJUSTMENT",
          status: "PENDING",
          storeId,
          createdBy: user.id,
          summary: {
            source: "BULK_STOCK_GROUP",
            stockGroupId: preview.stockGroupId,
            productName: preview.displayName,
            type: preview.type,
            stockInput: preview.stockInput,
            inputValue: preview.inputValue,
            beforeBaseStock: preview.beforeBaseStock,
            afterBaseStock: preview.afterBaseStock,
            baseUnit: preview.baseUnit,
            note: input.note?.trim() || null,
            totalCount: preview.changedVariants.length,
            pendingCount: preview.changedVariants.length,
            approvedCount: 0,
            rejectedCount: 0,
            pendingApproval: true,
          },
        },
      });

      for (const variant of preview.changedVariants) {
        const product = productById.get(variant.id);
        if (!product) throw new Error("PRODUCT_NOT_FOUND");
        const beforeSnapshot = productSnapshot({
          ...product,
          stock: variant.beforeStock,
        });
        const afterSnapshot = productSnapshot({
          ...product,
          stock: variant.afterStock,
        });
        const log = await tx.inventoryLog.create({
          data: {
            productId: variant.id,
            type: preview.type,
            reason: stockGroupBulkReason(preview.type),
            quantity:
              preview.type === "OUT"
                ? Math.abs(variant.delta)
                : variant.afterStock,
            note: input.note?.trim() || `Bulk grup stok ${preview.displayName}`,
            createdBy: user.id,
            person: user.name,
            status: "PENDING",
          },
        });
        await tx.batchOperationItem.create({
          data: {
            batchOperationId: batch.id,
            productId: variant.id,
            sku: variant.sku,
            action: stockGroupBulkAction(preview.type),
            beforeSnapshot: beforeSnapshot as unknown as Prisma.InputJsonValue,
            afterSnapshot: afterSnapshot as unknown as Prisma.InputJsonValue,
            inventoryLogId: log.id,
          },
        });
      }

      return {
        batchOperationId: batch.id,
        status: "PENDING",
        preview,
      };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) return apiValidationError(error);
    if (error instanceof Error) {
      if (error.message === "GROUP_NOT_FOUND") {
        return apiError("Stock group not found", 404, { code: "NotFound" });
      }
      if (error.message === "VARIANT_NOT_FOUND") {
        return apiError("Variant product must belong to the group", 422, {
          code: "ValidationError",
        });
      }
      if (error.message === "INVALID_CONVERSION") {
        return apiError("Konversi unit perlu direview sebelum stok bisa diproses", 422, {
          code: "ValidationError",
          errors: { stockInput: ["INVALID_CONVERSION"] },
        });
      }
      if (error.message === "NEGATIVE_STOCK") {
        return apiError("Stok tidak boleh negatif", 422, {
          code: "ValidationError",
          errors: { stock: ["Stok tidak boleh negatif"] },
        });
      }
    }
    return apiError("Failed to process stock group bulk request", 500, {
      code: "InternalError",
    });
  }
}
