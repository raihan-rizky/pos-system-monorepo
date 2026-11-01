import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/responses";
import { requirePermission } from "@/lib/rbac/guard";
import { backdatedPurchaseApiError } from "@/features/suppliers/backdated-purchases/services/backdated-purchase-api-error";
import { createHistoricalPurchase } from "@/features/suppliers/backdated-purchases/services/backdated-purchase-service";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("supplier", "create");
    await requirePermission("expense", "create");
    if (!user.storeId) return apiError("Toko pengguna tidak tersedia.", 403, { code: "Forbidden" });
    const result = await createHistoricalPurchase(await request.json(), { id: user.id, name: user.name, storeId: user.storeId });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return backdatedPurchaseApiError(error);
  }
}
