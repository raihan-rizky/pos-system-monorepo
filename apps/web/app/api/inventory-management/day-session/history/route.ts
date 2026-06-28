import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const querySchema = z.object({
  take: z.coerce.number().int().min(1).max(60).optional(),
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
      take: url.searchParams.get("take") ?? undefined,
    });
    const data = await db.inventoryDaySession.findMany({
      where: { storeId: user.storeId },
      orderBy: { periodKey: "desc" },
      take: query.take ?? 30,
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
    return apiError("Failed to load inventory day session history", 500, {
      code: "InternalError",
    });
  }
}
