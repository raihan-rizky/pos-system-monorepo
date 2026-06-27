import { NextResponse } from "next/server";
import { db } from "@pos/db";

import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { approvePendingBulkLog, computeAfterStock, findBulkBatch, mapBulkRequestError, rejectPendingBulkLog, updateBatchDecisionStatus } from "../_shared";
import { resolveProductDisplayStock } from "@/features/product-stock-groups/stock-display";

const logger = getLogger("api:inventory:bulk:approve-all");
const INSUFFICIENT_STOCK_REASON = "Stok tidak mencukupi";

export async function POST(
  _request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    const user = await requirePermission("inventory.approve", "update");
    const { batchId } = await context.params;
    const result = await db.$transaction(async (tx) => {
      const batch = await findBulkBatch(tx, batchId, ["BULK_STOCK_ADJUSTMENT"]);
      const pendingIds = batch.items
        .map((item) => item.inventoryLogId)
        .filter((id): id is string => Boolean(id));

      let approvedCount = 0;
      let rejectedCount = 0;
      for (const inventoryLogId of pendingIds) {
        const log = await tx.inventoryLog.findUnique({ where: { id: inventoryLogId } });
        if (!log || log.status !== "PENDING") continue;
        const product = await tx.product.findUnique({
          where: { id: log.productId },
          include: { stockGroup: true },
        });
        const currentStock = product ? resolveProductDisplayStock(product) : 0;
        if (!product || computeAfterStock(log.type, currentStock, log.quantity) < 0) {
          await rejectPendingBulkLog(tx, {
            batchId,
            inventoryLogId,
            approverId: user.id,
            approverName: user.name,
            reason: INSUFFICIENT_STOCK_REASON,
            skipBatchStatusUpdate: true,
          });
          rejectedCount += 1;
          continue;
        }
        await approvePendingBulkLog(tx, {
          batchId,
          inventoryLogId,
          approverId: user.id,
          approverName: user.name,
          skipBatchStatusUpdate: true,
        });
        approvedCount += 1;
      }

      if (approvedCount > 0 || rejectedCount > 0) {
        await updateBatchDecisionStatus(tx, batch);
      }

      return { approvedCount, rejectedCount };
    }, { timeout: 30000, maxWait: 10000 });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    logger.error("inventory.bulk.approve_all.failed", { error });
    return mapBulkRequestError(error, "Failed to approve bulk inventory request");
  }
}
