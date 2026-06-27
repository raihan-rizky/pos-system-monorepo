import { NextResponse } from "next/server";
import { z } from "zod";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import {
  InventoryManagementError,
  rejectInboundReceipt,
} from "@/features/inventory-management/services/inbound-receipt-service";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const rejectSchema = z.object({
  rejectionReason: z.string().trim().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("inventory.approve", "update");
    const body = rejectSchema.parse(await request.json());
    const { id } = await context.params;
    const data = await rejectInboundReceipt({
      repository: new InventoryInboundReceiptRepository(),
      user: user as InventoryManagementUser & { name?: string | null },
      receiptId: id,
      rejectionReason: body.rejectionReason,
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
    return apiError("Failed to reject inbound receipt", 500, {
      code: "InternalError",
    });
  }
}
