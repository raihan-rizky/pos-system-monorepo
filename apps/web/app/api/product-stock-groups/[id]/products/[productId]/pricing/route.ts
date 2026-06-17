import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";

import { apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { calculateVariantMargin } from "@/features/product-stock-groups/bulk-stock-groups";
import { buildProductPriceLogEntries } from "@/lib/product-price-logs/price-log-entries";

const log = getLogger("api:product-stock-groups:pricing");

const updateVariantPricingSchema = z.object({
  price: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0).nullable().optional(),
  priceChangeNote: z.string().trim().optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; productId: string }> },
) {
  try {
    const user = await requirePermission("product", "update");
    const storeId = user.storeId || "store-main";
    const { id, productId } = await params;
    const input = updateVariantPricingSchema.parse(await request.json());

    const result = await db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, storeId, stockGroupId: id, isActive: true },
        select: { id: true, price: true, costPrice: true },
      });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");

      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          price: input.price,
          costPrice: input.costPrice ?? null,
        },
      });

      const priceLogEntries = buildProductPriceLogEntries({
        productId: product.id,
        storeId,
        before: {
          price: product.price,
          costPrice: product.costPrice,
        },
        after: {
          price: input.price,
          costPrice: input.costPrice ?? null,
        },
        actor: user,
        source: "MANUAL",
        note: input.priceChangeNote,
      });
      if (priceLogEntries.length > 0) {
        await tx.productPriceLog.createMany({ data: priceLogEntries });
      }

      return {
        product: updated,
        margin: calculateVariantMargin({
          price: input.price,
          costPrice: input.costPrice ?? null,
        }),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) return apiValidationError(error);
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return apiError("Product variant not found", 404, { code: "NotFound" });
    }

    log.error("Failed to update stock group variant pricing", error);
    return apiError("Failed to update stock group variant pricing", 500, {
      code: "InternalError",
    });
  }
}
