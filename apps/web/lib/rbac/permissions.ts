// ============================================================
// RBAC Permission Map - compatibility facade
// ============================================================

import {
  ACTIONS,
  ALL_ROLES,
  EDITABLE_ROLES,
  PAGE_TARGETS,
  buildDefaultRolePermissions,
  canRoleAccessPage,
  canRolePerformAction,
  isValidRole,
} from "@/features/rbac/helpers/rbac-core";
import type { ResourceAction, Role } from "@/features/rbac/helpers/rbac-core";

export type { Role };
export type Action = ResourceAction;

const DEFAULT_PERMISSIONS = buildDefaultRolePermissions();

export const PAGE_ACCESS: Record<string, Role[]> = Object.fromEntries(
  PAGE_TARGETS.map((page) => [
    page,
    ALL_ROLES.filter((role) => canRoleAccessPage(role, page, DEFAULT_PERMISSIONS)),
  ]),
);

export const ACTION_ACCESS: Record<string, Record<Action, Role[]>> = Object.fromEntries(
  Object.keys(DEFAULT_PERMISSIONS.ADMIN.resources).map((resource) => [
    resource,
    Object.fromEntries(
      ACTIONS.map((action) => [
        action,
        ALL_ROLES.filter((role) =>
          canRolePerformAction(role, resource, action, DEFAULT_PERMISSIONS),
        ),
      ]),
    ),
  ]),
) as Record<string, Record<Action, Role[]>>;

/**
 * Check if a role can access a given page path.
 * Runtime settings are loaded separately for server/client contexts.
 */
export function canAccessPage(role: Role, path: string): boolean {
  return canRoleAccessPage(role, path, DEFAULT_PERMISSIONS);
}

/**
 * Check if a role can perform a specific action on a resource.
 */
export function canPerformAction(role: Role, resource: string, action: Action): boolean {
  return canRolePerformAction(role, resource, action, DEFAULT_PERMISSIONS);
}

/**
 * Default landing page per role - used for redirects after login
 * or when a user tries to access a page they don't have access to.
 */
export const DEFAULT_PAGE: Record<Role, string> = {
  OWNER: "/dashboard",
  ADMIN: "/dashboard",
  CASHIER: "/pos",
  SALES: "/pos",
};

export { ALL_ROLES, EDITABLE_ROLES, isValidRole };
