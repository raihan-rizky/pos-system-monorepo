import {
  PAGE_ACTION,
  PAGE_SCOPE,
  RESOURCE_SCOPE,
  isEditableRole,
  isResourceAction,
  normalizePageTarget,
} from "./rbac-core";
import type { EditablePermissionEntry, PermissionEntry } from "./rbac-core";
import type { PermissionAction } from "./rbac-core";

type RawPermissionPayload = {
  role?: unknown;
  scope?: unknown;
  target?: unknown;
  action?: unknown;
  allowed?: unknown;
};

export type RolePermissionUpsert = {
  where: {
    role_scope_target_action: {
      role: EditablePermissionEntry["role"];
      scope: EditablePermissionEntry["scope"];
      target: string;
      action: EditablePermissionEntry["action"];
    };
  };
  create: EditablePermissionEntry;
  update: {
    allowed: boolean;
  };
};

export function parseRolePermissionPayload(payload: unknown): EditablePermissionEntry[] {
  if (!Array.isArray(payload)) {
    throw new Error("Permission payload must be an array");
  }

  return payload.map(parsePermissionEntry);
}

export function buildRolePermissionUpserts(
  entries: EditablePermissionEntry[],
): RolePermissionUpsert[] {
  return entries.map((entry) => ({
    where: {
      role_scope_target_action: {
        role: entry.role,
        scope: entry.scope,
        target: entry.target,
        action: entry.action,
      },
    },
    create: entry,
    update: {
      allowed: entry.allowed,
    },
  }));
}

function parsePermissionEntry(raw: RawPermissionPayload): EditablePermissionEntry {
  if (raw.role === "OWNER") {
    throw new Error("OWNER permissions cannot be edited");
  }

  if (typeof raw.role !== "string" || !isEditableRole(raw.role)) {
    throw new Error("Invalid permission role");
  }

  if (typeof raw.scope !== "string" || (raw.scope !== PAGE_SCOPE && raw.scope !== RESOURCE_SCOPE)) {
    throw new Error("Invalid permission scope");
  }

  if (typeof raw.target !== "string" || raw.target.trim() === "") {
    throw new Error("Invalid permission target");
  }

  if (typeof raw.action !== "string") {
    throw new Error("Invalid permission action");
  }

  if (typeof raw.allowed !== "boolean") {
    throw new Error("Invalid permission allowed value");
  }

  const action = raw.action as PermissionAction;
  const entry: PermissionEntry = {
    role: raw.role,
    scope: raw.scope,
    target: raw.scope === PAGE_SCOPE ? normalizePageTarget(raw.target) : raw.target,
    action,
    allowed: raw.allowed,
  };

  if (entry.scope === PAGE_SCOPE && entry.action !== PAGE_ACTION) {
    throw new Error("Invalid permission action");
  }

  if (entry.scope === RESOURCE_SCOPE && !isResourceAction(entry.action)) {
    throw new Error("Invalid permission action");
  }

  return entry as EditablePermissionEntry;
}
