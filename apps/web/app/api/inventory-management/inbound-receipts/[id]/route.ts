import { NextResponse } from "next/server";
import { z } from "zod";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import {
  InventoryManagementError,
  updateAndSubmitInboundReceipt,
} from "@/features/inventory-management/services/inbound-receipt-service";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const lineSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  expectedQuantity: z.number().positive(),
  receivedQuantity: z.number().min(0),
  status: z.enum([
    "RECEIVED",
    "PARTIAL",
    "MISSING",
    "DAMAGED",
    "MISMATCH",
    "OVER_RECEIVED",
  ]),
  note: z.string().trim().max(500).optional().nullable(),
});

const updateSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("inventory", "update");
    const input = updateSchema.parse(await request.json());
    const { id } = await context.params;
    const data = await updateAndSubmitInboundReceipt({
      repository: new InventoryInboundReceiptRepository(),
      user: user as InventoryManagementUser & { name?: string | null },
      receiptId: id,
      input,
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
    return apiError("Failed to update inbound receipt", 500, {
      code: "InternalError",
    });
  }
}
