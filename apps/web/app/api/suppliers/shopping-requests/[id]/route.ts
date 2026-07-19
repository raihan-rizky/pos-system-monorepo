import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import {
  cancelShoppingRequest,
  getShoppingRequestOrThrow,
  ShoppingRequestNotFoundError,
  ShoppingRequestValidationError,
  updateShoppingRequest,
} from "@/features/suppliers/shopping-requests/services/shopping-requests-service";

const log = getLogger("api:suppliers:shopping-requests:detail");

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  supplierId: z.string().trim().min(1, "Supplier wajib dipilih"),
  note: z.string().trim().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        requestedQty: z.number().finite().positive(),
        stockMode: z.enum(["GROUP_STOCK", "PRODUCT_ONLY"]),
      }),
    )
    .min(1, "Minimal satu item wajib dipilih")
    .max(100, "Maksimal 100 item per permohonan"),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("supplier", "read");
    const { id } = await params;
    const result = await getShoppingRequestOrThrow(
      id,
      user.storeId || "store-main",
    );
    return Response.json({ data: result });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof ShoppingRequestNotFoundError) {
      return apiError("Shopping request not found", 404, { code: "NotFound" });
    }

    log.error("shopping_requests.detail.failed", { error });
    return apiError("Failed to fetch shopping request", 500, {
      code: "InternalError",
    });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(
      "supplier.shopping_request.edit",
      "update",
    );
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);
    const { id } = await params;
    const result = await updateShoppingRequest(id, parsed.data, {
      id: user.id,
      name: user.name,
      storeId: user.storeId || "store-main",
    });
    return Response.json({ data: result });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof ShoppingRequestNotFoundError) {
      return apiError("Permohonan belanja tidak ditemukan", 404, {
        code: "NotFound",
      });
    }
    if (error instanceof ShoppingRequestValidationError) {
      return apiError(error.message, 409, { code: "Conflict" });
    }
    log.error("shopping_requests.update.failed", { error });
    return apiError("Gagal memperbarui permohonan belanja", 500, {
      code: "InternalError",
    });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("supplier", "update");
    const { id } = await params;
    const result = await cancelShoppingRequest(id, {
      id: user.id,
      name: user.name,
      storeId: user.storeId || "store-main",
    });
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

    log.error("shopping_requests.cancel.failed", { error });
    return apiError("Failed to cancel shopping request", 500, {
      code: "InternalError",
    });
  }
}
