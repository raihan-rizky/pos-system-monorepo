import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/responses";
import { requirePermission } from "@/lib/rbac/guard";
import { getBackdatedPurchase } from "@/features/suppliers/backdated-purchases/repositories/backdated-purchase-repository";
import { backdatedPurchaseApiError } from "@/features/suppliers/backdated-purchases/services/backdated-purchase-api-error";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("supplier", "read");
    if (!user.storeId) return apiError("Toko pengguna tidak tersedia.", 403, { code: "Forbidden" });
    const { id } = await params;
    const result = await getBackdatedPurchase(id, { id: user.id, name: user.name, storeId: user.storeId });
    return NextResponse.json({ data: result });
  } catch (error) {
    return backdatedPurchaseApiError(error);
  }
}
