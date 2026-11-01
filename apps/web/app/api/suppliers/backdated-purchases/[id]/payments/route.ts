import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/responses";
import { requirePermission } from "@/lib/rbac/guard";
import { backdatedPurchaseApiError } from "@/features/suppliers/backdated-purchases/services/backdated-purchase-api-error";
import { addHistoricalPayment } from "@/features/suppliers/backdated-purchases/services/backdated-purchase-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("supplier", "read");
    await requirePermission("expense", "update");
    if (!user.storeId) return apiError("Toko pengguna tidak tersedia.", 403, { code: "Forbidden" });
    const { id } = await params;
    const result = await addHistoricalPayment(id, await request.json(), { id: user.id, name: user.name, storeId: user.storeId });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return backdatedPurchaseApiError(error);
  }
}
