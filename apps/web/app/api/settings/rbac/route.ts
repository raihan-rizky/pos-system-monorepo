import { NextResponse } from "next/server";
import { handleAuthError, requireRole } from "@/lib/rbac/guard";
import {
  getGlobalRolePermissionEntries,
  saveGlobalRolePermissions,
} from "@/features/rbac/helpers/rbac-server";
import { parseRolePermissionPayload } from "@/features/rbac/helpers/rbac-settings";
import {
  ACTIONS,
  EDITABLE_ROLES,
  PAGE_TARGETS,
  RESOURCE_TARGETS,
} from "@/features/rbac/helpers/rbac-core";

export async function GET() {
  try {
    await requireRole("OWNER");

    return NextResponse.json({
      roles: EDITABLE_ROLES,
      pages: PAGE_TARGETS,
      resources: RESOURCE_TARGETS,
      actions: ACTIONS,
      permissions: await getGlobalRolePermissionEntries(),
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("[GET /api/settings/rbac] Failed to load RBAC settings", error);
    return NextResponse.json({ message: "Failed to load RBAC settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await requireRole("OWNER");

    const body = await request.json();
    const permissions = parseRolePermissionPayload(
      Array.isArray(body) ? body : body.permissions,
    );

    return NextResponse.json({
      permissions: await saveGlobalRolePermissions(permissions),
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof Error && error.message.startsWith("Invalid")) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    if (error instanceof Error && error.message.includes("OWNER permissions")) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("[PUT /api/settings/rbac] Failed to save RBAC settings", error);
    return NextResponse.json({ message: "Failed to save RBAC settings" }, { status: 500 });
  }
}
