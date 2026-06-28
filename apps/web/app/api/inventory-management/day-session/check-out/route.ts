import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { jakartaDateKey } from "@/features/inventory-management/helpers/inventory-management-rules";
import {
  buildInventoryDayCompletion,
  loadInventoryDaySession,
  loadStockRiskItems,
} from "@/features/inventory-management/services/inventory-day-session";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const checkOutSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    if (!user.storeId) {
      return apiError("Inventory workflow requires a store-scoped user", 403, {
        code: "Forbidden",
      });
    }

    const input = checkOutSchema.parse(await request.json().catch(() => ({})));
    const now = new Date();
    const dateKey = jakartaDateKey(now);
    const session = await loadInventoryDaySession(user.storeId, dateKey);
    if (!session || session.status === "NOT_CHECKED_IN") {
      return apiError("Inventory day must be checked in first", 409, {
        code: "Conflict",
      });
    }

    const [completion, stockRisk] = await Promise.all([
      buildInventoryDayCompletion(user.storeId, dateKey, now),
      loadStockRiskItems(user.storeId),
    ]);
    if (completion.blockers.length > 0) {
      return apiError("Daily tasks are not complete", 409, {
        code: "Conflict",
        extra: { blockers: completion.blockers, completion },
      });
    }

    const snapshot = {
      checkedOutAt: now.toISOString(),
      note: input.note || null,
      completion,
      stockRisk,
      morningCheckSnapshot: session.morningCheckSnapshot,
    } as unknown as Prisma.InputJsonObject;

    const data = await db.inventoryDaySession.update({
      where: { id: session.id },
      data: {
        status: "CHECKED_OUT",
        checkOutById: user.id,
        checkOutByName: user.name ?? user.username,
        checkedOutAt: now,
        checkOutSnapshot: snapshot,
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
    return apiError("Failed to check out inventory day", 500, {
      code: "InternalError",
    });
  }
}
