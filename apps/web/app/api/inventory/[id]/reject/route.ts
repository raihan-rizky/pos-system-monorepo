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
  const startedAt = Date.now();
  try {
    const user = await requirePermission("inventory.approve", "update");
    const { id } = await context.params;
    const body = await request.json();
    const { reason } = rejectSchema.parse(body);

    logger.info("inventory.approval.received", {
      logId: id,
      approverId: user.id,
      approverName: user.name,
      approverRole: user.role,
      decision: "REJECT",
      rejectionReasonLength: reason.length,
    });

    const result = await db.$transaction(async (tx) => {
      const log = await tx.inventoryLog.findUnique({
        where: { id },
        select: { id: true, status: true, createdBy: true, person: true },
      });
      if (!log) {
        logger.warn("inventory.approval.log_not_found", {
          logId: id,
          approverId: user.id,
          approverRole: user.role,
          decision: "REJECT",
        });
        throw new Error("NOT_FOUND");
      }
      if (log.status !== "PENDING") {
        logger.warn("inventory.approval.already_decided", {
          logId: id,
          currentStatus: log.status,
          requesterId: log.createdBy,
          requesterName: log.person,
          approverId: user.id,
          approverRole: user.role,
          decision: "REJECT",
        });
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

      logger.info("inventory.approval.rejected", {
        logId: id,
        requesterId: log.createdBy,
        requesterName: log.person,
        approverId: user.id,
        approverName: user.name,
        status: updatedLog.status,
        rejectionReasonLength: reason.length,
      });

      return { log: updatedLog };
    });

    logger.info("inventory.approval.completed", {
      logId: result.log.id,
      status: result.log.status,
      approverId: user.id,
      approverRole: user.role,
      decision: "REJECT",
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) {
      logger.warn("inventory.approval.auth_failed", {
        decision: "REJECT",
        durationMs: Date.now() - startedAt,
        error,
      });
      return authErr;
    }

    if (error instanceof z.ZodError) {
      logger.warn("inventory.approval.validation_failed", {
        decision: "REJECT",
        durationMs: Date.now() - startedAt,
        errors: error.flatten().fieldErrors,
      });
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
          { code: "Conflict", extra: { currentStatus } },
        );
      }
    }

    logger.error("inventory.reject.failed", {
      error,
      durationMs: Date.now() - startedAt,
    });
    return apiError("Failed to reject inventory request", 500, {
      code: "InternalError",
    });
  }
}
