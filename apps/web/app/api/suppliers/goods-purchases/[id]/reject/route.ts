import { z } from "zod";
import { apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { requirePermission } from "@/lib/rbac/guard";
import { rejectGoodsPurchase } from "@/features/suppliers/goods-purchases/services/goods-purchases-service";
import {
  handleGoodsPurchaseRouteError,
  missingStoreResponse,
} from "../../route-helpers";

const log = getLogger("api:suppliers:goods-purchases:reject");
const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Alasan penolakan wajib diisi")
    .max(500),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(
      "supplier.goods_purchase.reject",
      "update",
    );
    if (!user.storeId) return missingStoreResponse();
    const parsed = rejectSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);
    const { id } = await params;
    const data = await rejectGoodsPurchase(id, parsed.data.reason, {
      id: user.id,
      name: user.name,
      storeId: user.storeId,
    });
    return Response.json({ data });
  } catch (error) {
    return handleGoodsPurchaseRouteError(
      error,
      "Gagal menolak Pembelian Barang",
      log.error.bind(log),
    );
  }
}
