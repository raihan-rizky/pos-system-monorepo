import { NextResponse } from "next/server";
import { getInventorySummary } from "@/features/inventory-management";
import { InventoryManagementRepository } from "@/features/inventory-management/repositories/InventoryManagementRepository";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

export async function GET() {
  try {
    const user = await requirePermission("inventory", "read");
    const summary = await getInventorySummary({
      user: user as InventoryManagementUser,
      repository: new InventoryManagementRepository(),
    });

    return NextResponse.json({ data: summary });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    return apiError("Failed to load inventory summary", 500, {
      code: "InternalError",
    });
  }
}
