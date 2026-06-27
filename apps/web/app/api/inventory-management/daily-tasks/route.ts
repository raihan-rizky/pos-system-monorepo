import { NextResponse } from "next/server";
import { z } from "zod";
import { InventoryManagementRepository } from "@/features/inventory-management/repositories/InventoryManagementRepository";
import { jakartaDateKey } from "@/features/inventory-management/helpers/inventory-management-rules";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
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
    const query = querySchema.parse({
      date: url.searchParams.get("date") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const repository = new InventoryManagementRepository();
    const data = await repository.findDailyTasks(user.storeId, {
      dateKey: query.date ?? jakartaDateKey(new Date()),
      limit: query.limit ?? 25,
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
    return apiError("Failed to load daily inventory tasks", 500, {
      code: "InternalError",
    });
  }
}
