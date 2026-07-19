import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import {
  saveShoppingRequestApprovedQuantities,
  ShoppingRequestNotFoundError,
  ShoppingRequestValidationError,
} from "@/features/suppliers/shopping-requests/services/shopping-requests-service";

const log = getLogger("api:suppliers:shopping-requests:approved-quantities");

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        approvedQty: z.number().finite().nonnegative(),
      }),
    )
    .min(1, "Minimal satu item wajib diisi")
    .max(100, "Maksimal 100 item per penyimpanan"),
  confirmOverRequested: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(
      "supplier.shopping_request.set_approved_qty",
      "update",
    );
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);
    const { id } = await params;
    const result = await saveShoppingRequestApprovedQuantities(
      id,
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
    log.error("shopping_requests.approved_quantities.failed", { error });
    return apiError("Gagal menyimpan Jumlah yang Di-ACC", 500, {
      code: "InternalError",
    });
  }
}
