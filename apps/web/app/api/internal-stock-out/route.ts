import { NextResponse } from "next/server";
import { z } from "zod";
import { InternalStockOutRepository } from "@/features/inventory-management/repositories/InternalStockOutRepository";
import {
  createInternalStockOutRequest,
  InventoryManagementError,
} from "@/features/inventory-management/services/internal-stock-out-service";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const createSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  reason: z.string().trim().min(1, "Reason is required"),
});

const querySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requirePermission("inventory.approve", "read");
    const url = new URL(request.url);
    const query = querySchema.parse({
      status: url.searchParams.get("status") ?? undefined,
    });

    const repository = new InternalStockOutRepository();
    const data = await repository.listRequests(
      user.storeId!,
      query.status,
    );

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
    return apiError("Failed to load internal stock-out requests", 500, {
      code: "InternalError",
    });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const body = await request.json();
    const input = createSchema.parse(body);

    const data = await createInternalStockOutRequest({
      repository: new InternalStockOutRepository(),
      user: user as InventoryManagementUser & { name?: string | null },
      input,
    });

    return NextResponse.json({ data }, { status: 201 });
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
    return apiError("Failed to create internal stock-out request", 500, {
      code: "InternalError",
    });
  }
}
