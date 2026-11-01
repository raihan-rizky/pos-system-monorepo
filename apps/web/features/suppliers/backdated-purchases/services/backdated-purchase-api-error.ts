import { apiError } from "@/lib/api/responses";
import { handleAuthError } from "@/lib/rbac/guard";
import { BackdatedPurchaseInputError } from "../helpers/backdated-purchase-input";
import { BackdatedPurchaseError } from "../repositories/backdated-purchase-repository";

export function backdatedPurchaseApiError(error: unknown) {
  const authError = handleAuthError(error);
  if (authError) return authError;
  if (error instanceof BackdatedPurchaseInputError) {
    return apiError(error.message, 422, { code: "ValidationError", errors: { [error.field]: [error.message] } });
  }
  if (error instanceof BackdatedPurchaseError) {
    return apiError(error.message, error.status, { code: error.status === 404 ? "NotFound" : error.status === 422 ? "ValidationError" : "Conflict" });
  }
  if (error instanceof SyntaxError) return apiError("Data yang dikirim tidak valid.", 422, { code: "ValidationError" });
  console.error("backdated-purchase.request.failed", error);
  return apiError("Belanja terdahulu gagal diproses. Coba lagi.", 500, { code: "InternalError" });
}
