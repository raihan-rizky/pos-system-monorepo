import { NextResponse } from "next/server";
import { z } from "zod";
import { InternalStockOutRepository } from "@/features/inventory-management/repositories/InternalStockOutRepository";
import {
  rejectInternalStockOutRequest,
  InventoryManagementError,
} from "@/features/inventory-management/services/internal-stock-out-service";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const rejectSchema = z.object({
  rejectionReason: z.string().trim().min(1, "Rejection reason is required"),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requirePermission("inventory.approve", "update");
    const body = await request.json();
    const { rejectionReason } = rejectSchema.parse(body);

    const data = await rejectInternalStockOutRequest({
      repository: new InternalStockOutRepository(),
      user: user as InventoryManagementUser & { name?: string | null },
      requestId: params.id,
      rejectionReason,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof z.ZodError) {
      return apiError("Validation error", 422, {
        code: "ValidationError",
        errors: error.flatten().fieldErrors,
      });
    }
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
    return apiError("Failed to reject request", 500, {
      code: "InternalError",
    });
  }
}
