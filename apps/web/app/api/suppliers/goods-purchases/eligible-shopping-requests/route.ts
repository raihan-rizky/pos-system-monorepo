import { getLogger } from "@/lib/logger";
import { requirePermission } from "@/lib/rbac/guard";
import { listEligibleShoppingRequests } from "@/features/suppliers/goods-purchases/services/goods-purchases-service";
import {
  handleGoodsPurchaseRouteError,
  missingStoreResponse,
} from "../route-helpers";

const log = getLogger("api:suppliers:goods-purchases:eligible");

export async function GET(request: Request) {
  try {
    const user = await requirePermission("supplier", "read");
    if (!user.storeId) return missingStoreResponse();
    const q = new URL(request.url).searchParams.get("q")?.trim() || undefined;
    const data = await listEligibleShoppingRequests(user.storeId, q);
    return Response.json({ data });
  } catch (error) {
    return handleGoodsPurchaseRouteError(
      error,
      "Gagal memuat Daftar Belanja yang disetujui",
      log.error.bind(log),
    );
  }
}
