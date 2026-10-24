import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";

import { apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { calculateVariantMargin } from "@/features/product-stock-groups/bulk-stock-groups";
import { prepareGroupPricingMutation, synchronizeGroupPricingMutation, GroupPricingError } from "@/features/product-stock-groups/group-pricing-service";
import { pricingMemberChangeSchema } from "@/features/product-stock-groups/pricing-api-schema";
import { isStockMutationConflict } from "@/features/product-stock-groups/stock-group-lock";

const log = getLogger("api:product-stock-groups:pricing");

const updateVariantPricingSchema = pricingMemberChangeSchema.omit({ productId: true }).extend({
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
      const prepared = await prepareGroupPricingMutation(tx, { storeId, groupIds: [id] });
      const [pricing] = await synchronizeGroupPricingMutation(tx, {
        prepared, actor: user, source: "MANUAL", note: input.priceChangeNote,
        changes: { [id]: { members: [{ productId, ...input }] } },
      });
      const product = await tx.product.findFirst({ where: { id: productId, storeId, stockGroupId: id, isActive: true } });
      if (!product) throw new GroupPricingError("Satuan tidak ditemukan.", 404);
      return { product, pricing, margin: calculateVariantMargin({ price: Number(product.price), costPrice: product.costPrice === null ? null : Number(product.costPrice) }) };
    });

    return NextResponse.json(result);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) return apiValidationError(error);
    if (error instanceof GroupPricingError) return apiError(error.message, error.status, { code: error.status === 409 ? "Conflict" : error.status === 404 ? "NotFound" : "ValidationError" });
    if (isStockMutationConflict(error)) return apiError("Data grup berubah. Silakan muat ulang harga.", 409, { code: "Conflict" });

    log.error("Failed to update stock group variant pricing", error);
    return apiError("Failed to update stock group variant pricing", 500, {
      code: "InternalError",
    });
  }
}
