import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";

import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { apiValidationError } from "@/lib/api/responses";
import { mapBulkRequestError, rejectPendingBulkLog } from "../_shared";

const logger = getLogger("api:inventory:bulk:reject-item");
const schema = z.object({
  inventoryLogId: z.string().min(1),
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
    const result = await db.$transaction((tx) =>
      rejectPendingBulkLog(tx, {
        batchId,
        inventoryLogId: input.inventoryLogId,
        approverId: user.id,
        approverName: user.name,
        reason: input.reason,
      }),
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) {
      return apiValidationError(error);
    }
    logger.error("inventory.bulk.reject_item.failed", { error });
    return mapBulkRequestError(error, "Gagal menolak item inventaris massal");
  }
}
