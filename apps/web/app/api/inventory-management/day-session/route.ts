import { NextResponse } from "next/server";
import { z } from "zod";
import { buildInventoryDaySessionPreview } from "@/features/inventory-management/services/inventory-day-session";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
    });
    const now = query.date ? new Date(`${query.date}T05:00:00.000+07:00`) : new Date();
    const data = await buildInventoryDaySessionPreview(user.storeId, now);

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
    return apiError("Failed to load inventory day session", 500, {
      code: "InternalError",
    });
  }
}
