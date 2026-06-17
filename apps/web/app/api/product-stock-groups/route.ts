import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";

import { apiError, apiList, apiValidationError, buildPaginationMeta, parsePagination } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  buildSharedStockInventoryLogRows,
  resolveConfirmedGroupStock,
} from "@/features/product-stock-groups/bulk-stock-groups";

const log = getLogger("api:product-stock-groups");

const stockInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("BASE") }),
  z.object({
    mode: z.literal("VARIANT"),
    variantProductId: z.string().min(1),
  }),
]);

const productAssignmentSchema = z.object({
  productId: z.string().min(1),
  unitMultiplierToBase: z.coerce.number().positive().optional(),
});

const conversionPairSchema = z.object({
  fromProductId: z.string().min(1),
  fromQuantity: z.coerce.number().positive(),
  toProductId: z.string().min(1),
  toQuantity: z.coerce.number().positive(),
});

const createGroupSchema = z.object({
  displayName: z.string().trim().min(1),
  baseUnit: z.string().trim().min(1).optional(),
  sharedStock: z.coerce.number().optional(),
  stockInput: stockInputSchema.optional(),
  sourceProductId: z.string().min(1).optional(),
  conversionPairs: z.array(conversionPairSchema).optional(),
  products: z.array(productAssignmentSchema).min(2),
  note: z.string().trim().optional().nullable(),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("product", "read");
    const storeId = user.storeId || "store-main";
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const categoryId = searchParams.get("categoryId")?.trim() ?? "";
    const minVariants = Number(searchParams.get("minVariants") ?? "0") || 0;
    const { page, limit } = parsePagination(searchParams, {
      defaultLimit: 50,
      maxLimit: 100,
    });

    const groups = await db.productStockGroup.findMany({
      where: {
        storeId,
        ...(search
          ? { displayName: { contains: search, mode: "insensitive" as const } }
          : {}),
        ...(categoryId
          ? { products: { some: { isActive: true, categoryId } } }
          : {}),
      },
      include: {
        products: {
          where: { isActive: true },
          select: {
            id: true,
            unit: true,
            unitMultiplierToBase: true,
          },
        },
      },
      orderBy: { displayName: "asc" },
    });

    const filtered = groups.filter((group) => group.products.length >= minVariants);
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit).map((group) => ({
      id: group.id,
      displayName: group.displayName,
      baseUnit: group.baseUnit,
      baseStock: group.baseStock,
      variantCount: group.products.length,
      variants: group.products,
    }));

    return apiList(data, buildPaginationMeta(filtered.length, page, limit));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to list product stock groups", error);
    return apiError("Failed to list product stock groups", 500, {
      code: "InternalError",
    });
  }
}

export async function POST(request: Request) {
  try {
    const productUser = await requirePermission("product", "update");
    const inventoryUser = await requirePermission("inventory", "update");
    const storeId = productUser.storeId || "store-main";
    const input = createGroupSchema.parse(await request.json());

    const result = await db.$transaction(async (tx) => {
      const productIds = input.products.map((product) => product.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, storeId, isActive: true },
        select: { id: true, unit: true, stock: true },
      });
      if (products.length !== productIds.length) throw new Error("PRODUCT_NOT_FOUND");

      const resolved = resolveConfirmedGroupStock({
        products,
        assignments: input.products,
        sourceProductId: input.sourceProductId,
        conversionPairs: input.conversionPairs,
        sharedStock: input.sharedStock,
        stockInput: input.stockInput,
      });

      const group = await tx.productStockGroup.create({
        data: {
          storeId,
          groupKey: `manual:${storeId}:${Date.now()}`,
          displayName: input.displayName,
          baseUnit: input.baseUnit ?? resolved.baseUnit ?? "pcs",
          baseStock: resolved.baseStock,
        },
      });

      for (const variant of resolved.variants) {
        await tx.product.update({
          where: { id: variant.id },
          data: {
            stockGroupId: group.id,
            unitMultiplierToBase: variant.unitMultiplierToBase,
            conversionNeedsReview: false,
          },
        });
      }

      await tx.inventoryLog.createMany({
        data: buildSharedStockInventoryLogRows({
          groupDisplayName: group.displayName,
          oldBaseStock: 0,
          newBaseStock: resolved.baseStock,
          variants: resolved.variants,
          actor: { id: inventoryUser.id, name: inventoryUser.name },
          note: input.note,
        }),
      });

      return { ...group, conflictWarnings: resolved.conflictWarnings };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) return apiValidationError(error);
    if (error instanceof Error) {
      if (error.message === "PRODUCT_NOT_FOUND") {
        return apiError("Some products were not found", 404, {
          code: "NotFound",
        });
      }
      if (error.message === "VARIANT_NOT_FOUND") {
        return apiError("Validation error", 422, {
          code: "ValidationError",
          errors: { stockInput: ["Variant product must be selected products"] },
        });
      }
      if (
        [
          "DUPLICATE_UNIT",
          "UNIT_REQUIRED",
          "SOURCE_PRODUCT_NOT_FOUND",
          "CONVERSION_PAIR_PRODUCT_NOT_FOUND",
          "INVALID_CONVERSION_PAIR",
          "CONVERSION_PAIR_DISCONNECTED",
          "INVALID_MULTIPLIER",
          "SHARED_STOCK_REQUIRED",
        ].includes(error.message)
      ) {
        return apiError("Validation error", 422, {
          code: "ValidationError",
          errors: { products: [error.message] },
        });
      }
    }

    log.error("Failed to create product stock group", error);
    return apiError("Failed to create product stock group", 500, {
      code: "InternalError",
    });
  }
}
