import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";

import { apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { resolveConversionEdit } from "@/features/product-stock-groups/bulk-stock-groups";
import {
  isStockMutationConflict,
} from "@/features/product-stock-groups/stock-group-lock";

import { prepareGroupPricingMutation, synchronizeGroupPricingMutation, GroupPricingError, previewGroupPricingSnapshot, groupPricingVersion } from "@/features/product-stock-groups/group-pricing-service";

const log = getLogger("api:product-stock-groups:conversion");

const conversionPairSchema = z.object({
  fromProductId: z.string().min(1),
  fromQuantity: z.coerce.number().positive(),
  toProductId: z.string().min(1),
  toQuantity: z.coerce.number().positive(),
});

const directMultiplierSchema = z.object({
  productId: z.string().min(1),
  unitMultiplierToBase: z.coerce.number().positive(),
});

const updateConversionSchema = z.object({
  mode: z.enum(["PRESERVE_SOURCE_STOCK", "KEEP_SHARED_STOCK"]),
  baseProductId: z.string().min(1).optional().nullable(),
  sourceProductId: z.string().min(1).optional().nullable(),
  conversionPairs: z.array(conversionPairSchema).optional().default([]),
  directMultipliers: z.array(directMultiplierSchema).optional().default([]),
  note: z.string().trim().optional().nullable(),
  expectedVersion: z.string().optional(),
  expectedProjection: z.string().optional(),
}).refine(
  (value) =>
    value.conversionPairs.length > 0 || value.directMultipliers.length > 0,
  {
    message: "At least one conversion pair or direct multiplier is required",
    path: ["conversionPairs"],
  },
);

async function handleConversion(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
  previewOnly: boolean,
) {
  try {
    const user = await requirePermission("product", previewOnly ? "read" : "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const input = updateConversionSchema.parse(await request.json());

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
              unit: true,
              unitMultiplierToBase: true,
              conversionNeedsReview: true,
            },
          },
        },
      });
      if (!group) throw new GroupPricingError("Grup satuan tidak ditemukan.", 404);
      const before = prepared.before.get(id)!;
      if (!previewOnly && input.expectedVersion !== undefined && input.expectedVersion !== groupPricingVersion(before) + ":" + group.baseStock) {
        throw new GroupPricingError("Data grup berubah. Muat pratinjau konversi terbaru.", 409);
      }

      const currentBaseProduct =
        group.products.find(
          (product) =>
            product.unit.trim().toLowerCase() ===
            group.baseUnit.trim().toLowerCase(),
        ) ?? group.products.find((product) => product.unitMultiplierToBase === 1);
      const nextBaseProduct = group.products.find(
        (product) => product.id === (input.baseProductId ?? currentBaseProduct?.id),
      );
      if (!nextBaseProduct) throw new Error("BASE_PRODUCT_NOT_FOUND");

      const resolved = resolveConversionEdit({
        mode: input.mode,
        currentBaseProductId: currentBaseProduct?.id ?? null,
        baseProductId: nextBaseProduct.id,
        sourceProductId: input.sourceProductId,
        currentBaseStock: group.baseStock,
        variants: group.products.map((product) => ({
          id: product.id,
          unit: product.unit,
          unitMultiplierToBase: product.unitMultiplierToBase,
        })),
        conversionPairs: input.conversionPairs,
        directMultipliers: input.directMultipliers,
      });

      const current = { ...before, baseUnit: nextBaseProduct.unit,
        members: before.members.map(member => {
          const variant = resolved.variants.find(v => v.id === member.id);
          return variant ? { ...member, unitMultiplierToBase: variant.unitMultiplierToBase, conversionNeedsReview: false } : member;
        }),
      };
      const pricingPreview = previewGroupPricingSnapshot(before, current);
      pricingPreview.version += ":" + group.baseStock;
      pricingPreview.projectionToken = createHash("sha256").update(JSON.stringify({
        pricing: pricingPreview.projectionToken, baseUnit: nextBaseProduct.unit,
        nextBaseStock: resolved.nextBaseStock, variants: resolved.variants,
        mode: input.mode, sourceProductId: input.sourceProductId ?? null,
      })).digest("hex");
      if (previewOnly) return { preview: resolved.preview, nextBaseStock: resolved.nextBaseStock, pricing: pricingPreview };
      if ((input.expectedVersion !== undefined || input.expectedProjection !== undefined) &&
          (input.expectedVersion !== pricingPreview.version || input.expectedProjection !== pricingPreview.projectionToken)) {
        throw new GroupPricingError("Data grup berubah. Muat pratinjau konversi terbaru.", 409);
      }

      const updated = await tx.productStockGroup.update({
        where: { id: group.id },
        data: {
          baseUnit: nextBaseProduct.unit,
          baseStock: resolved.nextBaseStock,
        },
      });

      for (const variant of resolved.variants) {
        await tx.product.update({
          where: { id: variant.id },
          data: {
            unitMultiplierToBase: variant.unitMultiplierToBase,
            conversionNeedsReview: false,
          },
        });
      }

      const txWithActivity = tx as typeof tx & {
        productStockGroupActivity?: {
          create: (args: unknown) => Promise<unknown>;
        };
      };
      await txWithActivity.productStockGroupActivity?.create({
        data: {
          stockGroupId: group.id,
          type: "CONVERSION_RATE_CHANGED",
          productId: input.sourceProductId ?? null,
          note: input.note ?? null,
          createdBy: user.id,
          person: user.name ?? null,
          before: {
            baseUnit: group.baseUnit,
            baseStock: group.baseStock,
            variants: group.products.map((product) => ({
              id: product.id,
              unit: product.unit,
              unitMultiplierToBase: product.unitMultiplierToBase,
            })),
          },
          after: {
            baseUnit: nextBaseProduct.unit,
            baseStock: resolved.nextBaseStock,
            variants: resolved.variants,
            mode: input.mode,
            preview: resolved.preview,
          },
        },
      });

      const [pricing] = await synchronizeGroupPricingMutation(tx, { prepared, actor: user, source: "MANUAL", note: input.note });
      return { ...updated, pricingConfig: pricing.config, pricing, preview: resolved.preview };
    });

    return NextResponse.json(result);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) return apiValidationError(error);
    if (error instanceof GroupPricingError) return apiError(error.message, error.status, { code: error.status === 409 ? "Conflict" : error.status === 404 ? "NotFound" : "ValidationError" });
    if (isStockMutationConflict(error)) {
      return apiError(
        "Data grup stok berubah saat konversi diproses. Silakan coba lagi.",
        409,
        { code: "Conflict" },
      );
    }
    if (error instanceof Error) {
      if (error.message === "GROUP_NOT_FOUND") {
        return apiError("Stock group not found", 404, { code: "NotFound" });
      }
      if (
        [
          "SOURCE_PRODUCT_REQUIRED",
          "SOURCE_PRODUCT_NOT_FOUND",
          "BASE_PRODUCT_NOT_FOUND",
          "CONVERSION_PAIR_PRODUCT_NOT_FOUND",
          "INVALID_CONVERSION_PAIR",
          "CONVERSION_PAIR_DISCONNECTED",
          "INVALID_MULTIPLIER",
          "DUPLICATE_UNIT",
          "UNIT_REQUIRED",
        ].includes(error.message)
      ) {
        return apiError("Validation error", 422, {
          code: "ValidationError",
          errors: { conversionPairs: [error.message] },
        });
      }
    }

    log.error("Failed to update stock group conversion", error);
    return apiError("Failed to update stock group conversion", 500, {
      code: "InternalError",
    });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleConversion(request, context, true);
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleConversion(request, context, false);
}
