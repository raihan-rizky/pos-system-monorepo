import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import { buildAuthorizationFingerprint } from "@/features/rbac/helpers/authorization-fingerprint";

export async function GET() {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");
    const permissions = process.env.NODE_ENV !== "production" && process.env.E2E_AUTH_BYPASS === "1"
      ? buildDefaultRolePermissions()
      : await getGlobalRolePermissions();
    return NextResponse.json({
      user: { id: user.id, name: user.name, role: user.role, storeId: user.storeId },
      permissions,
      authorizationFingerprint: buildAuthorizationFingerprint(user.role, permissions),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleAuthError(error) ?? NextResponse.json({ message: "Hak akses belum dapat diverifikasi. Silakan coba lagi." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
