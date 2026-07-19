import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import {
  approveShoppingRequestItem,
  ShoppingRequestNotFoundError,
  ShoppingRequestValidationError,
} from "@/features/suppliers/shopping-requests/services/shopping-requests-service";

const log = getLogger("api:suppliers:shopping-requests:item-approval");

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  stockMode: z.enum(["GROUP_STOCK", "PRODUCT_ONLY"]).optional(),
  confirmOverRequested: z.boolean().optional(),
});

export async function POST(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await requirePermission(
      "supplier.shopping_request.approve_stock",
      "update",
    );
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);
    const { id, itemId } = await params;
    const result = await approveShoppingRequestItem(
      id,
      itemId,
      parsed.data,
      { id: user.id, name: user.name, storeId: user.storeId || "store-main" },
    );
    return Response.json({ data: result });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof ShoppingRequestNotFoundError) {
      return apiError("Permohonan belanja tidak ditemukan", 404, {
        code: "NotFound",
      });
    }
    if (error instanceof ShoppingRequestValidationError) {
      return apiError(error.message, 409, { code: "Conflict" });
    }
    log.error("shopping_requests.item_approval.failed", { error });
    return apiError("Gagal menyetujui item permohonan", 500, {
      code: "InternalError",
    });
  }
}
