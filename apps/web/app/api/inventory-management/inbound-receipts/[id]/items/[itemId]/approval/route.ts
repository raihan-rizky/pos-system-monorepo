import { NextResponse } from "next/server";
import { z } from "zod";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import {
  approveInboundReceiptItem,
  InventoryManagementError,
} from "@/features/inventory-management/services/inbound-receipt-service";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await requirePermission(
      "inventory.inbound_receipt.approve",
      "update",
    );
    const { expectedUpdatedAt } = z.object({ expectedUpdatedAt: z.string().datetime().optional() }).strict()
      .parse(await request.json().catch(() => ({})));
    const { id, itemId } = await context.params;
    const result = await approveInboundReceiptItem({
      repository: new InventoryInboundReceiptRepository(),
      user: user as InventoryManagementUser & { name?: string | null },
      receiptId: id,
      itemId,
      expectedUpdatedAt,
    });

    return NextResponse.json(result);
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof z.ZodError) return apiError("Data persetujuan tidak valid", 422, { code: "ValidationError" });
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
    return apiError("Gagal menyetujui produk Penerimaan Barang", 500, {
      code: "InternalError",
    });
  }
}
