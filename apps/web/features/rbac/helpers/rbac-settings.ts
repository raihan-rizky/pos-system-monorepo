import {
  PAGE_ACTION,
  PAGE_SCOPE,
  RESOURCE_SCOPE,
  isEditableRole,
  isKnownPageTarget,
  isKnownResourceTarget,
  isOwnerLockedResource,
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

  const entries: EditablePermissionEntry[] = [];

  for (const raw of payload) {
    const entry = parsePermissionEntry(raw);
    if (entry) entries.push(entry);
  }

  return entries;
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

function parsePermissionEntry(raw: RawPermissionPayload): EditablePermissionEntry | null {
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

  const target =
    raw.scope === PAGE_SCOPE ? normalizePageTarget(raw.target) : raw.target;

  if (raw.scope === PAGE_SCOPE && !isKnownPageTarget(target)) {
    throw new Error("Invalid permission target");
  }

  if (raw.scope === RESOURCE_SCOPE && !isKnownResourceTarget(target)) {
    throw new Error("Invalid permission target");
  }

  const action = raw.action as PermissionAction;
  const entry: PermissionEntry = {
    role: raw.role,
    scope: raw.scope,
    target,
    action,
    allowed: raw.allowed,
  };

  if (entry.scope === PAGE_SCOPE && entry.action !== PAGE_ACTION) {
    throw new Error("Invalid permission action");
  }

  if (entry.scope === RESOURCE_SCOPE && !isResourceAction(entry.action)) {
    throw new Error("Invalid permission action");
  }

  if (entry.scope === RESOURCE_SCOPE && isOwnerLockedResource(entry.target)) return null;

  return entry as EditablePermissionEntry;
}
