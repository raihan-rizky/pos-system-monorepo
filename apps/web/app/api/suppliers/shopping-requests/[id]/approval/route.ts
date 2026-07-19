import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import {
  approveShoppingRequest,
  ShoppingRequestNotFoundError,
  ShoppingRequestValidationError,
} from "@/features/suppliers/shopping-requests/services/shopping-requests-service";

const log = getLogger("api:suppliers:shopping-requests:approval");

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        stockMode: z.enum(["GROUP_STOCK", "PRODUCT_ONLY"]).optional(),
      }),
    )
    .min(1, "Minimal satu item wajib dipilih")
    .max(100, "Maksimal 100 item per persetujuan. Bagi permohonan menjadi beberapa proses."),
  confirmOverRequested: z.boolean().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(
      "supplier.shopping_request.approve_stock",
      "update",
    );
    const { id } = await params;
    const parsed = approveSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await approveShoppingRequest(
      id,
      parsed.data,
      { id: user.id, name: user.name, storeId: user.storeId || "store-main" },
    );
    return Response.json({ data: result });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof ShoppingRequestNotFoundError) {
      return apiError("Shopping request not found", 404, { code: "NotFound" });
    }
    if (error instanceof ShoppingRequestValidationError) {
      return apiError(error.message, 409, { code: "Conflict" });
    }

    log.error("shopping_requests.approve.failed", { error });
    return apiError("Failed to approve shopping request", 500, {
      code: "InternalError",
    });
  }
}
