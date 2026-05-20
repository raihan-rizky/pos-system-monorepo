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
  try {
    const user = await requirePermission("inventory.approve", "update");
    const { id } = await context.params;

    const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const log = await tx.inventoryLog.findUnique({
        where: { id },
        select: {
          id: true,
          productId: true,
          type: true,
          quantity: true,
          status: true,
        },
      });

      if (!log) {
        throw new Error("NOT_FOUND");
      }
      if (log.status !== "PENDING") {
        throw new Error(`ALREADY_DECIDED:${log.status}`);
      }

      const product = await tx.product.findUnique({
        where: { id: log.productId },
        select: { id: true, stock: true },
      });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");

      const delta = computeStockDelta(log.type, log.quantity);
      const newStock = product.stock + delta;
      if (newStock < 0) {
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
      if (error.message === "PRODUCT_NOT_FOUND") {
        return apiError("Produk tidak ditemukan", 404, { code: "NotFound" });
      }
      if (error.message.startsWith("NEGATIVE_STOCK:")) {
        const [, available, requested] = error.message.split(":");
        return apiError(
          `Stok tidak mencukupi (tersedia ${available}, diminta ${requested})`,
          422,
          { code: "ValidationError" },
        );
      }
    }

    logger.error("inventory.approve.failed", { error });
    return apiError("Failed to approve inventory request", 500, {
      code: "InternalError",
    });
  }
}
