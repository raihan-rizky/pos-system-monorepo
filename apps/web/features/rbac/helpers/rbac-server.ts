import { db } from "@pos/db";
import {
  buildDefaultRolePermissions,
  flattenRolePermissions,
  normalizeRolePermissions,
} from "./rbac-core";
import type { EditablePermissionEntry, PermissionEntry, RolePermissions } from "./rbac-core";
import { buildRolePermissionUpserts } from "./rbac-settings";

const CACHE_TTL_MS = 60_000;

let permissionCache:
  | {
      permissions: RolePermissions;
      cachedAt: number;
    }
  | null = null;

export async function getGlobalRolePermissions(): Promise<RolePermissions> {
  const now = Date.now();
  if (permissionCache && now - permissionCache.cachedAt < CACHE_TTL_MS) {
    return permissionCache.permissions;
  }

  const rows = await db.rolePermission.findMany({
    select: {
      role: true,
      scope: true,
      target: true,
      action: true,
      allowed: true,
    },
  });

  const permissions =
    rows.length > 0 ? normalizeRolePermissions(rows as PermissionEntry[]) : buildDefaultRolePermissions();

  permissionCache = {
    permissions,
    cachedAt: now,
  };

  return permissions;
}

export async function getGlobalRolePermissionEntries(): Promise<EditablePermissionEntry[]> {
  return flattenRolePermissions(await getGlobalRolePermissions());
}

export async function saveGlobalRolePermissions(
  entries: EditablePermissionEntry[],
): Promise<EditablePermissionEntry[]> {
  const upserts = buildRolePermissionUpserts(entries);

  await db.$transaction(upserts.map((upsert) => db.rolePermission.upsert(upsert)));
  permissionCache = null;

  return getGlobalRolePermissionEntries();
}

export function clearRolePermissionCache() {
  permissionCache = null;
}
