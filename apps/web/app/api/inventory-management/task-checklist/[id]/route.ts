import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  dueTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]),
});

async function findStoreChecklistItem(id: string, storeId: string) {
  return db.inventoryTaskChecklistItem.findFirst({
    where: { id, storeId },
    select: { id: true },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("inventory", "delete");
    if (!user.storeId) {
      return apiError("Inventory workflow requires a store-scoped user", 403, {
        code: "Forbidden",
      });
    }

    const { id } = await context.params;
    const existing = await findStoreChecklistItem(id, user.storeId);
    if (!existing) {
      return apiError("Task checklist item not found", 404, {
        code: "NotFound",
      });
    }

    const input = updateSchema.parse(await request.json());
    const data = await db.inventoryTaskChecklistItem.update({
      where: { id },
      data: {
        title: input.title,
        dueTime: input.dueTime || null,
        priority: input.priority,
        updatedById: user.id,
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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("inventory", "delete");
    if (!user.storeId) {
      return apiError("Inventory workflow requires a store-scoped user", 403, {
        code: "Forbidden",
      });
    }

    const { id } = await context.params;
    const existing = await findStoreChecklistItem(id, user.storeId);
    if (!existing) {
      return apiError("Task checklist item not found", 404, {
        code: "NotFound",
      });
    }

    await db.inventoryTaskChecklistItem.delete({ where: { id } });
    return NextResponse.json({ data: { id } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    return apiError("Failed to delete task checklist item", 500, {
      code: "InternalError",
    });
  }
}
