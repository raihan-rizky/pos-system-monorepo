import { NextResponse } from "next/server";
import { z } from "zod";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import {
  getReceivingQueue,
  InventoryManagementError,
} from "@/features/inventory-management/services/inbound-receipt-service";
import type { InventoryManagementUser } from "@/features/inventory-management/types/inventory-management";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const querySchema = z.object({
  search: z.string().trim().optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requirePermission("inventory", "read");
    const url = new URL(request.url);
    const query = querySchema.parse({
      search: url.searchParams.get("search") ?? undefined,
      take: url.searchParams.get("take") ?? undefined,
    });

    const data = await getReceivingQueue({
      repository: new InventoryInboundReceiptRepository(),
      user: user as InventoryManagementUser & { name?: string | null },
      input: query,
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
        code: error.code === "STORE_REQUIRED" ? "Forbidden" : "ValidationError",
      });
    }
    return apiError("Failed to load receiving queue", 500, {
      code: "InternalError",
    });
  }
}
