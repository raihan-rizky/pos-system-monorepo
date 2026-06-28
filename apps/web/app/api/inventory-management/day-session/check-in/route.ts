import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { jakartaDateKey } from "@/features/inventory-management/helpers/inventory-management-rules";
import {
  WORKSPACE_SAFETY_ITEMS,
  loadProductionMaterials,
  loadStockRiskItems,
} from "@/features/inventory-management/services/inventory-day-session";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const materialCountSchema = z.object({
  productId: z.string().min(1),
  actualQuantity: z.number().finite().min(0),
  note: z.string().trim().max(240).optional().nullable(),
});

const safetyCheckSchema = z.object({
  id: z.string().min(1),
  checked: z.boolean(),
});

const checkInSchema = z.object({
  materialCounts: z.array(materialCountSchema).min(1),
  safetyChecks: z.array(safetyCheckSchema).min(1),
  stockRiskAcknowledged: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    if (!user.storeId) {
      return apiError("Inventory workflow requires a store-scoped user", 403, {
        code: "Forbidden",
      });
    }

    const input = checkInSchema.parse(await request.json());
    if (!input.stockRiskAcknowledged) {
      return apiError("Stock risk review must be acknowledged", 422, {
        code: "ValidationError",
      });
    }

    const missingSafety = WORKSPACE_SAFETY_ITEMS.filter(
      (item) => !input.safetyChecks.some((check) => check.id === item.id && check.checked),
    );
    if (missingSafety.length > 0) {
      return apiError("Workspace & Safety checklist is incomplete", 422, {
        code: "ValidationError",
      });
    }

    const dateKey = jakartaDateKey(new Date());
    const [stockRisk, productionMaterials] = await Promise.all([
      loadStockRiskItems(user.storeId),
      loadProductionMaterials(user.storeId),
    ]);
    const materialIds = new Set(productionMaterials.map((item) => item.product.id));
    const countedIds = new Set(input.materialCounts.map((item) => item.productId));
    const missingMaterials = [...materialIds].filter((id) => !countedIds.has(id));
    if (missingMaterials.length > 0) {
      return apiError("Production material counts are incomplete", 422, {
        code: "ValidationError",
      });
    }

    const snapshot = {
      checkedAt: new Date().toISOString(),
      stockRisk,
      productionMaterials,
      materialCounts: input.materialCounts,
      safetyChecks: input.safetyChecks.map((check) => ({
        ...check,
        label: WORKSPACE_SAFETY_ITEMS.find((item) => item.id === check.id)?.label ?? check.id,
      })),
      stockRiskAcknowledged: input.stockRiskAcknowledged,
    } satisfies Prisma.InputJsonObject;

    const data = await db.inventoryDaySession.upsert({
      where: { storeId_periodKey: { storeId: user.storeId, periodKey: dateKey } },
      create: {
        storeId: user.storeId,
        periodKey: dateKey,
        status: "CHECKED_IN",
        morningCheckSnapshot: snapshot,
        checkInById: user.id,
        checkInByName: user.name ?? user.username,
        checkedInAt: new Date(),
      },
      update: {
        status: "CHECKED_IN",
        morningCheckSnapshot: snapshot,
        checkInById: user.id,
        checkInByName: user.name ?? user.username,
        checkedInAt: new Date(),
        checkOutById: null,
        checkOutByName: null,
        checkedOutAt: null,
        checkOutSnapshot: Prisma.JsonNull,
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
    return apiError("Failed to check in inventory day", 500, {
      code: "InternalError",
    });
  }
}
