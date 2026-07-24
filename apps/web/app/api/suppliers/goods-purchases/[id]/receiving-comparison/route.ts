import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("supplier", "read");
    if (!user.storeId) {
      return apiError("Toko pengguna tidak tersedia", 403, {
        code: "Forbidden",
      });
    }

    const { id } = await params;
    const repository = new InventoryInboundReceiptRepository();
    const data = await repository.getGoodsPurchaseReceivingComparison(
      user.storeId,
      id,
    );
    if (!data) {
      return apiError("Pembelian Barang tidak ditemukan", 404, {
        code: "NotFound",
      });
    }

    return Response.json({ data });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    return apiError("Gagal memuat perbandingan penerimaan barang", 500, {
      code: "InternalError",
    });
  }
}
