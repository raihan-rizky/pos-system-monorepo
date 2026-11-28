import { db } from "@pos/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  internalUseCorrectionFields,
  internalUseCorrectionOrder,
  PRODUCT_ONLY_STOCK_NOTE,
  resolveEffectiveInternalUse,
} from "@/features/inventory-management/helpers/internal-use-log";
import {
  isInventoryCorrectionDayLocked,
  lockInventoryLogForCorrection,
  recordInternalUseCorrectionMovements,
} from "@/features/inventory-management/services/internal-use-stock-corrections";
import { StockMutationError } from "@/features/product-stock-groups/stock-mutations";

const logger = getLogger("api:inventory:internal-use");
const note = z.string().trim().min(1).max(500);
const replacement = { productId: z.string().min(1), quantity: z.number().positive().max(Number.MAX_SAFE_INTEGER) };
const expectedCorrectionId = z.string().min(1).nullable();
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("editPending"), ...replacement, note }),
  z.object({ action: z.literal("correct"), ...replacement, note, expectedCorrectionId }),
  z.object({ action: z.literal("cancel"), note, expectedCorrectionId }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError("Periksa produk, jumlah, dan alasan yang diisi.", 422, { code: "ValidationError" });
    }

    const input = parsed.data;
    const pendingEdit = input.action === "editPending";
    const user = await requirePermission(pendingEdit ? "inventory" : "inventory.approve", "update");
    if (pendingEdit) await requirePermission("inventory.internal_use", "update");
    const { storeId } = user;
    if (!storeId || (!pendingEdit && user.role !== "OWNER")) {
      return apiError("Anda tidak memiliki akses untuk mengubah pemakaian ini.", 403, { code: "Forbidden" });
    }
    const { id } = await params;

    return await db.$transaction(async (tx) => {
      if (!(await lockInventoryLogForCorrection(tx, storeId, id))) {
        return apiError("Log pemakaian tidak ditemukan.", 404, { code: "NotFound" });
      }
      const log = await tx.inventoryLog.findFirst({
        where: {
          id, type: "OUT", reason: "USAGE", product: { storeId },
          transactionId: null, sourceTransactionRef: null, suratJalanId: null,
        },
        select: {
          id: true, productId: true, quantity: true, unitCost: true, note: true,
          status: true, createdBy: true, createdAt: true,
          correctionRequests: {
            where: { status: { in: ["APPROVED", "PENDING"] } },
            orderBy: internalUseCorrectionOrder,
            select: internalUseCorrectionFields,
          },
        },
      });
      if (!log) return apiError("Log pemakaian tidak ditemukan.", 404, { code: "NotFound" });

      const batchItem = await tx.batchOperationItem.findFirst({
        where: { inventoryLogId: id }, select: { id: true },
      });
      if (batchItem || log.note?.includes(PRODUCT_ONLY_STOCK_NOTE)) {
        return apiError("Entri ini dikelola lewat alur perubahan stok asalnya.", 409, { code: "Conflict" });
      }

      if (input.action === "editPending") {
        if (log.createdBy !== user.id) {
          return apiError("Hanya pemohon yang bisa mengedit permintaan ini.", 403, { code: "Forbidden" });
        }
        if (log.status !== "PENDING") {
          return apiError("Permintaan sudah diputuskan. Muat ulang Log Stok.", 409, { code: "Conflict" });
        }
        if (input.note.includes(PRODUCT_ONLY_STOCK_NOTE)) {
          return apiError("Masukkan alasan pemakaian yang valid.", 422, { code: "ValidationError" });
        }
        const product = await tx.product.findFirst({
          where: { id: input.productId, storeId, isActive: true },
          select: { id: true, costPrice: true },
        });
        if (!product) return apiError("Produk tidak ditemukan atau sudah nonaktif.", 422, { code: "ValidationError" });

        const updated = await tx.inventoryLog.update({
          where: { id, status: "PENDING" },
          data: {
            productId: product.id, quantity: input.quantity, note: input.note,
            unitCost: product.id === log.productId ? log.unitCost : product.costPrice,
          },
          select: { id: true, status: true },
        });
        return NextResponse.json({ data: updated });
      }

      if (log.status !== "APPROVED") {
        return apiError("Hanya pemakaian yang sudah disetujui yang bisa dikoreksi lewat aksi ini.", 409, { code: "Conflict" });
      }
      if (log.correctionRequests.some((correction) => correction.status === "PENDING")) {
        return apiError("Selesaikan permintaan koreksi yang sedang menunggu keputusan.", 409, { code: "Conflict" });
      }
      const current = resolveEffectiveInternalUse(log, log.correctionRequests);
      if (current.quantity === 0 || (current.correction?.id ?? null) !== input.expectedCorrectionId) {
        return apiError("Pemakaian sudah berubah atau dibatalkan. Muat ulang Log Stok.", 409, { code: "Conflict" });
      }
      if (await isInventoryCorrectionDayLocked(tx, storeId, log.createdAt)) {
        return apiError("Hari stok sudah terkunci setelah pencocokan stok atau check-out.", 409, { code: "Conflict" });
      }

      const product = input.action === "correct"
        ? await tx.product.findFirst({
          where: { id: input.productId, storeId, isActive: true },
          select: { id: true, costPrice: true },
        })
        : null;
      if (input.action === "correct" && !product) {
        return apiError("Produk tidak ditemukan atau sudah nonaktif.", 422, { code: "ValidationError" });
      }
      const to = {
        productId: product?.id ?? current.productId,
        quantity: input.action === "cancel" ? 0 : input.quantity,
        unitCost: product && product.id !== current.productId ? product.costPrice : current.unitCost,
      };
      const decidedAt = new Date();
      const correction = await tx.inventoryLogCorrectionRequest.create({
        data: {
          storeId, inventoryLogId: id, correctedProductId: to.productId,
          correctedQuantity: to.quantity, correctedReason: "USAGE", correctedNote: input.note,
          status: "APPROVED", requestedBy: user.id, decidedBy: user.id, decidedAt,
        },
        select: { id: true },
      });

      await recordInternalUseCorrectionMovements(tx, {
        storeId, sourceId: id, correctionId: correction.id, from: current, to,
        note: input.note, requestedBy: user.id, approvedBy: user.id, approverName: user.name, decidedAt,
      });

      return NextResponse.json({
        data: { id, status: input.action === "cancel" ? "CANCELLED" : "CORRECTED", correctionId: correction.id },
      });
    });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof StockMutationError && error.message === "INSUFFICIENT_STOCK") {
      return apiError("Stok tersedia tidak cukup untuk jumlah hasil koreksi.", 422, { code: "ValidationError" });
    }
    if (error instanceof Error && "code" in error &&
        ["P2025", "P2034", "STALE_STOCK_RELATION"].includes(String(error.code))) {
      return apiError("Data stok berubah. Muat ulang Log Stok, lalu coba lagi.", 409, { code: "Conflict" });
    }
    logger.error("inventory.internal_use.failed", { error });
    return apiError("Gagal menyimpan perubahan pemakaian internal.", 500, { code: "InternalError" });
  }
}
