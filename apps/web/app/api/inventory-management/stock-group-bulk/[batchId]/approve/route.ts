import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";

import { productSnapshot } from "@/features/batch-operations/helpers/snapshots";
import {
  calculateStockGroupBulkPreview,
  stockGroupBulkReason,
} from "@/features/inventory-management/helpers/stock-group-bulk";
import { summarizeBulkApprovalBundle } from "@/features/bulk-stock-approval/helpers/bundle-status";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const stockInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("BASE") }),
  z.object({
    mode: z.literal("VARIANT"),
    variantProductId: z.string().min(1),
  }),
]);

const approveSchema = z.object({
  stockInput: stockInputSchema.optional(),
  inputValue: z.coerce.number().min(0).optional(),
});

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    const user = await requirePermission("inventory.approve", "update");
    const { batchId } = await context.params;
    const input = approveSchema.parse(await request.json().catch(() => ({})));

    const result = await db.$transaction(async (tx) => {
      const batch = await tx.batchOperation.findUnique({
        where: { id: batchId },
        include: { items: true },
      });
      if (!batch || batch.type !== "BULK_STOCK_GROUP_ADJUSTMENT") {
        throw new Error("BATCH_NOT_FOUND");
      }
      if (batch.status !== "PENDING") throw new Error("ALREADY_DECIDED");

      const summary = asRecord(batch.summary);
      const stockGroupId = String(summary.stockGroupId || "");
      const type = summary.type === "OUT" ? "OUT" : "ADJUSTMENT";
      const stockInput =
        input.stockInput ??
        (summary.stockInput as { mode: "BASE" } | { mode: "VARIANT"; variantProductId: string });
      const inputValue = input.inputValue ?? Number(summary.inputValue);

      const group = await tx.productStockGroup.findFirst({
        where: { id: stockGroupId, storeId: batch.storeId },
        include: {
          products: {
            where: { isActive: true },
            orderBy: [{ unit: "asc" }, { name: "asc" }],
          },
        },
      });
      if (!group) throw new Error("GROUP_NOT_FOUND");

      const preview = calculateStockGroupBulkPreview({
        type,
        stockInput,
        inputValue,
        group: {
          id: group.id,
          displayName: group.displayName,
          baseUnit: group.baseUnit,
          baseStock: group.baseStock,
          variants: group.products.map((product) => ({
            id: product.id,
            name: product.name,
            sku: product.sku,
            unit: product.unit,
            stock: product.stock,
            unitMultiplierToBase: product.unitMultiplierToBase,
            conversionNeedsReview: product.conversionNeedsReview,
          })),
        },
      });

      if (preview.changedVariants.length === 0) {
        throw new Error("NO_CHANGES");
      }

      await tx.productStockGroup.update({
        where: { id: group.id },
        data: { baseStock: preview.afterBaseStock },
      });

      const productById = new Map(group.products.map((product) => [product.id, product]));
      const itemByProductId = new Map(
        batch.items
          .filter((item) => item.productId)
          .map((item) => [item.productId as string, item]),
      );
      const logStatuses: Array<{ status: "APPROVED" | "REJECTED" }> = [];

      for (const variant of preview.changedVariants) {
        const product = productById.get(variant.id);
        const item = itemByProductId.get(variant.id);
        if (!product || !item?.inventoryLogId) continue;

        await tx.inventoryLog.update({
          where: { id: item.inventoryLogId },
          data: {
            type: preview.type,
            reason: stockGroupBulkReason(preview.type),
            quantity:
              preview.type === "OUT"
                ? Math.abs(variant.delta)
                : variant.afterStock,
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
              stock: variant.beforeStock,
            }) as unknown as Prisma.InputJsonValue,
            afterSnapshot: productSnapshot({
              ...product,
              stock: variant.afterStock,
            }) as unknown as Prisma.InputJsonValue,
          },
        });
        logStatuses.push({ status: "APPROVED" });
      }

      const staleItems = batch.items.filter(
        (item) => item.productId && !preview.changedVariants.some((variant) => variant.id === item.productId),
      );
      for (const item of staleItems) {
        if (!item.inventoryLogId) continue;
        await tx.inventoryLog.update({
          where: { id: item.inventoryLogId },
          data: {
            status: "REJECTED",
            approvedBy: user.id,
            approverName: user.name,
            decidedAt: new Date(),
            rejectionReason: "Tidak ada perubahan stok setelah review owner",
          },
        });
        logStatuses.push({ status: "REJECTED" });
      }

      const bundleSummary = summarizeBulkApprovalBundle(logStatuses);
      await tx.batchOperation.update({
        where: { id: batch.id },
        data: {
          status: bundleSummary.status,
          summary: {
            ...summary,
            ...bundleSummary,
            stockInput: preview.stockInput,
            inputValue: preview.inputValue,
            beforeBaseStock: preview.beforeBaseStock,
            afterBaseStock: preview.afterBaseStock,
            reviewedBy: user.id,
            reviewedByName: user.name,
          },
        },
      });

      return { batchId: batch.id, preview, batchSummary: bundleSummary };
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) return apiValidationError(error);
    if (error instanceof Error) {
      if (["BATCH_NOT_FOUND", "GROUP_NOT_FOUND"].includes(error.message)) {
        return apiError("Bundle tidak ditemukan", 404, { code: "NotFound" });
      }
      if (error.message === "ALREADY_DECIDED") {
        return apiError("Bundle sudah diputuskan", 409, { code: "Conflict" });
      }
      if (error.message === "NO_CHANGES") {
        return apiError("Tidak ada perubahan stok untuk disetujui", 422, {
          code: "ValidationError",
        });
      }
      if (error.message === "INVALID_CONVERSION") {
        return apiError("Konversi unit perlu direview sebelum stok bisa diproses", 422, {
          code: "ValidationError",
        });
      }
      if (error.message === "NEGATIVE_STOCK") {
        return apiError("Stok tidak boleh negatif", 422, {
          code: "ValidationError",
        });
      }
    }
    return apiError("Failed to approve stock group bulk request", 500, {
      code: "InternalError",
    });
  }
}
