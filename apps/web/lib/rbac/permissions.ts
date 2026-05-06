// ============================================================
// RBAC Permission Map — Single Source of Truth
// ============================================================

export type Role = "OWNER" | "ADMIN" | "CASHIER" | "SALES";
export type Action = "read" | "write" | "delete";

/**
 * Page-level access control.
 * Maps a top-level route segment to the roles that can access it.
 */
export const PAGE_ACCESS: Record<string, Role[]> = {
  "/dashboard": ["OWNER", "ADMIN"],
  "/pos": ["OWNER", "ADMIN", "CASHIER", "SALES"],
  "/history": ["OWNER", "ADMIN", "CASHIER", "SALES"],
  "/production": ["OWNER", "ADMIN", "CASHIER", "SALES"],
  "/customers": ["OWNER", "ADMIN", "CASHIER", "SALES"],
  "/products": ["OWNER", "ADMIN"],
  "/salespersons": ["OWNER", "ADMIN"],
  "/shift": ["OWNER", "ADMIN", "CASHIER"],
  "/wa": ["OWNER", "ADMIN"],
  "/settings": ["OWNER", "ADMIN"],
};

/**
 * Fine-grained action permissions per resource.
 * Used by API route guards to check specific operations.
 */
export const ACTION_ACCESS: Record<string, Record<Action, Role[]>> = {
  transaction: {
    read: ["OWNER", "ADMIN", "CASHIER", "SALES"],
    write: ["OWNER", "ADMIN", "CASHIER"],
    delete: ["OWNER", "ADMIN"],
  },
  "transaction.request": {
    read: ["SALES"],
    write: ["SALES"],
    delete: ["SALES"],
  },
  "transaction.approve": {
    read: ["OWNER", "ADMIN", "CASHIER"],
    write: ["OWNER", "ADMIN", "CASHIER"],
    delete: ["OWNER", "ADMIN"],
  },
  production: {
    read: ["OWNER", "ADMIN", "CASHIER", "SALES"],
    write: ["OWNER", "ADMIN", "CASHIER"],
    delete: ["OWNER", "ADMIN"],
  },
  customer: {
    read: ["OWNER", "ADMIN", "CASHIER", "SALES"],
    write: ["OWNER", "ADMIN", "CASHIER", "SALES"],
    delete: ["OWNER", "ADMIN"],
  },
  product: {
    read: ["OWNER", "ADMIN", "CASHIER", "SALES"],
    write: ["OWNER", "ADMIN"],
    delete: ["OWNER", "ADMIN"],
  },
  inventory: {
    read: ["OWNER", "ADMIN"],
    write: ["OWNER", "ADMIN"],
    delete: ["OWNER", "ADMIN"],
  },
  shift: {
    read: ["OWNER", "ADMIN", "CASHIER", "SALES"],
    write: ["OWNER", "ADMIN", "CASHIER"],
    delete: ["OWNER", "ADMIN"],
  },
  salesperson: {
    read: ["OWNER", "ADMIN", "CASHIER", "SALES"],
    write: ["OWNER", "ADMIN"],
    delete: ["OWNER", "ADMIN"],
  },
  settings: {
    read: ["OWNER", "ADMIN"],
    write: ["OWNER", "ADMIN"],
    delete: ["OWNER", "ADMIN"],
  },
};

/**
 * Check if a role can access a given page path.
 * Normalizes the path to its top-level segment.
 */
export function canAccessPage(role: Role, path: string): boolean {
  const normalizedPath = "/" + path.split("/").filter(Boolean)[0];
  return PAGE_ACCESS[normalizedPath]?.includes(role) ?? false;
}

/**
 * Check if a role can perform a specific action on a resource.
 */
export function canPerformAction(
  role: Role,
  resource: string,
  action: Action
): boolean {
  return ACTION_ACCESS[resource]?.[action]?.includes(role) ?? false;
}

/**
 * Default landing page per role — used for redirects after login
 * or when a user tries to access a page they don't have access to.
 */
export const DEFAULT_PAGE: Record<Role, string> = {
  OWNER: "/dashboard",
  ADMIN: "/dashboard",
  CASHIER: "/pos",
  SALES: "/pos",
};

/**
 * All valid roles — useful for validation.
 */
export const ALL_ROLES: Role[] = ["OWNER", "ADMIN", "CASHIER", "SALES"];

/**
 * Check if a string is a valid Role.
 */
export function isValidRole(value: string): value is Role {
  return ALL_ROLES.includes(value as Role);
}
