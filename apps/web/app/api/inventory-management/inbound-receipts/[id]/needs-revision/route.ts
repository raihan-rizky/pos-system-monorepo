import { NextResponse } from "next/server";
import { z } from "zod";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import {
  InventoryManagementError,
  needsRevisionInboundReceipt,
} from "@/features/inventory-management/services/inbound-receipt-service";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const needsRevisionSchema = z.object({
  revisionReason: z.string().trim().min(1, "Revision reason is required"),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("inventory.inbound_receipt.revise", "update");
    const body = needsRevisionSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) {
      return apiError("Revision reason is required", 422, {
        code: "ValidationError",
      });
    }

    const { id } = await context.params;
    const data = await needsRevisionInboundReceipt({
      repository: new InventoryInboundReceiptRepository(),
      user: user as InventoryManagementUser & { name?: string | null },
      receiptId: id,
      revisionReason: body.data.revisionReason,
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
    return apiError("Failed to mark inbound receipt as needs revision", 500, {
      code: "InternalError",
    });
  }
}
