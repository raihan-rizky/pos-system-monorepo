import { after } from "next/server";
import { getLogger } from "@/lib/logger";
import { requirePermission } from "@/lib/rbac/guard";
import { approveGoodsPurchaseItem } from "@/features/suppliers/goods-purchases/services/goods-purchases-service";
import {
  handleGoodsPurchaseRouteError,
  missingStoreResponse,
} from "../../../../route-helpers";
import { sendRolePushEvent } from "@/lib/push-events";

const log = getLogger("api:suppliers:goods-purchases:item-approval");

export async function POST(
  _request: Request,
  {
    params,
  }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await requirePermission(
      "supplier.goods_purchase.approve",
      "update",
    );
    if (!user.storeId) return missingStoreResponse();
    const { id, itemId } = await params;
    const result = await approveGoodsPurchaseItem(id, itemId, {
      id: user.id,
      name: user.name,
      storeId: user.storeId,
    });
    if (result.finalized) {
      after(async () => {
        try {
          await sendRolePushEvent({
            eventName: "goods-purchase-approved",
            storeId: user.storeId,
            roles: ["OWNER", "ADMIN"],
            featureKey: "shoppingRequests",
            excludeUserIds: [user.id],
            payload: {
              title: "Pembelian Barang disetujui",
              body: `${user.name || "Pengguna"} menyetujui ${result.data.number}.`,
              url: "/suppliers?tab=goods-purchases",
              tag: `goods-purchase:${result.data.id}`,
            },
          });
        } catch (notificationError) {
          log.error("goods_purchases.approve.notification_failed", {
            error: notificationError,
            purchaseId: result.data.id,
            storeId: user.storeId,
          });
        }
      });
    }
    return Response.json(result);
  } catch (error) {
    return handleGoodsPurchaseRouteError(
      error,
      "Gagal menyetujui produk Pembelian Barang",
      log.error.bind(log),
    );
  }
}
