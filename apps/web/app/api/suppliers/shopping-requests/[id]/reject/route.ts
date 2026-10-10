import { z } from "zod";
import { after } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { rejectShoppingRequest } from "@/features/suppliers/shopping-requests/services/reject-shopping-request";
import { FinalApprovalError } from "@/features/suppliers/shopping-requests/services/final-approval-error";
import { sendRolePushEvent } from "@/lib/push-events";

const log = getLogger("api:suppliers:shopping-requests:reject");
const schema = z.object({ reason: z.string().trim().min(3, "Tulis alasan penolakan").max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("supplier.goods_purchase.reject", "update");
    if (!user.storeId) return apiError("Toko pengguna tidak tersedia", 403);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error, "Tulis alasan penolakan terlebih dahulu.");
    const { id } = await params;
    const result = await rejectShoppingRequest(id, parsed.data.reason, {
      id: user.id, name: user.name, storeId: user.storeId,
    });
    after(async () => {
      try {
        await sendRolePushEvent({
          eventName: "shopping-request-rejected",
          storeId: user.storeId!,
          roles: ["OWNER", "ADMIN"],
          featureKey: "shoppingRequests",
          excludeUserIds: [user.id],
          payload: {
            title: "Daftar belanja ditolak",
            body: `${user.name || "Pengguna"} menolak daftar belanja.`,
            url: "/suppliers?tab=shopping-requests",
            tag: `shopping-request:${id}`,
          },
        });
      } catch (notificationError) {
        log.error("shopping_requests.reject.notification_failed", { notificationError, requestId: id });
      }
    });
    return Response.json({ data: result });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof FinalApprovalError) return apiError(error.message, error.status, { code: error.status === 409 ? "Conflict" : "ValidationError" });
    log.error("shopping_requests.reject.failed", { error });
    return apiError("Daftar belanja belum bisa ditolak. Coba lagi.", 500);
  }
}
