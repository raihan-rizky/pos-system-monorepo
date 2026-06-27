import { NextResponse } from "next/server";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import {
  InventoryManagementError,
  approveInboundReceipt,
} from "@/features/inventory-management/services/inbound-receipt-service";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("inventory.approve", "update");
    const { id } = await context.params;
    const data = await approveInboundReceipt({
      repository: new InventoryInboundReceiptRepository(),
      user: user as InventoryManagementUser & { name?: string | null },
      receiptId: id,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof InventoryManagementError) {
      return apiError(error.message, error.status, {
        code:
          error.code === "STORE_REQUIRED"
            ? "Forbidden"
            : error.code === "NOT_FOUND"
              ? "NotFound"
              : error.code === "CONFLICT"
                ? "Conflict"
                : "ValidationError",
      });
    }
    return apiError("Failed to approve inbound receipt", 500, {
      code: "InternalError",
    });
  }
}
