import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";

const logger = getLogger("api:inventory:cancel");

// POST /api/inventory/[id]/cancel
// Self-cancel by the requester. Marks the row REJECTED with a system reason.
// Authorization: log.createdBy === user.id AND status === PENDING.
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    // We deliberately use inventory.update (the requester gate) rather than
    // inventory.approve — only the requester themselves can self-cancel.
    const user = await requirePermission("inventory", "update");
    const { id } = await context.params;

    const result = await db.$transaction(async (tx) => {
      const log = await tx.inventoryLog.findUnique({
        where: { id },
        select: { id: true, status: true, createdBy: true },
      });
      if (!log) throw new Error("NOT_FOUND");
      if (log.status !== "PENDING") {
        throw new Error(`ALREADY_DECIDED:${log.status}`);
      }
      if (log.createdBy !== user.id) {
        throw new Error("FORBIDDEN_CANCEL");
      }

      const updatedLog = await tx.inventoryLog.update({
        where: { id },
        data: {
          status: "REJECTED",
          approvedBy: user.id,
          approverName: user.name,
          decidedAt: new Date(),
          rejectionReason: "Dibatalkan oleh pemohon",
        },
      });

      return { log: updatedLog };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

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
      if (error.message === "FORBIDDEN_CANCEL") {
        return apiError(
          "Tidak diizinkan membatalkan permintaan ini",
          403,
          { code: "Forbidden" },
        );
      }
    }

    logger.error("inventory.cancel.failed", { error });
    return apiError("Failed to cancel inventory request", 500, {
      code: "InternalError",
    });
  }
}
