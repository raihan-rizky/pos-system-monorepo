import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";

import { productSnapshot } from "@/features/batch-operations/helpers/snapshots";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { apiValidationError } from "@/lib/api/responses";
import { computeAfterStock, findBatchLogItem, findBulkBatch, mapBulkRequestError } from "../_shared";

const logger = getLogger("api:inventory:bulk:edit-item");
const schema = z.object({
  inventoryLogId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    await requirePermission("inventory.approve", "update");
    const { batchId } = await context.params;
    const input = schema.parse(await request.json());

    const result = await db.$transaction(async (tx) => {
      const batch = await findBulkBatch(tx, batchId);
      const item = findBatchLogItem(batch, input.inventoryLogId);
      const log = await tx.inventoryLog.findUnique({ where: { id: input.inventoryLogId } });
      if (!log) throw new Error("LOG_NOT_FOUND");
      if (log.status !== "PENDING") throw new Error(`ALREADY_DECIDED:${log.status}`);
      const product = await tx.product.findUnique({ where: { id: log.productId } });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");

      const afterStock = computeAfterStock(log.type, product.stock, input.quantity);
      const projected = { ...productSnapshot(product), stock: afterStock };
      const updatedLog = await tx.inventoryLog.update({
        where: { id: log.id },
        data: { quantity: input.quantity },
      });
      await tx.batchOperationItem.update({
        where: { id: item.id },
        data: { afterSnapshot: projected as unknown as Prisma.InputJsonValue },
      });

      return { log: updatedLog, projectedStock: afterStock };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) {
      return apiValidationError(error);
    }
    logger.error("inventory.bulk.edit_item.failed", { error });
    return mapBulkRequestError(error, "Failed to edit bulk inventory item");
  }
}
