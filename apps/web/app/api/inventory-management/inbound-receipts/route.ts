import { NextResponse } from "next/server";
import { z } from "zod";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import {
  InventoryManagementError,
  createInboundReceipt,
} from "@/features/inventory-management/services/inbound-receipt-service";
import type {
  InboundReceiptStatus,
  InventoryManagementUser,
} from "@/features/inventory-management/types/inventory-management";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const statusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "NEEDS_REVISION",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

const lineSchema = z.object({
  productId: z.string().min(1),
  shoppingRequestItemId: z.string().min(1).optional().nullable(),
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

const createSchema = z.object({
  supplierId: z.string().min(1).optional().nullable(),
  shoppingRequestId: z.string().min(1).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const user = await requirePermission("inventory", "read");
    if (!user.storeId) {
      return apiError("Inventory workflow requires a store-scoped user", 403, {
        code: "Forbidden",
      });
    }
    const url = new URL(request.url);
    const rawStatus = url.searchParams.get("status");
    const status = rawStatus ? statusSchema.parse(rawStatus) : undefined;
    const repository = new InventoryInboundReceiptRepository();
    const data = await repository.listInboundReceipts(user.storeId, {
      status: status as InboundReceiptStatus | undefined,
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
    return apiError("Failed to load inbound receipts", 500, {
      code: "InternalError",
    });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const input = createSchema.parse(await request.json());
    const data = await createInboundReceipt({
      repository: new InventoryInboundReceiptRepository(),
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
    return apiError("Failed to create inbound receipt", 500, {
      code: "InternalError",
    });
  }
}
