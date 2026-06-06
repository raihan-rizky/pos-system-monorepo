import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  getSupplierDetail,
  SupplierNotFoundError,
  SupplierValidationError,
} from "@/features/suppliers/services/suppliers-service";

const log = getLogger("api:suppliers:detail");

const detailQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z.string().trim().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    await requirePermission("supplier", "read");
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const parsed = detailQuerySchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    const detail = await getSupplierDetail({
      supplierId: id,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor,
    });

    return NextResponse.json({ data: detail });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof SupplierNotFoundError) {
      return apiError("Supplier not found", 404, { code: "NotFound" });
    }

    if (error instanceof SupplierValidationError) {
      return apiError(error.message, 422, { code: "ValidationError" });
    }

    log.error("suppliers.detail.failed", { error });
    return apiError("Failed to fetch supplier detail", 500, {
      code: "InternalError",
    });
  }
}
