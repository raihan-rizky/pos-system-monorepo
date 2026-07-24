import { NextResponse } from "next/server";
import { z } from "zod";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import {
  InventoryManagementError,
  createAndSubmitGoodsPurchaseReceipt,
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

const createSchema = z.object({
  goodsPurchaseId: z.string().min(1),
  note: z.string().trim().max(500).optional().nullable(),
  lines: z.array(
    z.object({
      goodsPurchaseItemId: z.string().min(1),
      matchStatus: z.enum(["MATCHED", "MISMATCHED"]),
      receivedQuantity: z.number().min(0),
      note: z.string().trim().max(500).optional().nullable(),
    }).strict(),
  ).min(1),
}).strict();

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
    const serviceInput = {
      repository: new InventoryInboundReceiptRepository(),
      user: user as InventoryManagementUser & { name?: string | null },
      input,
    };
    const data = await createAndSubmitGoodsPurchaseReceipt(serviceInput);

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
