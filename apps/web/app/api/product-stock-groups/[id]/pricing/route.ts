import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { applyGroupPricingChange, GroupPricingError, previewGroupPricingChange } from "@/features/product-stock-groups/group-pricing-service";
import { groupPricingRequestSchema } from "@/features/product-stock-groups/pricing-api-schema";
import { isStockMutationConflict } from "@/features/product-stock-groups/stock-group-lock";

const log = getLogger("api:product-stock-groups:automatic-pricing");
type Context = { params: Promise<{ id: string }> };

async function handle(request: Request, context: Context, apply: boolean) {
  try {
    const user = await requirePermission("product", apply ? "update" : "read");
    const { id } = await context.params;
    const input = groupPricingRequestSchema.parse(await request.json());
    const scope = { storeId: user.storeId || "store-main", groupId: id, changes: input.changes };
    if (apply && (!input.expectedVersion || !input.expectedProjection)) return apiError("Muat pratinjau harga sebelum menyimpan.", 422, { code: "ValidationError" });
    const result = apply
      ? await db.$transaction(tx => applyGroupPricingChange(tx, { ...scope, expectedVersion: input.expectedVersion!, expectedProjection: input.expectedProjection!, actor: user, source: "MANUAL", note: input.note }))
      : await previewGroupPricingChange(db, scope);
    return NextResponse.json(result);
  } catch (error) {
    const auth = handleAuthError(error); if (auth) return auth;
    if (error instanceof z.ZodError) return apiValidationError(error);
    if (error instanceof GroupPricingError) return apiError(error.message, error.status, { code: error.status === 409 ? "Conflict" : error.status === 404 ? "NotFound" : "ValidationError" });
    if (isStockMutationConflict(error)) return apiError("Data grup berubah. Muat pratinjau terbaru.", 409, { code: "Conflict" });
    log.error("Failed to process group pricing", error);
    return apiError("Harga grup belum dapat diproses. Silakan coba lagi.", 500, { code: "InternalError" });
  }
}
export async function POST(request: Request, context: Context) { return handle(request, context, false); }
export async function PATCH(request: Request, context: Context) { return handle(request, context, true); }
