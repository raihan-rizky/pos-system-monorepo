import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const periodTypeSchema = z.enum(["DAILY", "WEEKLY"]);
const prioritySchema = z.enum(["LOW", "NORMAL", "HIGH"]);

const querySchema = z.object({
  periodType: periodTypeSchema,
  periodKey: z.string().trim().min(1).max(20),
});

const createSchema = querySchema.extend({
  title: z.string().trim().min(1).max(160),
  dueTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  priority: prioritySchema.default("NORMAL"),
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
      periodType: url.searchParams.get("periodType"),
      periodKey: url.searchParams.get("periodKey"),
    });

    const data = await db.inventoryTaskChecklistItem.findMany({
      where: {
        storeId: user.storeId,
        periodType: query.periodType,
        periodKey: query.periodKey,
      },
      orderBy: [{ isCompleted: "asc" }, { createdAt: "asc" }],
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
    return apiError("Failed to load task checklist", 500, {
      code: "InternalError",
    });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "delete");
    if (!user.storeId) {
      return apiError("Inventory workflow requires a store-scoped user", 403, {
        code: "Forbidden",
      });
    }

    const input = createSchema.parse(await request.json());
    const data = await db.inventoryTaskChecklistItem.create({
      data: {
        storeId: user.storeId,
        periodType: input.periodType,
        periodKey: input.periodKey,
        title: input.title,
        dueTime: input.dueTime || null,
        priority: input.priority,
        createdById: user.id,
      },
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
    return apiError("Failed to create task checklist item", 500, {
      code: "InternalError",
    });
  }
}
