import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";

import { apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  assertUniqueActiveUnits,
  generateVariantSku,
} from "@/features/product-stock-groups/bulk-stock-groups";
import { buildProductPriceLogEntries } from "@/lib/product-price-logs/price-log-entries";

const log = getLogger("api:product-stock-groups:variants");

const conversionPairSchema = z.object({
  fromQuantity: z.coerce.number().positive(),
  toProductId: z.string().min(1),
  toQuantity: z.coerce.number().positive(),
});

const createVariantSchema = z.object({
  unit: z.string().trim().min(1),
  price: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0).nullable().optional(),
  stock: z.coerce.number(),
  minStock: z.coerce.number().min(0),
  conversionPair: conversionPairSchema.optional().nullable(),
  note: z.string().trim().optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("product", "create");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const input = createVariantSchema.parse(await request.json());

    const result = await db.$transaction(async (tx) => {
      const group = await tx.productStockGroup.findFirst({
        where: { id, storeId },
        include: {
          products: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              sku: true,
              unit: true,
              categoryId: true,
              material: true,
              size: true,
              unitMultiplierToBase: true,
            },
          },
        },
      });
      if (!group || group.products.length === 0) throw new Error("GROUP_NOT_FOUND");

      assertUniqueActiveUnits([...group.products, { unit: input.unit }]);

      const source = group.products[0];
      const sku = generateVariantSku({
        sourceSku: source.sku,
        unit: input.unit,
      });
      const existingSku = await tx.product.findUnique({ where: { sku } });
      if (existingSku) throw new Error("SKU_EXISTS");

      const target = input.conversionPair
        ? group.products.find(
            (product) => product.id === input.conversionPair?.toProductId,
          )
        : null;
      if (input.conversionPair && !target) {
        throw new Error("CONVERSION_PAIR_PRODUCT_NOT_FOUND");
      }

      const unitMultiplierToBase =
        input.conversionPair && target
          ? (input.conversionPair.toQuantity * target.unitMultiplierToBase) /
            input.conversionPair.fromQuantity
          : 1;

      const product = await tx.product.create({
        data: {
          name: group.displayName || source.name,
          sku,
          price: input.price,
          costPrice: input.costPrice ?? null,
          stock: input.stock,
          minStock: input.minStock,
          unit: input.unit,
          material: source.material,
          size: source.size,
          categoryId: source.categoryId,
          storeId,
          stockGroupId: group.id,
          unitMultiplierToBase,
          conversionNeedsReview: !input.conversionPair,
        },
      });

      const priceLogEntries = buildProductPriceLogEntries({
        productId: product.id,
        storeId,
        before: null,
        after: {
          price: input.price,
          costPrice: input.costPrice ?? null,
        },
        actor: user,
        source: "MANUAL",
        note: input.note,
      });
      if (priceLogEntries.length > 0) {
        await tx.productPriceLog.createMany({ data: priceLogEntries });
      }

      const txWithActivity = tx as typeof tx & {
        productStockGroupActivity?: {
          create: (args: unknown) => Promise<unknown>;
        };
      };
      await txWithActivity.productStockGroupActivity?.create({
        data: {
          stockGroupId: group.id,
          type: "VARIANT_ADDED",
          productId: product.id,
          note: input.note ?? null,
          createdBy: user.id,
          person: user.name ?? null,
          before: null,
          after: {
            productId: product.id,
            sku,
            unit: input.unit,
            unitMultiplierToBase,
            conversionNeedsReview: !input.conversionPair,
          },
        },
      });

      return product;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) return apiValidationError(error);
    if (error instanceof Error) {
      if (error.message === "GROUP_NOT_FOUND") {
        return apiError("Stock group not found", 404, { code: "NotFound" });
      }
      if (error.message === "SKU_EXISTS") {
        return apiError("Generated SKU already exists", 409, {
          code: "Conflict",
        });
      }
      if (
        [
          "DUPLICATE_UNIT",
          "UNIT_REQUIRED",
          "CONVERSION_PAIR_PRODUCT_NOT_FOUND",
        ].includes(error.message)
      ) {
        return apiError("Validation error", 422, {
          code: "ValidationError",
          errors: { unit: [error.message] },
        });
      }
    }

    log.error("Failed to add stock group variant", error);
    return apiError("Failed to add stock group variant", 500, {
      code: "InternalError",
    });
  }
}
