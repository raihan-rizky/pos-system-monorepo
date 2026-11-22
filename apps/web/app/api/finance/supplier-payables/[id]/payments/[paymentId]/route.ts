import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { apiError } from "@/lib/api/responses";
import { authorizeInTransaction, canAuthenticatedUserAccessPage, handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { jakartaToday, parseAmount, validDate } from "@/features/keuangan/helpers/supplier-payable-input";
import { ManualPayableReconciliationError, reconcilePayable } from "@/features/keuangan/services/manual-payable-reconciliation";

const log = getLogger("api:finance:supplier-payables:edit-payment");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  try {
    const user = await requirePermission("expense.payable", "read");
    const editor = await requirePermission("expense.payable.manual.payment", "update");
    if (editor.id !== user.id || editor.storeId !== user.storeId || editor.role !== user.role) return apiError("Sesi pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
    if (!await canAuthenticatedUserAccessPage(user, "/keuangan")) return apiError("Akses halaman Keuangan diperlukan.", 403, { code: "Forbidden" });
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const body = await request.json().catch(() => null) as { amount?: unknown; paidAt?: unknown; expected?: { amount?: unknown; paidAt?: unknown; origin?: unknown } } | null;
    const amount = parseAmount(body?.amount);
    const todayWib = jakartaToday();
    if (!amount || !validDate(body?.paidAt) || body.paidAt > todayWib) return apiError("Periksa nominal dan tanggal pembayaran.", 422, { code: "ValidationError" });
    const expected = body?.expected;
    if (!expected || !parseAmount(expected.amount) || !validDate(expected.paidAt) || !["MANUAL", "AUTO", "CORRECTED_AUTO"].includes(String(expected.origin))) {
      return apiError("Data pembayaran sebelumnya tidak tersedia. Muat ulang dan coba lagi.", 409, { code: "Conflict" });
    }
    const paidAt = body.paidAt;
    const { id, paymentId } = await params;
    const storeId = user.storeId;
    await db.$transaction(async tx => {
      const [debt] = await tx.$queryRaw<{ id: string; amount: string; debtDate: string }[]>`
        SELECT "id", "amount"::text, "debtDate"::text FROM "pos_supplier_payables"
        WHERE "id" = ${id} AND "storeId" = ${storeId} AND "goodsPurchaseId" IS NULL FOR UPDATE
      `;
      if (!await authorizeInTransaction(tx, user, { resources: [{ resource: "expense.payable", action: "read" }, { resource: "expense.payable.manual.payment", action: "update" }], page: "/keuangan" })) throw new ManualPayableReconciliationError("Sesi atau izin pengguna berubah. Muat ulang dan coba lagi.", 403);
      if (!debt) throw new ManualPayableReconciliationError("Hutang manual tidak ditemukan.", 404);
      const scope = { storeId, payableId: id, actorId: user.id, todayWib };
      const storedId = paymentId === `auto:${id}` ? (await reconcilePayable(tx, scope)).automaticPaymentId : paymentId;
      const payments = await tx.supplierPayablePayment.findMany({ where: { payableId: id }, select: {
        id: true, amount: true, paidAt: true, origin: true,
        transferAllocation: { select: { amount: true, expense: { select: { occurredAt: true } } } },
      } });
      const payment = payments.find(row => row.id === storedId);
      if (!payment) throw new ManualPayableReconciliationError("Pembayaran hutang tidak ditemukan.", 404);
      if (Math.round(Number(payment.amount) * 100) !== Math.round(Number(expected.amount) * 100)
        || payment.paidAt.toISOString().slice(0, 10) !== expected.paidAt || payment.origin !== expected.origin) {
        throw new ManualPayableReconciliationError("Pembayaran telah berubah. Muat ulang dan periksa kembali sebelum menyimpan.", 409);
      }
      const otherPaidCents = payments.filter(row => row.id !== payment.id && row.origin !== "AUTO")
        .reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
      if (paidAt < debt.debtDate || otherPaidCents + Math.round(amount * 100) > Math.round(Number(debt.amount) * 100)) {
        throw new ManualPayableReconciliationError("Tanggal atau nominal pembayaran tidak sesuai dengan hutang.", 409);
      }
      if (payment.transferAllocation) {
        const transferDate = new Date(payment.transferAllocation.expense.occurredAt.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
        if (paidAt !== transferDate || Math.round(amount * 100) < Math.round(Number(payment.transferAllocation.amount) * 100)) {
          throw new ManualPayableReconciliationError("Perubahan tidak sesuai dengan alokasi transfer. Ubah atau lepaskan alokasi terlebih dahulu.", 409);
        }
      }
      const updated = await tx.supplierPayablePayment.updateMany({ where: { id: payment.id, payableId: id }, data: {
        amount, paidAt: new Date(`${paidAt}T00:00:00Z`), ...(payment.origin === "AUTO" ? { origin: "CORRECTED_AUTO", automaticKey: null } : {}),
      } });
      if (updated.count !== 1) throw new ManualPayableReconciliationError("Pembayaran hutang tidak ditemukan.", 404);
      await reconcilePayable(tx, scope);
    }, { isolationLevel: "ReadCommitted" });
    return NextResponse.json({ success: true });
  } catch (error) {
    const authError = handleAuthError(error); if (authError) return authError;
    if (error instanceof ManualPayableReconciliationError) return apiError(error.message, error.status, { code: error.status === 404 ? "NotFound" : "Conflict" });
    log.error("Gagal mengubah pembayaran hutang", error);
    return apiError("Pembayaran belum dapat diubah. Silakan coba lagi.", 500, { code: "InternalError" });
  }
}
