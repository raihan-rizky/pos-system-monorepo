import { AuthError, requireRole } from "@/lib/rbac/guard";
import {
  ALL_ROLES,
  buildDefaultRolePermissions,
  canRolePerformAction,
} from "@/features/rbac/helpers/rbac-core";
import { getFreshGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";

export async function requireProcessedPrintingReceiptPermission() {
  const user = await requireRole(...ALL_ROLES);
  const isE2E = process.env.NODE_ENV !== "production" && process.env.E2E_AUTH_BYPASS === "1";
  const permissions = isE2E
    ? buildDefaultRolePermissions()
    : await getFreshGlobalRolePermissions();

  if (!canRolePerformAction(user.role, "printing_receipt.processed", "update", permissions)) {
    throw new AuthError(403, "Anda belum memiliki izin untuk mengedit nota percetakan yang sudah diproses.");
  }

  return user;
}
