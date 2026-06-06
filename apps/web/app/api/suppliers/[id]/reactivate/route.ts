import { NextResponse } from "next/server";

import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { reactivateSupplier } from "@/features/suppliers/services/suppliers-service";

const log = getLogger("api:suppliers:reactivate");

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requirePermission("supplier", "update");
    const { id } = await context.params;
    const supplier = await reactivateSupplier(id);
    return NextResponse.json({ data: supplier, warnings: [] });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("suppliers.reactivate.failed", { error });
    return apiError("Failed to reactivate supplier", 500, {
      code: "InternalError",
    });
  }
}
