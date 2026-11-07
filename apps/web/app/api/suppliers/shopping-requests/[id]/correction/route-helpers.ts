import { ZodError } from "zod";
import { apiError } from "@/lib/api/responses";
import { getCurrentUser } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { canRoleAccessPage, canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import { ShoppingRequestCorrectionError } from "@/features/suppliers/shopping-requests/services/shopping-request-correction-error";

const log = getLogger("api:suppliers:shopping-requests:correction");

export async function requireCorrectionActor() {
  const user = await getCurrentUser();
  if (!user) throw new ShoppingRequestCorrectionError("Silakan masuk untuk mengoreksi daftar belanja.", 401);
  if (!user.storeId) throw new ShoppingRequestCorrectionError("Toko pengguna belum tersedia.", 403);
  let permissions;
  try {
    permissions = await getGlobalRolePermissions();
  } catch {
    throw new ShoppingRequestCorrectionError("Hak akses belum dapat diverifikasi. Silakan coba lagi.", 503);
  }
  if (!canRoleAccessPage(user.role, "/suppliers", permissions) ||
      !canRolePerformAction(user.role, "supplier.shopping_request.correct_processed", "update", permissions)) {
    throw new ShoppingRequestCorrectionError("Anda belum memiliki izin mengoreksi daftar belanja.", 403);
  }
  return { id: user.id, name: user.name, storeId: user.storeId };
}

export async function requireCorrectionHistoryActor() {
  const user = await getCurrentUser();
  if (!user) throw new ShoppingRequestCorrectionError("Silakan masuk untuk melihat riwayat daftar belanja.", 401);
  if (!user.storeId) throw new ShoppingRequestCorrectionError("Toko pengguna belum tersedia.", 403);
  let permissions;
  try {
    permissions = await getGlobalRolePermissions();
  } catch {
    throw new ShoppingRequestCorrectionError("Hak akses belum dapat diverifikasi. Silakan coba lagi.", 503);
  }
  if (!canRoleAccessPage(user.role, "/suppliers", permissions) ||
      !canRolePerformAction(user.role, "supplier", "read", permissions)) {
    throw new ShoppingRequestCorrectionError("Anda belum memiliki izin melihat riwayat daftar belanja.", 403);
  }
  return { id: user.id, name: user.name, storeId: user.storeId };
}

export function correctionErrorResponse(error: unknown): Response {
  if (error instanceof ZodError) return apiError("Periksa kembali data koreksi daftar belanja.", 422, { code: "ValidationError" });
  if (error instanceof ShoppingRequestCorrectionError) {
    const code = error.status === 401 ? "Unauthorized" : error.status === 403 ? "Forbidden" : error.status === 404 ? "NotFound" : error.status === 503 ? "ServiceUnavailable" : "Conflict";
    return apiError(error.message, error.status, { code });
  }
  log.error("shopping_requests.correction.failed", { error });
  return apiError("Koreksi belum dapat diproses. Silakan coba lagi.", 500, { code: "InternalError" });
}
