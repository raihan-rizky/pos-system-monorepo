import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";

import { apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  buildSharedStockInventoryLogRows,
  resolveConfirmedGroupStock,
} from "@/features/product-stock-groups/bulk-stock-groups";
import {
  isStockMutationConflict,
  lockStockMutationRows,
  StockMutationConflictError,
} from "@/features/product-stock-groups/stock-group-lock";
import { resolveProductDisplayStock } from "@/features/product-stock-groups/stock-display";

const log = getLogger("api:product-stock-groups:products");

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

const assignProductsSchema = z.object({
  sharedStock: z.coerce.number().optional(),
  stockInput: stockInputSchema.optional(),
  sourceProductId: z.string().min(1).optional(),
  conversionPairs: z.array(conversionPairSchema).optional(),
  products: z.array(productAssignmentSchema).min(2),
  note: z.string().trim().optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const productUser = await requirePermission("product", "update");
    const inventoryUser = await requirePermission("inventory", "update");
    const storeId = productUser.storeId || "store-main";
    const { id } = await params;
    const input = assignProductsSchema.parse(await request.json());

    const result = await db.$transaction(async (tx) => {
      const productIds = Array.from(
        new Set(input.products.map((product) => product.productId)),
      ).sort();
      if (productIds.length !== input.products.length) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const targetHint = await tx.productStockGroup.findFirst({
        where: { id, storeId },
        include: {
          products: {
            where: { isActive: true },
            select: {
              id: true,
              unit: true,
              stock: true,
              stockGroupId: true,
              unitMultiplierToBase: true,
            },
          },
        },
      });
      const productHints = await tx.product.findMany({
        where: { id: { in: productIds }, storeId, isActive: true },
        select: { id: true, stockGroupId: true },
      });
      if (productHints.length !== productIds.length) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const sourceGroupIds = productHints
        .map((product) => product.stockGroupId)
        .filter((stockGroupId): stockGroupId is string => Boolean(stockGroupId));
      const targetProductIds =
        targetHint?.products.map((product) => product.id) ?? [];
      const locks = await lockStockMutationRows(tx, {
        storeId,
        stockGroupIds: [id, ...sourceGroupIds],
        productIds: [...productIds, ...targetProductIds],
      });

      const requiredGroupIds = Array.from(
        new Set([
          ...sourceGroupIds,
          ...(targetHint ? [targetHint.id] : []),
        ]),
      );
      const requiredProductIds = Array.from(
        new Set([...productIds, ...targetProductIds]),
      );
      if (
        requiredGroupIds.some(
          (stockGroupId) =>
            !locks.lockedStockGroupIds.includes(stockGroupId),
        ) ||
        requiredProductIds.some(
          (productId) => !locks.lockedProductIds.includes(productId),
        )
      ) {
        throw new StockMutationConflictError();
      }

      const group = await tx.productStockGroup.findFirst({
        where: { id, storeId },
        include: {
          products: {
            where: { isActive: true },
            select: {
              id: true,
              unit: true,
              stock: true,
              stockGroupId: true,
              unitMultiplierToBase: true,
            },
          },
        },
      });
      if (!group) throw new Error("GROUP_NOT_FOUND");
      if (!locks.lockedStockGroupIds.includes(group.id)) {
        throw new StockMutationConflictError();
      }

      const products = await tx.product.findMany({
        where: { id: { in: productIds }, storeId, isActive: true },
        select: {
          id: true,
          unit: true,
          stock: true,
          stockGroupId: true,
          unitMultiplierToBase: true,
          stockGroup: {
            select: {
              id: true,
              baseStock: true,
            },
          },
        },
      });
      if (products.length !== productIds.length) {
        throw new StockMutationConflictError();
      }

      const hintById = new Map(
        productHints.map((product) => [product.id, product]),
      );
      for (const product of products) {
        if (
          hintById.get(product.id)?.stockGroupId !== product.stockGroupId
        ) {
          throw new StockMutationConflictError();
        }
      }
      const hintedTargetProductIds = [...targetProductIds].sort();
      const currentTargetProductIds = group.products
        .map((product) => product.id)
        .sort();
      if (
        hintedTargetProductIds.length !== currentTargetProductIds.length ||
        hintedTargetProductIds.some(
          (productId, index) =>
            productId !== currentTargetProductIds[index],
        )
      ) {
        throw new StockMutationConflictError();
      }

      const existingProducts = group.products
        .filter(
          (product) =>
            !products.some((incoming) => incoming.id === product.id),
        )
        .map((product) => ({
          id: product.id,
          unit: product.unit,
          stock: group.baseStock / product.unitMultiplierToBase,
        }));
      const resolved = resolveConfirmedGroupStock({
        products: [
          ...existingProducts,
          ...products.map((product) => ({
            ...product,
            stock: resolveProductDisplayStock(product),
          })),
        ],
        assignments: [
          ...group.products.map((product) => ({
            productId: product.id,
            unitMultiplierToBase: product.unitMultiplierToBase,
          })),
          ...input.products,
        ],
        sourceProductId: input.sourceProductId,
        conversionPairs: input.conversionPairs,
        sharedStock: input.sharedStock,
        stockInput: input.stockInput,
      });

      const updated = await tx.productStockGroup.update({
        where: { id: group.id },
        data: { baseStock: resolved.baseStock },
      });

      for (const variant of resolved.variants.filter((variant) =>
        productIds.includes(variant.id),
      )) {
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
          oldBaseStock: group.baseStock,
          newBaseStock: resolved.baseStock,
          variants: resolved.variants,
          actor: { id: inventoryUser.id, name: inventoryUser.name },
          note: input.note,
        }),
      });

      return { ...updated, conflictWarnings: resolved.conflictWarnings };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) return apiValidationError(error);
    if (isStockMutationConflict(error)) {
      return apiError(
        "Data grup stok berubah saat diproses. Silakan coba lagi.",
        409,
        { code: "Conflict" },
      );
    }
    if (error instanceof Error) {
      if (error.message === "GROUP_NOT_FOUND") {
        return apiError("Stock group not found", 404, { code: "NotFound" });
      }
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

    log.error("Failed to assign products to stock group", error);
    return apiError("Failed to assign products to stock group", 500, {
      code: "InternalError",
    });
  }
}
