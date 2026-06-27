import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const toggleSchema = z.object({
  isCompleted: z.boolean(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("inventory", "update");
    if (!user.storeId) {
      return apiError("Inventory workflow requires a store-scoped user", 403, {
        code: "Forbidden",
      });
    }

    const { id } = await context.params;
    const input = toggleSchema.parse(await request.json());
    const existing = await db.inventoryTaskChecklistItem.findFirst({
      where: { id, storeId: user.storeId },
      select: { id: true },
    });

    if (!existing) {
      return apiError("Task checklist item not found", 404, {
        code: "NotFound",
      });
    }

    const data = await db.inventoryTaskChecklistItem.update({
      where: { id },
      data: input.isCompleted
        ? {
            isCompleted: true,
            completedById: user.id,
            completedAt: new Date(),
          }
        : {
            isCompleted: false,
            completedById: null,
            completedAt: null,
          },
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
    return apiError("Failed to update task checklist item", 500, {
      code: "InternalError",
    });
  }
}
