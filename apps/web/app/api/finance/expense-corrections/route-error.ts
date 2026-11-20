import { BackdatedPurchaseError } from "@/features/suppliers/backdated-purchases/repositories/backdated-purchase-repository";
import { ShoppingRequestCorrectionError } from "@/features/suppliers/shopping-requests/services/shopping-request-correction-error";
import { ShoppingRequestDeletionError } from "@/features/suppliers/shopping-requests/services/shopping-request-deletion-error";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { handleAuthError } from "@/lib/rbac/guard";

const log = getLogger("api:finance:expense-corrections");

export function badCorrectionInput() {
  return apiError("Periksa data koreksi pengeluaran.", 422, { code: "ValidationError" });
}

export function expenseCorrectionError(error: unknown) {
  const authError = handleAuthError(error);
  if (authError) return authError;
  if (error instanceof BackdatedPurchaseError || error instanceof ShoppingRequestCorrectionError || error instanceof ShoppingRequestDeletionError) {
    const { status } = error;
    const code = status === 404 ? "NotFound" : status === 409 ? "Conflict" : status === 403 ? "Forbidden" : "ValidationError";
    return apiError(error.message, status, { code });
  }
  log.error("Gagal memproses koreksi pengeluaran", error);
  return apiError("Koreksi pengeluaran belum dapat diproses. Silakan coba lagi.", 500, { code: "InternalError" });
}
