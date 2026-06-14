export const OWNER_ROLE = "OWNER" as const;
export const EDITABLE_ROLES = ["ADMIN", "CASHIER", "SALES"] as const;
export const ALL_ROLES = [OWNER_ROLE, ...EDITABLE_ROLES] as const;
export const ACTIONS = ["create", "read", "update", "delete"] as const;
export const PAGE_ACTION = "access" as const;
export const PAGE_SCOPE = "page" as const;
export const RESOURCE_SCOPE = "resource" as const;
export const OWNER_LOCKED_RESOURCE_TARGETS: ReadonlySet<string> = new Set([
  "inventory.approve",
]);

export type OwnerRole = typeof OWNER_ROLE;
export type EditableRole = (typeof EDITABLE_ROLES)[number];
export type Role = (typeof ALL_ROLES)[number];
export type ResourceAction = (typeof ACTIONS)[number];
export type PermissionScope = typeof PAGE_SCOPE | typeof RESOURCE_SCOPE;
export type PermissionAction = ResourceAction | typeof PAGE_ACTION;

export type PermissionEntry = {
  role: Role;
  scope: PermissionScope;
  target: string;
  action: PermissionAction;
  allowed: boolean;
};

export type EditablePermissionEntry = PermissionEntry & {
  role: EditableRole;
};

export type RolePermissions = Record<
  EditableRole,
  {
    pages: Record<string, boolean>;
    resources: Record<string, Record<ResourceAction, boolean>>;
  }
>;

export const PAGE_TARGETS = [
  "/dashboard",
  "/financial-report",
  "/pos",
  "/history",
  "/production",
  "/customers",
  "/products",
  "/suppliers",
  "/salespersons",
  "/shift",
  "/wa",
  "/settings",
  "/keuangan",
] as const;

export const RESOURCE_TARGETS = [
  "transaction",
  "financial-report",
  "transaction.request",
  "transaction.approve",
  "transaction.draft",
  "surat_jalan",
  "production",
  "customer",
  "product",
  "supplier",
  "inventory",
  "inventory.approve",
  "shift",
  "salesperson",
  "settings",
  "whatsapp",
  "rbac",
  "expense",
  "income",
] as const;

type LegacyAction = "read" | "write" | "delete";

const LEGACY_PAGE_ACCESS: Record<string, Role[]> = {
  "/dashboard": ["OWNER", "ADMIN"],
  "/financial-report": ["OWNER", "ADMIN"],
  "/pos": ["OWNER", "ADMIN", "CASHIER", "SALES"],
  "/history": ["OWNER", "ADMIN", "CASHIER", "SALES"],
  "/production": ["OWNER", "ADMIN", "CASHIER", "SALES"],
  "/customers": ["OWNER", "ADMIN", "CASHIER", "SALES"],
  "/products": ["OWNER", "ADMIN"],
  "/suppliers": ["OWNER", "ADMIN"],
  "/salespersons": ["OWNER", "ADMIN"],
  "/shift": ["OWNER", "ADMIN", "CASHIER"],
  "/wa": ["OWNER", "ADMIN"],
  "/settings": ["OWNER", "ADMIN"],
  "/keuangan": ["OWNER", "ADMIN", "CASHIER"],
};

