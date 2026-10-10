import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiError } from "@/lib/api/responses";
import { listShoppingRequestUnitVariants } from "@/features/suppliers/shopping-requests/services/shopping-request-unit-variants";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("supplier", "read");
    if (!user.storeId) return apiError("Toko pengguna tidak tersedia", 403);
    const productId = new URL(request.url).searchParams.get("productId")?.trim();
    if (!productId) return apiError("Pilih barang terlebih dahulu", 400);
    const variants = await listShoppingRequestUnitVariants(productId, user.storeId);
    return NextResponse.json({ data: variants });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    return apiError("Pilihan satuan belum bisa dimuat", 500);
  }
}
