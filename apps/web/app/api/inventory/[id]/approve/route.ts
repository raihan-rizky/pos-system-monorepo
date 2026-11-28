import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import {
  applyProductStockDelta,
  StockMutationError,
} from "@/features/product-stock-groups/stock-mutations";

const logger = getLogger("api:inventory:approve");

function computeStockDelta(
  type: "IN" | "OUT" | "ADJUSTMENT",
  quantity: number,
): number {
  if (type === "OUT") return -Math.abs(quantity);
  if (type === "IN") return Math.abs(quantity);
  return quantity;
}

function isProductOnlyStockLog(note: string | null | undefined) {
  return note?.includes("Mode: Stok Produk Ini - stok grup tidak diubah") ?? false;
}

// POST /api/inventory/[id]/approve
// OWNER-only. Flips status PENDING → APPROVED inside a transaction and
// applies the stock delta. The conditional write also checks the usage values
// in case the requester edited them after the approval read the log.
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
          reason: true,
          quantity: true,
          note: true,
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

      const approvesInternalUse = log.type === "OUT" && log.reason === "USAGE";
      const decision = {
        where: {
          id,
          status: "PENDING" as const,
          ...(approvesInternalUse ? { productId: log.productId, quantity: log.quantity, note: log.note } : {}),
        },
        data: {
          status: "APPROVED" as const,
          approvedBy: user.id,
          approverName: user.name,
          decidedAt: new Date(),
        },
      };
      // Claim a usage request before applying the exact values we just read.
      const claimed = approvesInternalUse ? await tx.inventoryLog.update(decision) : null;
      const delta = computeStockDelta(log.type, log.quantity);
      const stockResult = isProductOnlyStockLog(log.note)
        ? null
        : await applyProductStockDelta(tx, {
            storeId: user.storeId || "store-main",
            productId: log.productId,
            delta,
          });

      const updatedLog = claimed ?? await tx.inventoryLog.update(decision);

      logger.info("inventory.approval.stock_updated", {
        logId: id,
        productId: log.productId,
        requesterId: log.createdBy,
        requesterName: log.person,
        approverId: user.id,
        approverName: user.name,
        beforeStock: stockResult?.beforeStock ?? null,
        afterStock: stockResult?.afterStock ?? null,
        stockDelta: delta,
        stockMutationSkipped: stockResult === null,
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
      if ("code" in error && error.code === "P2025") {
        return apiError("Permintaan sudah berubah. Muat ulang Log Stok sebelum menyetujui.", 409, { code: "Conflict" });
      }
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
      if (
        error.message === "PRODUCT_NOT_FOUND" ||
        (error instanceof StockMutationError &&
          error.message === "PRODUCT_NOT_FOUND")
      ) {
        return apiError("Produk tidak ditemukan", 404, { code: "NotFound" });
      }
      if (
        error.message.startsWith("NEGATIVE_STOCK:") ||
        (error instanceof StockMutationError &&
          error.message === "INSUFFICIENT_STOCK")
      ) {
        const availableNum =
          error instanceof StockMutationError
            ? Number(error.details.available ?? 0)
            : Number(error.message.split(":")[1]);
        const requestedNum =
          error instanceof StockMutationError
            ? Number(error.details.requested ?? 0)
            : Number(error.message.split(":")[2]);
        return apiError(
          `Stok tidak mencukupi (tersedia ${availableNum}, diminta ${requestedNum})`,
          422,
          {
            code: "ValidationError",
            extra: { available: availableNum, requested: requestedNum },
          },
        );
      }
      if (
        error instanceof StockMutationError &&
        error.message === "CONVERSION_NEEDS_REVIEW"
      ) {
        return apiError(
          "Konversi unit produk perlu direview sebelum stok bisa diproses",
          422,
          {
            code: "ValidationError",
            errors: { stock: ["CONVERSION_NEEDS_REVIEW"] },
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
