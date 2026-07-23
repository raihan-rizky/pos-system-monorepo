import { z } from "zod";
import { apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { requirePermission } from "@/lib/rbac/guard";
import {
  editGoodsPurchaseItem,
  removeGoodsPurchaseItem,
} from "@/features/suppliers/goods-purchases/services/goods-purchases-service";
import {
  handleGoodsPurchaseRouteError,
  missingStoreResponse,
} from "../../../route-helpers";

const log = getLogger("api:suppliers:goods-purchases:item");
const itemSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().positive("Jumlah produk harus lebih dari 0"),
  latestUnitPrice: z.number().min(0, "Harga produk tidak boleh negatif"),
  updateMasterHpp: z.boolean().default(false),
});

type RouteContext = {
  params: Promise<{ id: string; itemId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requirePermission(
      "supplier.goods_purchase.approve",
      "update",
    );
    if (!user.storeId) return missingStoreResponse();
    const parsed = itemSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);
    const { id, itemId } = await params;
    const result = await editGoodsPurchaseItem(
      id,
      itemId,
      parsed.data,
      {
        id: user.id,
        name: user.name,
        storeId: user.storeId,
      },
    );
    return Response.json(result);
  } catch (error) {
    return handleGoodsPurchaseRouteError(
      error,
      "Gagal mengubah produk Pembelian Barang",
      log.error.bind(log),
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
) {
  try {
    const user = await requirePermission(
      "supplier.goods_purchase.approve",
      "update",
    );
    if (!user.storeId) return missingStoreResponse();
    const { id, itemId } = await params;
    const result = await removeGoodsPurchaseItem(id, itemId, {
      id: user.id,
      name: user.name,
      storeId: user.storeId,
    });
    return Response.json(result);
  } catch (error) {
    return handleGoodsPurchaseRouteError(
      error,
      "Gagal menghapus produk Pembelian Barang",
      log.error.bind(log),
    );
  }
}
