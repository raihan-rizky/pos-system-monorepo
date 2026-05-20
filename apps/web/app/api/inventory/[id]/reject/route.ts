import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { apiError, apiValidationError } from "@/lib/api/responses";

const logger = getLogger("api:inventory:reject");

const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Alasan penolakan wajib diisi")
    .max(500, "Alasan terlalu panjang"),
});

// POST /api/inventory/[id]/reject
// OWNER-only. Flips status PENDING → REJECTED with a required reason.
// Does not touch product.stock.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("inventory.approve", "update");
    const { id } = await context.params;
    const body = await request.json();
    const { reason } = rejectSchema.parse(body);

    const result = await db.$transaction(async (tx) => {
      const log = await tx.inventoryLog.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!log) throw new Error("NOT_FOUND");
      if (log.status !== "PENDING") {
        throw new Error(`ALREADY_DECIDED:${log.status}`);
      }

      const updatedLog = await tx.inventoryLog.update({
        where: { id },
        data: {
          status: "REJECTED",
          approvedBy: user.id,
          approverName: user.name,
          decidedAt: new Date(),
          rejectionReason: reason,
        },
      });

      return { log: updatedLog };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof z.ZodError) {
      return apiValidationError(error);
    }

    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return apiError("Permintaan tidak ditemukan", 404, { code: "NotFound" });
      }
      if (error.message.startsWith("ALREADY_DECIDED:")) {
        const currentStatus = error.message.split(":")[1];
        return apiError(
          `Permintaan sudah ${currentStatus === "APPROVED" ? "disetujui" : "ditolak"}`,
          409,
          { code: "Conflict" },
        );
      }
    }

    logger.error("inventory.reject.failed", { error });
    return apiError("Failed to reject inventory request", 500, {
      code: "InternalError",
    });
  }
}
