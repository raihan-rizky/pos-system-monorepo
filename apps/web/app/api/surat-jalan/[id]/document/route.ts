import { NextResponse } from "next/server";
import { db, type Prisma } from "@pos/db";
import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { applyProductStockDelta, StockMutationError } from "@/features/product-stock-groups/stock-mutations";
import { lockStockMutationRows, isStockMutationConflict } from "@/features/product-stock-groups/stock-group-lock";
import { lockTransactionForStockMutation } from "@/features/transactions-stock/services/transaction-reversal-service";
import { planSuratJalanDocumentUpdate, SuratJalanDocumentError } from "@/features/surat-jalan/helpers/surat-jalan-document";
import type { SuratJalanStatus } from "@/features/surat-jalan/types/surat-jalan";

export const dynamic = "force-dynamic";
const log = getLogger("api:surat-jalan:document");
const schema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  recipientName: z.string().trim().min(1).max(200),
  quantities: z.record(z.string(), z.number().finite().min(0)),
  documentNames: z.record(z.string(), z.string().trim().max(300)).default({}),
  keterangan: z.record(z.string(), z.string().trim().max(500)).default({}),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("surat_jalan", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await db.$transaction(async tx => {
      const anchor = await tx.suratJalan.findFirst({ where: { id, storeId }, select: { transactionId: true } });
      if (!anchor) throw new SuratJalanDocumentError("Surat jalan tidak ditemukan.", 404);
      const status = await lockTransactionForStockMutation(tx, { storeId, transactionId: anchor.transactionId });
      if (!status || ["VOIDED", "REFUNDED"].includes(status)) throw new SuratJalanDocumentError("Transaksi sudah dibatalkan atau dikembalikan.", 409);

      const record = await tx.suratJalan.findFirst({
        where: { id, storeId },
        include: {
          items: { include: { product: { select: { id: true, stockGroupId: true, unitMultiplierToBase: true } } } },
          transaction: { include: { items: true, suratJalan: { include: { items: true } } } },
        },
      });
      if (!record) throw new SuratJalanDocumentError("Surat jalan tidak ditemukan.", 404);
      if (record.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) throw new SuratJalanDocumentError("Surat jalan sudah diubah pengguna lain. Muat data terbaru sebelum menyimpan kembali.", 409);

      const needsProof = record.transaction.stockDeductionSource === "SURAT_JALAN" && record.status === "CONFIRMED" &&
        record.items.some(item => (parsed.data.quantities[item.transactionItemId] ?? item.quantity) !== item.quantity);
      const stockProof = needsProof ? await tx.inventoryLog.findMany({
        where: { suratJalanId: id, transactionId: record.transactionId, status: "APPROVED", product: { storeId } },
        select: { productId: true, type: true, quantity: true, stockBaseDelta: true, stockGroupIdSnapshot: true, unitMultiplierSnapshot: true },
      }) : [];
      const plan = planSuratJalanDocumentUpdate({
        record: { ...record, status: record.status as SuratJalanStatus, items: record.items.map(item => ({ ...item, keterangan: item.keterangan ?? "" })) },
        invoiceItems: record.transaction.items,
        otherRecords: record.transaction.suratJalan,
        stockDeductionSource: record.transaction.stockDeductionSource,
        changes: parsed.data,
        stockProducts: record.items.map(item => item.product),
        stockProof,
      });

      if (plan.stockDeltas.length) {
        const productIds = plan.stockDeltas.map(movement => movement.productId);
        const stockGroupIds = productIds.map(productId => record.items.find(item => item.productId === productId)!.product.stockGroupId).filter((id): id is string => id !== null);
        const locks = await lockStockMutationRows(tx, { storeId, productIds, stockGroupIds });
        if (locks.lockedProductIds.length !== productIds.length || locks.lockedStockGroupIds.length !== new Set(stockGroupIds).size) {
          throw new SuratJalanDocumentError("Produk atau grup stok berubah. Muat ulang surat jalan sebelum mengubah jumlah.", 409);
        }
        const currentProducts = await tx.product.findMany({
          where: { id: { in: productIds }, storeId },
          select: { id: true, stockGroupId: true, unitMultiplierToBase: true },
        });
        for (const productId of productIds) {
          const previous = record.items.find(item => item.productId === productId)!.product;
          const current = currentProducts.find(product => product.id === productId);
          if (!current || current.stockGroupId !== previous.stockGroupId || current.unitMultiplierToBase !== previous.unitMultiplierToBase) {
            throw new SuratJalanDocumentError("Satuan atau grup stok berubah. Muat ulang surat jalan sebelum mengubah jumlah.", 409);
          }
        }
      }

      const inventoryRows: Prisma.InventoryLogCreateManyInput[] = [];
      // All affected rows are locked before returning stock and then deducting it.
      const orderedDeltas = [...plan.stockDeltas].sort((a, b) => Math.sign(b.delta) - Math.sign(a.delta) || a.productId.localeCompare(b.productId));
      for (const movement of orderedDeltas) {
        const stock = await applyProductStockDelta(tx, { storeId, ...movement });
        const product = record.items.find(item => item.productId === movement.productId)!.product;
        const multiplier = product.stockGroupId ? Number(product.unitMultiplierToBase) : 1;
        if (stock.productId !== movement.productId || stock.stockGroupId !== product.stockGroupId ||
          !Number.isFinite(stock.baseDelta) || Math.abs(stock.baseDelta - movement.delta * multiplier) > 1e-8) {
          throw new SuratJalanDocumentError("Satuan atau bukti stok berubah. Muat ulang surat jalan sebelum mengubah jumlah.", 409);
        }
        inventoryRows.push({
          productId: movement.productId, transactionId: record.transactionId, sourceTransactionRef: record.transactionId,
          suratJalanId: id, type: movement.delta > 0 ? "IN" : "OUT", reason: movement.delta > 0 ? "SALE_RETURN" : "SALE",
          quantity: Math.abs(movement.delta), stockBaseDelta: stock.baseDelta, stockGroupIdSnapshot: stock.stockGroupId,
          unitMultiplierSnapshot: multiplier, note: `Perubahan jumlah Surat Jalan ${record.number}`,
          createdBy: user.id, person: user.name ?? null,
        });
      }
      const keptIds = plan.items.map(item => item.id);
      const updated = await tx.suratJalan.update({
        where: { id, updatedAt: record.updatedAt },
        data: {
          recipientName: plan.recipientName,
          items: {
            deleteMany: { id: { in: record.items.filter(item => !keptIds.includes(item.id)).map(item => item.id) } },
            update: plan.items.map(item => ({ where: { id: item.id }, data: {
              productName: item.productName, quantity: item.quantity, keterangan: item.keterangan,
              ...(needsProof ? { stockBefore: null, stockAfter: null } : {}),
            } })),
          },
        },
        include: { items: true },
      });
      if (inventoryRows.length) await tx.inventoryLog.createMany({ data: inventoryRows });
      return updated;
    }, { maxWait: 5000, timeout: 20000 });
    return NextResponse.json(result);
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof SuratJalanDocumentError) return apiError(error.message, error.status, { code: error.status === 404 ? "NotFound" : error.status === 409 ? "Conflict" : "ValidationError" });
    if (isStockMutationConflict(error)) return apiError("Data stok berubah saat diproses. Muat ulang surat jalan sebelum mencoba lagi.", 409, { code: "Conflict" });
    if (error instanceof StockMutationError) return apiError(error.message === "INSUFFICIENT_STOCK" ? "Stok gudang tidak mencukupi untuk jumlah pengiriman ini." : "Data stok atau konversi satuan perlu diperiksa.", 409, { code: "Conflict" });
    if ((error as { code?: string })?.code === "P2025") return apiError("Surat jalan sudah diubah. Muat data terbaru sebelum menyimpan kembali.", 409, { code: "Conflict" });
    if (error instanceof SyntaxError) return apiError("Data surat jalan tidak valid.", 422, { code: "ValidationError" });
    log.error("Gagal menyimpan perubahan surat jalan", error);
    return apiError("Perubahan surat jalan belum berhasil disimpan. Silakan coba lagi.", 500, { code: "InternalError" });
  }
}
