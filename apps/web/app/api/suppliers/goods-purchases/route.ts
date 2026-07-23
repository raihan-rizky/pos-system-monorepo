import { after, NextResponse } from "next/server";
import { z } from "zod";
import {
  apiList,
  apiValidationError,
  buildPaginationMeta,
  parsePagination,
} from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { requirePermission } from "@/lib/rbac/guard";
import {
  createGoodsPurchase,
  listGoodsPurchasesPage,
} from "@/features/suppliers/goods-purchases/services/goods-purchases-service";
import {
  handleGoodsPurchaseRouteError,
  missingStoreResponse,
} from "./route-helpers";
import { sendRolePushEvent } from "@/lib/push-events";

const log = getLogger("api:suppliers:goods-purchases");

const itemSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().positive("Jumlah produk harus lebih dari 0"),
  latestUnitPrice: z.number().min(0, "Harga produk tidak boleh negatif"),
  updateMasterHpp: z.boolean().default(false),
});

const createSchema = z.object({
  shoppingRequestId: z.string().trim().min(1),
  items: z
    .array(
      itemSchema.extend({
        shoppingRequestItemId: z.string().trim().min(1),
      }),
    )
    .min(1, "Minimal satu produk wajib diisi"),
});

export async function GET(request: Request) {
  try {
    const user = await requirePermission("supplier", "read");
    if (!user.storeId) return missingStoreResponse();
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    });
    const rawStatus = searchParams.get("status");
    const status =
      rawStatus === "PENDING" ||
      rawStatus === "APPROVED" ||
      rawStatus === "REJECTED"
        ? rawStatus
        : undefined;
    const result = await listGoodsPurchasesPage({
      storeId: user.storeId,
      q: searchParams.get("q")?.trim() || undefined,
      status,
      skip,
      take: limit,
    });
    return apiList(
      result.purchases,
      buildPaginationMeta(result.total, page, limit),
    );
  } catch (error) {
    return handleGoodsPurchaseRouteError(
      error,
      "Gagal memuat riwayat Pembelian Barang",
      log.error.bind(log),
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("supplier", "create");
    if (!user.storeId) return missingStoreResponse();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);
    const data = await createGoodsPurchase(parsed.data, {
      id: user.id,
      name: user.name,
      storeId: user.storeId,
    });
    after(async () => {
      try {
        await sendRolePushEvent({
          eventName: "goods-purchase-created",
          storeId: user.storeId,
          roles: ["OWNER"],
          featureKey: "shoppingRequests",
          excludeUserIds: [user.id],
          payload: {
            title: "Pembelian Barang baru",
            body: `${user.name || "Pengguna"} mengajukan ${data.number}.`,
            url: "/suppliers?tab=goods-purchases",
            tag: `goods-purchase:${data.id}`,
          },
        });
      } catch (notificationError) {
        log.error("goods_purchases.create.notification_failed", {
          error: notificationError,
          purchaseId: data.id,
          storeId: user.storeId,
        });
      }
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleGoodsPurchaseRouteError(
      error,
      "Gagal mengajukan Pembelian Barang",
      log.error.bind(log),
    );
  }
}
