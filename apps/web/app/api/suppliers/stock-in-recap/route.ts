import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import {
  apiError,
  apiList,
  buildPaginationMeta,
  parsePagination,
} from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { getSupplierStockInRecap } from "@/features/suppliers/services/suppliers-service";

const log = getLogger("api:suppliers:stock-in-recap");

export async function GET(request: Request) {
  try {
    await requirePermission("supplier", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    });
    const result = await getSupplierStockInRecap({
      from: parseDate(searchParams.get("from")),
      to: parseDate(searchParams.get("to")),
      supplierId: searchParams.get("supplierId") || undefined,
      productId: searchParams.get("productId") || undefined,
      categoryId: searchParams.get("categoryId") || undefined,
      skip,
      take: limit,
    });

    return apiList(
      result.bundles,
      buildPaginationMeta(result.total, page, limit),
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("suppliers.stock_in_recap.failed", { error });
    return apiError("Failed to fetch supplier stock-in recap", 500, {
      code: "InternalError",
    });
  }
}

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
