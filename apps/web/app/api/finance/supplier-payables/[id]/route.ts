import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { apiError } from "@/lib/api/responses";
import { authorizeInTransaction, canAuthenticatedUserAccessPage, handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { jakartaToday, parseAmount, parsePayable, validDate } from "@/features/keuangan/helpers/supplier-payable-input";
import { ManualPayableReconciliationError, reconcilePayable } from "@/features/keuangan/services/manual-payable-reconciliation";

const log = getLogger("api:finance:supplier-payables:edit");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("expense.payable", "read");
    const editor = await requirePermission("expense.payable.manual", "update");
    if (editor.id !== user.id || editor.storeId !== user.storeId || editor.role !== user.role) return apiError("Sesi pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
    if (!await canAuthenticatedUserAccessPage(user, "/keuangan")) return apiError("Akses halaman Keuangan diperlukan.", 403, { code: "Forbidden" });
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const body = await request.json().catch(() => null);
    const input = body && typeof body === "object" && !Array.isArray(body) ? parsePayable({ ...body, initialPayment: null }) : null;
    if (!input) return apiError("Periksa pemasok, kategori, nominal, dan tanggal hutang.", 422, { code: "ValidationError" });
    const expected = body.expected;
    if (!expected || typeof expected !== "object" || typeof expected.supplierName !== "string" || !parseAmount(expected.amount)
      || !validDate(expected.debtDate) || (expected.dueDate !== null && !validDate(expected.dueDate))
      || (expected.note !== null && typeof expected.note !== "string") || (expected.reportCategory !== null && typeof expected.reportCategory !== "string")) {
      return apiError("Data hutang sebelumnya tidak tersedia. Muat ulang dan coba lagi.", 409, { code: "Conflict" });
    }
    const { id } = await params;
    const storeId = user.storeId;
    await db.$transaction(async tx => {
      const [debt] = await tx.$queryRaw<{ id: string; supplierName: string; amount: string; debtDate: string; dueDate: string | null; note: string | null; reportCategory: string | null }[]>`
        SELECT "id", "supplierName", "amount"::text, "debtDate"::text, "dueDate"::text, "note", "reportCategory"::text FROM "pos_supplier_payables"
        WHERE "id" = ${id} AND "storeId" = ${storeId} AND "goodsPurchaseId" IS NULL FOR UPDATE
      `;
      if (!await authorizeInTransaction(tx, user, { resources: [{ resource: "expense.payable", action: "read" }, { resource: "expense.payable.manual", action: "update" }], page: "/keuangan" })) throw new ManualPayableReconciliationError("Sesi atau izin pengguna berubah. Muat ulang dan coba lagi.", 403);
      if (!debt) throw new ManualPayableReconciliationError("Hutang manual tidak ditemukan.", 404);
      if (debt.supplierName !== expected.supplierName || Math.round(Number(debt.amount) * 100) !== Math.round(Number(expected.amount) * 100)
        || debt.debtDate !== expected.debtDate || debt.dueDate !== expected.dueDate || debt.note !== expected.note || debt.reportCategory !== expected.reportCategory) {
        throw new ManualPayableReconciliationError("Hutang telah berubah. Muat ulang dan periksa kembali sebelum menyimpan.", 409);
      }
      const payments = await tx.supplierPayablePayment.findMany({ where: { payableId: id }, select: { amount: true, paidAt: true, origin: true } });
      const manualPayments = payments.filter(payment => payment.origin !== "AUTO");
      const paidCents = manualPayments.reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0);
      if (paidCents > Math.round(input.amount * 100) || manualPayments.some(payment => payment.paidAt.toISOString().slice(0, 10) < input.debtDate)) {
        throw new ManualPayableReconciliationError("Nominal atau tanggal hutang tidak sesuai dengan riwayat pembayaran. Periksa riwayat terlebih dahulu.", 409);
      }
      const today = jakartaToday();
      const previousAuto = debt.dueDate && debt.dueDate <= today ? { date: debt.dueDate, amount: Math.round(Number(debt.amount) * 100) - paidCents } : null;
      const nextAuto = input.dueDate && input.dueDate <= today ? { date: input.dueDate, amount: Math.round(input.amount * 100) - paidCents } : null;
      const prior = previousAuto && previousAuto.amount > 0 ? previousAuto : null;
      const next = nextAuto && nextAuto.amount > 0 ? nextAuto : null;
      if (prior?.date !== next?.date || prior?.amount !== next?.amount) {
        if (!await authorizeInTransaction(tx, user, { resources: [{ resource: "expense.payable", action: "read" }, { resource: "expense.payable.manual", action: "update" }, { resource: "expense.payable.manual.payment", action: "update" }], page: "/keuangan" })) throw new ManualPayableReconciliationError("Sesi atau izin pengguna berubah. Muat ulang dan coba lagi.", 403);
      }
      const updated = await tx.supplierPayable.updateMany({ where: { id, storeId, goodsPurchaseId: null }, data: {
        supplierName: input.supplierName, amount: input.amount, debtDate: new Date(`${input.debtDate}T00:00:00Z`),
        dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null, reportCategory: input.reportCategory, note: input.note,
      } });
      if (updated.count !== 1) throw new ManualPayableReconciliationError("Hutang manual tidak ditemukan.", 404);
      await reconcilePayable(tx, { storeId, payableId: id, actorId: user.id, todayWib: jakartaToday() });
    }, { isolationLevel: "ReadCommitted" });
    return NextResponse.json({ success: true });
  } catch (error) {
    const authError = handleAuthError(error); if (authError) return authError;
    if (error instanceof ManualPayableReconciliationError) return apiError(error.message, error.status, { code: error.status === 404 ? "NotFound" : "Conflict" });
    log.error("Gagal mengubah hutang manual", error);
    return apiError("Hutang belum dapat diubah. Silakan coba lagi.", 500, { code: "InternalError" });
  }
}
