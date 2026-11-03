import { ACTIONS, EDITABLE_ROLES, PAGE_TARGETS, RESOURCE_TARGETS, flattenRolePermissions, normalizeRolePermissions } from "./rbac-core";
import type { EditablePermissionEntry, PermissionEntry, RolePermissions } from "./rbac-core";
import { parseRolePermissionPayload } from "./rbac-settings";

export type PermissionAuditEntry = {
  id: string;
  actorName: string;
  createdAt: string;
  changes: (EditablePermissionEntry & { before: boolean })[];
};
export type RbacSettingsSnapshot = { permissions: PermissionEntry[]; version: string; audit: PermissionAuditEntry[] };

export class PermissionSaveError extends Error {
  constructor(message: string, public readonly statusCode: number) { super(message); }
}

export function buildPermissionPatch(current: RolePermissions, baseline: RolePermissions): EditablePermissionEntry[] {
  const previous = new Map(flattenRolePermissions(baseline).map(entry => [`${entry.role}:${entry.scope}:${entry.target}:${entry.action}`, entry.allowed]));
  return flattenRolePermissions(current).filter(entry =>
    previous.get(`${entry.role}:${entry.scope}:${entry.target}:${entry.action}`) !== entry.allowed,
  );
}

async function readSettingsResponse(response: Response): Promise<RbacSettingsSnapshot> {
  const body = await response.json();
  if (!response.ok) throw new PermissionSaveError(body.message || "Hak akses belum dapat disimpan. Silakan coba lagi.", response.status);
  const expectedCount = EDITABLE_ROLES.length * (PAGE_TARGETS.length + RESOURCE_TARGETS.length * ACTIONS.length);
  if (!Array.isArray(body.permissions) || body.permissions.length !== expectedCount ||
    typeof body.version !== "string" || !/^[a-f0-9]{64}$/.test(body.version)) {
    throw new Error("Data hak akses belum lengkap. Silakan muat ulang.");
  }
  const entries = parseRolePermissionPayload(body.permissions);
  // Parsing rejects unknown/duplicate entries; normalize enforces Owner policy.
  const permissions = flattenRolePermissions(normalizeRolePermissions(entries));
  return { permissions, version: body.version, audit: Array.isArray(body.audit) ? body.audit : [] };
}

export async function loadRbacSettings(): Promise<RbacSettingsSnapshot> {
  return readSettingsResponse(await fetch("/api/settings/rbac", { cache: "no-store" }));
}

export async function saveRbacChanges(current: RolePermissions, baseline: RolePermissions, version: string): Promise<RbacSettingsSnapshot> {
  return readSettingsResponse(await fetch("/api/settings/rbac", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions: buildPermissionPatch(current, baseline), version }),
  }));
}

export function notifyPermissionsChanged(version: string) {
  window.dispatchEvent(new Event("pos:permissions-changed"));
  try { window.localStorage.setItem("pos:permissions-version", version); } catch { /* Private mode can disable storage. */ }
}
