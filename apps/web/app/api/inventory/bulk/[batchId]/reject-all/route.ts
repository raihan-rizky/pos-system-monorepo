import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";

import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { apiValidationError } from "@/lib/api/responses";
import { findBulkBatch, mapBulkRequestError, updateBatchDecisionStatus } from "../_shared";

const logger = getLogger("api:inventory:bulk:reject-all");
const schema = z.object({
  reason: z.string().trim().min(1, "Alasan penolakan wajib diisi").max(500),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    const user = await requirePermission("inventory.approve", "update");
    const { batchId } = await context.params;
    const input = schema.parse(await request.json());
    const result = await db.$transaction(async (tx) => {
      const batch = await findBulkBatch(tx, batchId);
      const pendingIds = batch.items
        .map((item) => item.inventoryLogId)
        .filter((id): id is string => Boolean(id));

      const rejected = pendingIds.length
        ? await tx.inventoryLog.updateMany({
            where: {
              id: { in: pendingIds },
              status: "PENDING",
            },
            data: {
              status: "REJECTED",
              approvedBy: user.id,
              approverName: user.name,
              decidedAt: new Date(),
              rejectionReason: input.reason,
            },
          })
        : { count: 0 };

      const batchSummary = await updateBatchDecisionStatus(tx, batch);

      return { rejectedCount: rejected.count, batchStatus: batchSummary.status, batchSummary };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) {
      return apiValidationError(error);
    }
    logger.error("inventory.bulk.reject_all.failed", { error });
    return mapBulkRequestError(error, "Gagal menolak permintaan inventaris massal");
  }
}
