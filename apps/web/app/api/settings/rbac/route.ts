import { NextResponse } from "next/server";
import { handleAuthError, requireRole } from "@/lib/rbac/guard";
import {
  getGlobalRolePermissionSnapshot,
  getRolePermissionAudit,
  saveGlobalRolePermissions,
} from "@/features/rbac/helpers/rbac-server";
import { parseRolePermissionPayload } from "@/features/rbac/helpers/rbac-settings";
import {
  ACTIONS,
  EDITABLE_ROLES,
  PAGE_TARGETS,
  RESOURCE_TARGETS,
} from "@/features/rbac/helpers/rbac-core";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:settings:rbac");
export async function GET() {
  try {
    await requireRole("OWNER");

    const [snapshot, audit] = await Promise.all([
      getGlobalRolePermissionSnapshot(),
      getRolePermissionAudit(),
    ]);
    return NextResponse.json({
      roles: EDITABLE_ROLES,
      pages: PAGE_TARGETS,
      resources: RESOURCE_TARGETS,
      actions: ACTIONS,
      ...snapshot,
      audit,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[GET /api/settings/rbac] Failed to load RBAC settings", error);
    return NextResponse.json({ message: "Hak akses belum dapat dimuat. Silakan coba lagi." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireRole("OWNER");

    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.version !== "string" || !/^[a-f0-9]{64}$/.test(body.version)) {
      return NextResponse.json({ message: "Versi hak akses belum valid. Muat ulang sebelum menyimpan." }, { status: 422 });
    }
    const permissions = parseRolePermissionPayload(
      body.permissions,
    );

    return NextResponse.json({
      ...await saveGlobalRolePermissions(permissions, { version: body.version, actor }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof Error && "statusCode" in error && error.statusCode === 409) {
      return NextResponse.json({ message: error.message, code: "Conflict" }, { status: 409 });
    }

    if (error instanceof SyntaxError || (error instanceof Error &&
      /^(Invalid|OWNER permissions|Permission payload)/.test(error.message))) {
      return NextResponse.json({ message: "Data hak akses tidak valid. Periksa pilihan dan coba lagi." }, { status: 422 });
    }

    log.error("[PUT /api/settings/rbac] Failed to save RBAC settings", error);
    return NextResponse.json({ message: "Hak akses belum dapat disimpan. Perubahan Anda tetap tersedia; silakan coba lagi." }, { status: 503 });
  }
}
