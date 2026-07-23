import { getLogger } from "@/lib/logger";
import { requirePermission } from "@/lib/rbac/guard";
import { listLargeUnitProducts } from "@/features/suppliers/goods-purchases/services/goods-purchases-service";
import {
  handleGoodsPurchaseRouteError,
  missingStoreResponse,
} from "../route-helpers";

const log = getLogger("api:suppliers:goods-purchases:large-units");

export async function GET(request: Request) {
  try {
    const user = await requirePermission(
      "supplier.goods_purchase.approve",
      "update",
    );
    if (!user.storeId) return missingStoreResponse();
    const q = new URL(request.url).searchParams.get("q")?.trim() || undefined;
    const data = await listLargeUnitProducts(user.storeId, q);
    return Response.json({ data });
  } catch (error) {
    return handleGoodsPurchaseRouteError(
      error,
      "Gagal memuat produk satuan besar",
      log.error.bind(log),
    );
  }
}
