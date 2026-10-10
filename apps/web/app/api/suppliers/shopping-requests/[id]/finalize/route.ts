import { z } from "zod";
import { after } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { finalizeShoppingRequest, FinalApprovalError } from "@/features/suppliers/shopping-requests/services/finalize-shopping-request";
import { sendRolePushEvent } from "@/lib/push-events";

const log = getLogger("api:suppliers:shopping-requests:finalize");
const itemSchema = z.object({
  shoppingRequestItemId: z.string().trim().min(1),
  productId: z.string().trim().min(1),
  approvedQty: z.number().finite().nonnegative(),
  latestUnitPrice: z.number().finite().nonnegative(),
  updateMasterHpp: z.boolean(),
});
const extraItemSchema = itemSchema.omit({ shoppingRequestItemId: true }).extend({
  quantity: z.number().finite().positive(),
}).omit({ approvedQty: true });
const schema = z.object({
  items: z.array(itemSchema).min(1),
  extraItems: z.array(extraItemSchema).default([]),
  confirmOverRequested: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("supplier.goods_purchase.approve", "update");
    if (!user.storeId) return apiError("Toko pengguna tidak tersedia", 403);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error, "Periksa kembali jumlah dan harga beli.");
    const { id } = await params;
    const result = await finalizeShoppingRequest(id, parsed.data, {
      id: user.id, name: user.name, storeId: user.storeId,
    });
    after(async () => {
      try {
        await sendRolePushEvent({
          eventName: "shopping-request-finalized",
          storeId: user.storeId!,
          roles: ["OWNER", "ADMIN"],
          featureKey: "shoppingRequests",
          excludeUserIds: [user.id],
          payload: {
            title: "Daftar belanja disetujui",
            body: `${user.name || "Pengguna"} menyetujui daftar belanja dan mencatat pembelian.`,
            url: "/suppliers?tab=shopping-requests",
            tag: `shopping-request:${id}`,
          },
        });
      } catch (notificationError) {
        log.error("shopping_requests.finalize.notification_failed", { notificationError, requestId: id });
      }
    });
    return Response.json({ data: result });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof FinalApprovalError) return apiError(error.message, error.status, { code: error.status === 409 ? "Conflict" : "ValidationError" });
    log.error("shopping_requests.finalize.failed", { error });
    return apiError("Daftar belanja belum bisa disetujui. Coba lagi.", 500);
  }
}
