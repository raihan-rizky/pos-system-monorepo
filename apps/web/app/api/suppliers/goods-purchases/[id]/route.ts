import { getLogger } from "@/lib/logger";
import { requirePermission } from "@/lib/rbac/guard";
import { getGoodsPurchaseOrThrow } from "@/features/suppliers/goods-purchases/services/goods-purchases-service";
import {
  handleGoodsPurchaseRouteError,
  missingStoreResponse,
} from "../route-helpers";

const log = getLogger("api:suppliers:goods-purchases:detail");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("supplier", "read");
    if (!user.storeId) return missingStoreResponse();
    const { id } = await params;
    const data = await getGoodsPurchaseOrThrow(id, user.storeId);
    return Response.json({ data });
  } catch (error) {
    return handleGoodsPurchaseRouteError(
      error,
      "Gagal memuat detail Pembelian Barang",
      log.error.bind(log),
    );
  }
}
