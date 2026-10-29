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
import {
  isStockMutationConflict,
} from "@/features/product-stock-groups/stock-group-lock";

import { prepareGroupPricingMutation, synchronizeGroupPricingMutation, GroupPricingError } from "@/features/product-stock-groups/group-pricing-service";

const log = getLogger("api:product-stock-groups:variants");

const conversionPairSchema = z.object({
  fromQuantity: z.coerce.number().positive(),
  toProductId: z.string().min(1),
  toQuantity: z.coerce.number().positive(),
});

const createVariantSchema = z.object({
  unit: z.string().trim().min(1),
  price: z.coerce.number().min(0).optional().default(0),
  pricingMode: z.enum(["AUTO", "MANUAL"]).optional().default("MANUAL"),
  priceFactor: z.object({ numerator: z.string().regex(/^\d+$/), denominator: z.string().regex(/^[1-9]\d*$/) }).optional(),
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
      const prepared = await prepareGroupPricingMutation(tx, { storeId, groupIds: [id] });
      const group = await tx.productStockGroup.findFirst({
        where: { id, storeId },
        include: {
          products: {
            where: { isActive: true },
            select: {
              id: true,
              stockGroupId: true,
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
      if (!group) throw new GroupPricingError("Grup satuan tidak ditemukan.", 404);

      assertUniqueActiveUnits([...group.products, { unit: input.unit }]);

      const source = group.products[0];
      if (!source) throw new GroupPricingError("Tambahkan produk acuan sebelum menambah satuan.", 422);
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

      const [pricing] = await synchronizeGroupPricingMutation(tx, {
        prepared, actor: user, source: "MANUAL", note: input.note,
        changes: { [id]: { members: [{ productId: product.id, mode: input.pricingMode,
          ...(input.pricingMode === "MANUAL" ? { price: input.price, costPrice: input.costPrice ?? null } : input.priceFactor ? { factor: input.priceFactor } : {}),
        }] } },
      });

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

      const projected = pricing.members.find(member => member.productId === product.id)!;
      return { ...product, price: projected.price, costPrice: projected.costPrice, pricing: pricing.config.members[product.id] };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) return apiValidationError(error);
    if (error instanceof GroupPricingError) return apiError(error.message, error.status, { code: error.status === 409 ? "Conflict" : error.status === 404 ? "NotFound" : "ValidationError" });
    if (isStockMutationConflict(error)) {
      return apiError(
        "Data grup stok berubah saat varian ditambahkan. Silakan coba lagi.",
        409,
        { code: "Conflict" },
      );
    }
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
