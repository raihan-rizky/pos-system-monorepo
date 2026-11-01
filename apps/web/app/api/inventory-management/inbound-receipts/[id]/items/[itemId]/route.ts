import { NextResponse } from "next/server";
import { z } from "zod";
import { inboundPricingSchema } from "@/features/inventory-management/api/inbound-pricing-schema";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import {
  editInboundReceiptItem,
  InventoryManagementError,
  removeInboundReceiptItem,
} from "@/features/inventory-management/services/inbound-receipt-service";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const pricingUnitSchema = z.object({
  productId: z.string().min(1).nullable(),
  costPrice: z.number().min(0).max(9_999_999_999.99).nullable(),
  price: z.number().min(0).max(9_999_999_999.99).nullable(),
  hargaAgen: z.number().min(0).max(9_999_999_999.99).nullable(),
  hargaDinas: z.number().min(0).max(9_999_999_999.99).nullable(),
}).strict();

const editItemSchema = z
  .object({
    matchStatus: z.enum(["MATCHED", "MISMATCHED"]),
    receivedQuantity: z.number().min(0),
    supplierCostPrice: z.number().min(0).max(9_999_999_999.99).optional(),
    pricing: z.union([inboundPricingSchema, z.object({ version: z.literal(2), units: z.array(pricingUnitSchema.extend({ priceEdited: z.boolean().optional() })) }).strict()]).nullable().optional(),
    note: z.string().trim().max(500).optional().nullable(),
    expectedUpdatedAt: z.string().datetime().optional(),
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
      expectedUpdatedAt: input.expectedUpdatedAt,
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

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requirePermission(
      "inventory.inbound_receipt.edit",
      "update",
    );
    const { expectedUpdatedAt } = z.object({ expectedUpdatedAt: z.string().datetime().optional() }).strict()
      .parse(await request.json().catch(() => ({})));
    const { id, itemId } = await context.params;
    const result = await removeInboundReceiptItem({
      repository: new InventoryInboundReceiptRepository(),
      user: user as InventoryManagementUser & { name?: string | null },
      receiptId: id,
      itemId,
      expectedUpdatedAt,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(
      error,
      "Gagal menghapus produk Penerimaan Barang",
    );
  }
}
