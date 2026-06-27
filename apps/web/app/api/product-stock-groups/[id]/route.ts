import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";

import { apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { calculateDisplayStock } from "@/features/product-stock-groups/stock-display";
import {
  buildConversionPairSummaries,
  buildSharedStockInventoryLogRows,
  resolveSharedBaseStock,
  type StockInput,
} from "@/features/product-stock-groups/bulk-stock-groups";

const log = getLogger("api:product-stock-groups:id");

export const dynamic = "force-dynamic";

const stockInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("BASE") }),
  z.object({
    mode: z.literal("VARIANT"),
    variantProductId: z.string().min(1),
  }),
]);

const updateGroupSchema = z.object({
  sharedStock: z.coerce.number(),
  stockInput: stockInputSchema,
  note: z.string().trim().optional().nullable(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("product", "read");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    const group = await db.productStockGroup.findFirst({
      where: { id, storeId },
      include: {
        products: {
          where: { isActive: true },
          include: {
            category: {
              select: { id: true, name: true, icon: true, color: true },
            },
          },
          orderBy: [{ unit: "asc" }, { name: "asc" }],
        },
      },
    });

    if (!group) {
      return apiError("Stock group not found", 404, { code: "NotFound" });
    }

    return NextResponse.json({
      id: group.id,
      storeId: group.storeId,
      groupKey: group.groupKey,
      displayName: group.displayName,
      baseUnit: group.baseUnit,
      baseStock: group.baseStock,
      hasNegativeStock: group.baseStock < 0,
      hasDuplicateUnits:
        new Set(group.products.map((product) => product.unit.trim().toLowerCase()))
          .size !== group.products.length,
      conversionPairs: buildConversionPairSummaries(
        group.products.map((product) => ({
          id: product.id,
          unit: product.unit,
          unitMultiplierToBase: product.unitMultiplierToBase,
        })),
      ),
      variants: group.products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        unitMultiplierToBase: product.unitMultiplierToBase,
        conversionNeedsReview: product.conversionNeedsReview,
        stock: calculateDisplayStock(
          group.baseStock,
          product.unitMultiplierToBase,
        ),
        price: Number(product.price),
        costPrice:
          product.costPrice === null ? null : Number(product.costPrice),
        minStock: product.minStock,
        size: product.size,
        material: product.material,
        category: product.category,
        imageUrl: product.imageUrl,
      })),
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch product stock group", error);
    return apiError("Failed to fetch product stock group", 500, {
      code: "InternalError",
    });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("inventory", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const input = updateGroupSchema.parse(await request.json());

    const result = await db.$transaction(async (tx) => {
      const group = await tx.productStockGroup.findFirst({
        where: { id, storeId },
        include: {
          products: {
            where: { isActive: true },
            select: { id: true, unitMultiplierToBase: true },
          },
        },
      });

      if (!group) throw new Error("GROUP_NOT_FOUND");

      const variants = group.products.map((product) => ({
        id: product.id,
        unitMultiplierToBase: product.unitMultiplierToBase,
      }));
      const nextBaseStock = resolveSharedBaseStock({
        sharedStock: input.sharedStock,
        stockInput: input.stockInput as StockInput,
        variants,
      });

      const updated = await tx.productStockGroup.update({
        where: { id: group.id },
        data: { baseStock: nextBaseStock },
      });

      await tx.inventoryLog.createMany({
        data: buildSharedStockInventoryLogRows({
          groupDisplayName: group.displayName,
          oldBaseStock: group.baseStock,
          newBaseStock: nextBaseStock,
          variants,
          actor: { id: user.id, name: user.name },
          note: input.note,
        }),
      });

      return updated;
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) return apiValidationError(error);
    if (error instanceof Error) {
      if (error.message === "GROUP_NOT_FOUND") {
        return apiError("Stock group not found", 404, { code: "NotFound" });
      }
      if (error.message === "VARIANT_NOT_FOUND") {
        return apiError("Validation error", 422, {
          code: "ValidationError",
          errors: { stockInput: ["Variant product must belong to the group"] },
        });
      }
    }

    log.error("Failed to update product stock group", error);
    return apiError("Failed to update product stock group", 500, {
      code: "InternalError",
    });
  }
}
