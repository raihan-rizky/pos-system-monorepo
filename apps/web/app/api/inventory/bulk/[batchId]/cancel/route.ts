import { NextResponse } from "next/server";
import { db } from "@pos/db";

import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { findBulkBatch, mapBulkRequestError, updateBatchDecisionStatus } from "../_shared";

const logger = getLogger("api:inventory:bulk:cancel");
const CANCEL_REASON = "Dibatalkan oleh pemohon";

export async function POST(
  _request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    const user = await requirePermission("inventory", "update");
    const { batchId } = await context.params;

    const result = await db.$transaction(async (tx) => {
      const batch = await findBulkBatch(tx, batchId);
      if (user.role !== "OWNER" && batch.createdBy !== user.id) {
        throw new Error("FORBIDDEN");
      }
      const pendingLogIds = batch.items
        .map((item) => item.inventoryLogId)
        .filter((id): id is string => Boolean(id));

      const cancelled = pendingLogIds.length
        ? await tx.inventoryLog.updateMany({
            where: { id: { in: pendingLogIds }, status: "PENDING" },
            data: {
              status: "REJECTED",
              approvedBy: user.id,
              approverName: user.name,
              decidedAt: new Date(),
              rejectionReason: CANCEL_REASON,
            },
          })
        : { count: 0 };
      const batchSummary = await updateBatchDecisionStatus(tx, batch);

      return { cancelledCount: cancelled.count, batchStatus: batchSummary.status, batchSummary };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return apiError("Forbidden", 403, { code: "Forbidden" });
    }
    logger.error("inventory.bulk.cancel.failed", { error });
    return mapBulkRequestError(error, "Failed to cancel bulk inventory request");
  }
}
