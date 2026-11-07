import { NextResponse } from "next/server";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("inventory", "read");
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const { id } = await context.params;
    const repository = new InventoryInboundReceiptRepository();
    const receipt = await repository.runInTransaction(tx => repository.findReceiptForEdit(tx, {
      storeId: user.storeId!, receiptId: id,
    }));
    if (!receipt?.goodsPurchaseId) return apiError("Penerimaan Barang tidak ditemukan.", 404, { code: "NotFound" });
    if (receipt.status !== "SUBMITTED") return apiError("Penerimaan sudah tidak menunggu persetujuan.", 409, { code: "Conflict" });
    const data = await repository.getGoodsPurchaseReceivingComparison(user.storeId, receipt.goodsPurchaseId);
    if (!data) return apiError("Pembelian Barang tidak ditemukan.", 404, { code: "NotFound" });
    return NextResponse.json({ data });
  } catch (error) {
    return handleAuthError(error) ?? apiError("Gagal memuat pilihan barang penerimaan.", 500, { code: "InternalError" });
  }
}
