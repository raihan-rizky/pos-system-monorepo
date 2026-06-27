import { NextResponse } from "next/server";
import { InternalStockOutRepository } from "@/features/inventory-management/repositories/InternalStockOutRepository";
import {
  approveInternalStockOutRequest,
  InventoryManagementError,
} from "@/features/inventory-management/services/internal-stock-out-service";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requirePermission("inventory.approve", "update");

    const data = await approveInternalStockOutRequest({
      repository: new InternalStockOutRepository(),
      user: user as InventoryManagementUser & { name?: string | null },
      requestId: params.id,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof InventoryManagementError) {
      const codeMap: Record<string, import("@/lib/api/responses").ApiErrorCode> = {
        STORE_REQUIRED: "Forbidden",
        VALIDATION_ERROR: "ValidationError",
        NOT_FOUND: "NotFound",
        CONFLICT: "Conflict",
        INVALID_RECEIPT_LINE: "ValidationError",
      };
      return apiError(error.message, error.status, {
        code: codeMap[error.code] || "InternalError",
      });
    }
    if (error instanceof Error && error.message === "INTERNAL_STOCK_OUT_REQUEST_NOT_FOUND") {
      return apiError("Request not found", 404, { code: "NotFound" });
    }
    if (error instanceof Error && error.message === "INTERNAL_STOCK_OUT_REQUEST_CONFLICT") {
      return apiError("Request status changed", 409, { code: "Conflict" });
    }
    return apiError("Failed to approve request", 500, {
      code: "InternalError",
    });
  }
}
