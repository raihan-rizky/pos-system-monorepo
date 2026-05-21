import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";

const logger = getLogger("api:inventory:approve");

function computeStockDelta(
  type: "IN" | "OUT" | "ADJUSTMENT",
  quantity: number,
): number {
  if (type === "OUT") return -Math.abs(quantity);
  if (type === "IN") return Math.abs(quantity);
  return quantity;
}

// POST /api/inventory/[id]/approve
// OWNER-only. Flips status PENDING → APPROVED inside a transaction and
// applies the stock delta. The status check inside the transaction is the
// race guard: a second concurrent approver reads a non-PENDING row and
// receives 409.
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  try {
    const user = await requirePermission("inventory.approve", "update");
    const { id } = await context.params;

    logger.info("inventory.approval.received", {
      logId: id,
      approverId: user.id,
      approverName: user.name,
      approverRole: user.role,
      decision: "APPROVE",
    });

    const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const log = await tx.inventoryLog.findUnique({
        where: { id },
        select: {
          id: true,
          productId: true,
          type: true,
          quantity: true,
          status: true,
          createdBy: true,
          person: true,
        },
      });

      if (!log) {
        logger.warn("inventory.approval.log_not_found", {
          logId: id,
          approverId: user.id,
          approverRole: user.role,
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
        });
        throw new Error(`ALREADY_DECIDED:${log.status}`);
      }

      const product = await tx.product.findUnique({
        where: { id: log.productId },
        select: { id: true, stock: true },
      });
      if (!product) {
        logger.warn("inventory.approval.product_not_found", {
          logId: id,
          productId: log.productId,
          requesterId: log.createdBy,
          approverId: user.id,
        });
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const delta = computeStockDelta(log.type, log.quantity);
      const newStock = product.stock + delta;
      if (newStock < 0) {
        logger.warn("inventory.approval.rejected.negative_stock", {
          logId: id,
          productId: log.productId,
          requesterId: log.createdBy,
          requesterName: log.person,
          approverId: user.id,
          approverRole: user.role,
          beforeStock: product.stock,
          stockDelta: delta,
          requestedQuantity: Math.abs(delta),
        });
        throw new Error(
          `NEGATIVE_STOCK:${product.stock}:${Math.abs(delta)}`,
        );
      }

      const [updatedLog] = await Promise.all([
        tx.inventoryLog.update({
          where: { id },
          data: {
            status: "APPROVED",
            approvedBy: user.id,
            approverName: user.name,
            decidedAt: new Date(),
          },
        }),
        tx.product.update({
          where: { id: product.id },
          data: { stock: newStock },
        }),
      ]);

      logger.info("inventory.approval.stock_updated", {
        logId: id,
        productId: product.id,
        requesterId: log.createdBy,
        requesterName: log.person,
        approverId: user.id,
        approverName: user.name,
        beforeStock: product.stock,
        afterStock: newStock,
        stockDelta: delta,
      });

      return { log: updatedLog };
    });

    logger.info("inventory.approval.completed", {
      logId: result.log.id,
      status: result.log.status,
      approverId: user.id,
      approverRole: user.role,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) {
      logger.warn("inventory.approval.auth_failed", {
        durationMs: Date.now() - startedAt,
        error,
      });
      return authErr;
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
      if (error.message === "PRODUCT_NOT_FOUND") {
        return apiError("Produk tidak ditemukan", 404, { code: "NotFound" });
      }
      if (error.message.startsWith("NEGATIVE_STOCK:")) {
        const [, available, requested] = error.message.split(":");
        const availableNum = Number(available);
        const requestedNum = Number(requested);
        return apiError(
          `Stok tidak mencukupi (tersedia ${available}, diminta ${requested})`,
          422,
          {
            code: "ValidationError",
            extra: { available: availableNum, requested: requestedNum },
          },
        );
      }
    }

    logger.error("inventory.approve.failed", {
      error,
      durationMs: Date.now() - startedAt,
    });
    return apiError("Failed to approve inventory request", 500, {
      code: "InternalError",
    });
  }
}