const LEGACY_ACTION_ACCESS: Record<string, Record<LegacyAction, Role[]>> = {
  transaction: {
    read: ["OWNER", "ADMIN", "CASHIER", "SALES"],
    write: ["OWNER", "ADMIN", "CASHIER"],
    delete: ["OWNER", "ADMIN"],
  },
  "financial-report": {
    read: ["OWNER", "ADMIN"],
    write: [],
    delete: [],
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
  supplier: {
    read: ["OWNER", "ADMIN"],
    write: ["OWNER", "ADMIN"],
    delete: ["OWNER", "ADMIN"],
  },
  inventory: {
    read: ["OWNER", "ADMIN"],
    write: ["OWNER", "ADMIN"],
    delete: ["OWNER", "ADMIN"],
  },
  "inventory.approve": {
    read: ["OWNER"],
    write: ["OWNER"],
    delete: [],
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
  whatsapp: {
    read: ["OWNER", "ADMIN"],
    write: ["OWNER", "ADMIN"],
    delete: ["OWNER", "ADMIN"],
  },
  rbac: {
    read: ["OWNER"],
    write: ["OWNER"],
    delete: ["OWNER"],
  },
  expense: {
    read: ["OWNER", "ADMIN", "CASHIER"],
    write: ["OWNER", "ADMIN", "CASHIER"],
    delete: ["OWNER", "ADMIN"],
  },
  income: {
    read: ["OWNER", "ADMIN", "CASHIER"],
    write: [],
    delete: [],
  },
};

// Granular per-action overrides for resources where legacy write=create+update
// is too coarse. Entries here win over LEGACY_ACTION_ACCESS during defaults
// build-out. SALES can create a draft but cannot approve or cancel one.
const RESOURCE_GRANULAR_ACCESS: Partial<
  Record<string, Record<ResourceAction, Role[]>>
> = {
  "transaction.draft": {
    read: ["OWNER", "ADMIN", "CASHIER", "SALES"],
    create: ["OWNER", "ADMIN", "CASHIER", "SALES"],
    update: ["OWNER", "ADMIN", "CASHIER"],
    delete: ["OWNER", "ADMIN", "CASHIER"],
  },
  surat_jalan: {
    read: ["OWNER", "ADMIN", "CASHIER", "SALES"],
    create: ["OWNER", "ADMIN", "CASHIER", "SALES"],
    update: ["OWNER"],
    delete: ["OWNER"],
  },
};

export function buildDefaultRolePermissions(): RolePermissions {
  const permissions = emptyRolePermissions();

  for (const role of EDITABLE_ROLES) {
    for (const page of PAGE_TARGETS) {
      permissions[role].pages[page] = LEGACY_PAGE_ACCESS[page]?.includes(role) ?? false;
    }

    for (const resource of RESOURCE_TARGETS) {
      const granular = RESOURCE_GRANULAR_ACCESS[resource];
      if (granular) {
        permissions[role].resources[resource] = {
          create: granular.create.includes(role),
          read: granular.read.includes(role),
          update: granular.update.includes(role),
          delete: granular.delete.includes(role),
        };
        continue;
      }
      permissions[role].resources[resource] = {
        create: LEGACY_ACTION_ACCESS[resource]?.write.includes(role) ?? false,
        read: LEGACY_ACTION_ACCESS[resource]?.read.includes(role) ?? false,
        update: LEGACY_ACTION_ACCESS[resource]?.write.includes(role) ?? false,
        delete: LEGACY_ACTION_ACCESS[resource]?.delete.includes(role) ?? false,
      };
    }
  }

  return permissions;
}

export function normalizeRolePermissions(entries: PermissionEntry[]): RolePermissions {
  const permissions = buildDefaultRolePermissions();

  for (const entry of entries) {
    if (!isEditableRole(entry.role)) continue;

    if (entry.scope === PAGE_SCOPE && entry.action === PAGE_ACTION) {
      permissions[entry.role].pages[normalizePageTarget(entry.target)] = entry.allowed;
      continue;
    }

    if (
      entry.scope === RESOURCE_SCOPE &&
      isResourceAction(entry.action) &&
      !isOwnerLockedResource(entry.target)
    ) {
      permissions[entry.role].resources[entry.target] ??= {
        create: false,
        read: false,
        update: false,
        delete: false,
      };
      permissions[entry.role].resources[entry.target][entry.action] = entry.allowed;
    }
  }

  return permissions;
}

export function flattenRolePermissions(permissions: RolePermissions): EditablePermissionEntry[] {
  return EDITABLE_ROLES.flatMap((role) => [
    ...Object.entries(permissions[role].pages).map(([target, allowed]) => ({
      role,
      scope: PAGE_SCOPE,
      target,
      action: PAGE_ACTION,
      allowed,
    })),
    ...Object.entries(permissions[role].resources).flatMap(([target, actions]) =>
      ACTIONS.map((action) => ({
        role,
        scope: RESOURCE_SCOPE,
        target,
        action,
        allowed: actions[action],
      })),
    ),
  ]);
}

export function canRoleAccessPage(
  role: Role,
  path: string,
  permissions: RolePermissions = buildDefaultRolePermissions(),
): boolean {
  if (role === OWNER_ROLE) return true;
  if (!isEditableRole(role)) return false;

  return permissions[role].pages[normalizePageTarget(path)] ?? false;
}

export function canRolePerformAction(
  role: Role,
  resource: string,
  action: ResourceAction,
  permissions: RolePermissions = buildDefaultRolePermissions(),
): boolean {
  if (role === OWNER_ROLE) return true;
  if (!isEditableRole(role)) return false;

  return permissions[role].resources[resource]?.[action] ?? false;
}

export function isEditableRole(value: string): value is EditableRole {
  return (EDITABLE_ROLES as readonly string[]).includes(value);
}

export function isValidRole(value: string): value is Role {
  return (ALL_ROLES as readonly string[]).includes(value);
}

export function isResourceAction(value: string): value is ResourceAction {
  return (ACTIONS as readonly string[]).includes(value);
}

export function isOwnerLockedResource(target: string): boolean {
  return OWNER_LOCKED_RESOURCE_TARGETS.has(target);
}

export function normalizePageTarget(path: string): string {
  const segment = path.split("?")[0].split("#")[0].split("/").filter(Boolean)[0];
  return segment ? `/${segment}` : "/";
}

function emptyRolePermissions(): RolePermissions {
  return {
    ADMIN: { pages: {}, resources: {} },
    CASHIER: { pages: {}, resources: {} },
    SALES: { pages: {}, resources: {} },
  };
}
