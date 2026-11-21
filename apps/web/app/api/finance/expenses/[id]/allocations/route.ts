import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { apiError } from "@/lib/api/responses";
import { canAuthenticatedUserAccessPage, handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:finance:transfer-allocations");

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("expense", "read");
    for (const [target, action] of [["expense.payable", "read"], ["expense.manual_transfer.allocation", "update"]] as const) {
      const authorized = await requirePermission(target, action);
      if (authorized.id !== user.id || authorized.storeId !== user.storeId || authorized.role !== user.role) return apiError("Sesi pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
    }
    if (!await canAuthenticatedUserAccessPage(user, "/keuangan")) return apiError("Akses halaman Keuangan diperlukan.", 403, { code: "Forbidden" });
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const { id } = await params;
    const transfer = await db.expense.findFirst({ where: { id, storeId: user.storeId, deletedAt: null, manualPurchasePaymentMethod: "TRANSFER",
      goodsPurchaseId: null, shoppingRequestId: null }, select: { id: true, manualTransferAllocations: { select: { amount: true, payableId: true, paymentId: true,
        payable: { select: { supplierName: true, reportCategory: true } }, payment: { select: { paidAt: true, origin: true } } }, orderBy: { id: "asc" } } } });
    if (!transfer) return apiError("Transfer manual tidak ditemukan.", 404, { code: "NotFound" });
    return NextResponse.json({ allocations: transfer.manualTransferAllocations.map(row => ({ payableId: row.payableId, paymentId: row.paymentId,
      amount: Number(row.amount), supplierName: row.payable.supplierName, reportCategory: row.payable.reportCategory,
      paidAt: row.payment.paidAt.toISOString().slice(0, 10), origin: row.payment.origin })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const authError = handleAuthError(error); if (authError) return authError;
    log.error("Gagal memuat alokasi transfer", error);
    return apiError("Alokasi transfer belum dapat dimuat.", 500, { code: "InternalError" });
  }
}
