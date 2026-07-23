import { z } from "zod";
import { apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { requirePermission } from "@/lib/rbac/guard";
import { addGoodsPurchaseItem } from "@/features/suppliers/goods-purchases/services/goods-purchases-service";
import {
  handleGoodsPurchaseRouteError,
  missingStoreResponse,
} from "../../route-helpers";

const log = getLogger("api:suppliers:goods-purchases:items");
const itemSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().positive("Jumlah produk harus lebih dari 0"),
  latestUnitPrice: z.number().min(0, "Harga produk tidak boleh negatif"),
  updateMasterHpp: z.boolean().default(false),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(
      "supplier.goods_purchase.approve",
      "update",
    );
    if (!user.storeId) return missingStoreResponse();
    const parsed = itemSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);
    const { id } = await params;
    const result = await addGoodsPurchaseItem(id, parsed.data, {
      id: user.id,
      name: user.name,
      storeId: user.storeId,
    });
    return Response.json(result);
  } catch (error) {
    return handleGoodsPurchaseRouteError(
      error,
      "Gagal menambah produk Pembelian Barang",
      log.error.bind(log),
    );
  }
}
