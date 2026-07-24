import { NextResponse } from "next/server";
import { z } from "zod";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import {
  editInboundReceiptItem,
  InventoryManagementError,
  removeInboundReceiptItem,
} from "@/features/inventory-management/services/inbound-receipt-service";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const editItemSchema = z
  .object({
    matchStatus: z.enum(["MATCHED", "MISMATCHED"]),
    receivedQuantity: z.number().min(0),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

type RouteContext = {
  params: Promise<{ id: string; itemId: string }>;
};

function handleRouteError(error: unknown, fallbackMessage: string) {
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
  return apiError(fallbackMessage, 500, { code: "InternalError" });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requirePermission(
      "inventory.inbound_receipt.edit",
      "update",
    );
    const input = editItemSchema.parse(await request.json());
    const { id, itemId } = await context.params;
    const result = await editInboundReceiptItem({
      repository: new InventoryInboundReceiptRepository(),
      user: user as InventoryManagementUser & { name?: string | null },
      receiptId: id,
      itemId,
      input,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(
      error,
      "Gagal mengubah produk Penerimaan Barang",
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requirePermission(
      "inventory.inbound_receipt.edit",
      "update",
    );
    const { id, itemId } = await context.params;
    const result = await removeInboundReceiptItem({
      repository: new InventoryInboundReceiptRepository(),
      user: user as InventoryManagementUser & { name?: string | null },
      receiptId: id,
      itemId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(
      error,
      "Gagal menghapus produk Penerimaan Barang",
    );
  }
}
