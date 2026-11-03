import { createHash } from "node:crypto";
import { flattenRolePermissions } from "./rbac-core";
import type { Role, RolePermissions } from "./rbac-core";

export function buildAuthorizationFingerprint(role: Role | null, permissions: RolePermissions) {
  const entries = flattenRolePermissions(permissions).filter(entry => entry.role === role).sort((a, b) =>
    `${a.role}:${a.scope}:${a.target}:${a.action}`.localeCompare(`${b.role}:${b.scope}:${b.target}:${b.action}`),
  );
  return createHash("sha256").update(JSON.stringify({ role, entries })).digest("hex").slice(0, 16);
}
