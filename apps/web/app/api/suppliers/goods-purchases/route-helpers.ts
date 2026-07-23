import { apiError } from "@/lib/api/responses";
import { handleAuthError } from "@/lib/rbac/guard";
import {
  GoodsPurchaseNotFoundError,
  GoodsPurchaseValidationError,
} from "@/features/suppliers/goods-purchases/services/goods-purchases-service";

export function handleGoodsPurchaseRouteError(
  error: unknown,
  fallbackMessage: string,
  logError: (message: string, context: { error: unknown }) => void,
): Response {
  const authError = handleAuthError(error);
  if (authError) return authError;
  if (error instanceof GoodsPurchaseNotFoundError) {
    return apiError("Pembelian Barang tidak ditemukan", 404, {
      code: "NotFound",
    });
  }
  if (error instanceof GoodsPurchaseValidationError) {
    return apiError(error.message, error.isConflict ? 409 : 422, {
      code: error.isConflict ? "Conflict" : "ValidationError",
    });
  }
  logError("goods_purchase.route.failed", { error });
  return apiError(fallbackMessage, 500, { code: "InternalError" });
}

export function missingStoreResponse(): Response {
  return apiError("Toko pengguna tidak tersedia", 403, {
    code: "Forbidden",
  });
}
