import { createHash } from "node:crypto";
import { db } from "@pos/db";
import type { Prisma } from "@pos/db";
import {
  buildDefaultRolePermissions,
  flattenRolePermissions,
  normalizeRolePermissions,
  EDITABLE_ROLES,
  RESOURCE_SCOPE,
  TRANSITION_RESOURCE_PERMISSIONS,
} from "./rbac-core";
import type { EditablePermissionEntry, PermissionEntry, RolePermissions } from "./rbac-core";
import { buildRolePermissionUpserts, parseRolePermissionPayload } from "./rbac-settings";

type PermissionReader = Pick<Prisma.TransactionClient, "rolePermission">;

export type RolePermissionSnapshot = {
  permissions: EditablePermissionEntry[];
  version: string;
  audit?: { id: string; actorName: string; createdAt: Date; changes: Prisma.JsonValue }[];
};

export class RolePermissionConflictError extends Error {
  readonly statusCode = 409;

  constructor() {
    super("Hak akses telah diubah oleh Owner lain. Periksa versi terbaru sebelum menyimpan lagi.");
  }
}

async function loadGlobalRolePermissions(client: PermissionReader = db): Promise<RolePermissions> {
  const rows = await client.rolePermission.findMany({
    select: {
      role: true,
      scope: true,
      target: true,
      action: true,
      allowed: true,
    },
  });

  return rows.length > 0
    ? normalizeRolePermissions(rows as PermissionEntry[])
    : buildDefaultRolePermissions();
}

export async function getGlobalRolePermissions(): Promise<RolePermissions> {
  // Authorization must observe revocations made by every server instance.
  // Defaults apply only to an empty configuration; read errors propagate.
  return loadGlobalRolePermissions();
}

export async function getFreshGlobalRolePermissions(): Promise<RolePermissions> {
  return loadGlobalRolePermissions();
}

export async function getGlobalRolePermissionEntries(): Promise<EditablePermissionEntry[]> {
  return flattenRolePermissions(await getGlobalRolePermissions());
}

function buildSnapshot(permissions: RolePermissions): RolePermissionSnapshot {
  const entries = flattenRolePermissions(permissions).sort((a, b) =>
    `${a.role}:${a.scope}:${a.target}:${a.action}`.localeCompare(`${b.role}:${b.scope}:${b.target}:${b.action}`),
  );
  return {
    permissions: entries,
    version: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
  };
}

export async function getGlobalRolePermissionSnapshot(): Promise<RolePermissionSnapshot> {
  return buildSnapshot(await loadGlobalRolePermissions());
}

export async function getRolePermissionAudit() {
  return db.rolePermissionAudit.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, actorName: true, createdAt: true, changes: true },
  });
}

export async function saveGlobalRolePermissions(
  entries: EditablePermissionEntry[],
  options: { version: string; actor: { id: string; name: string; storeId: string | null } },
): Promise<RolePermissionSnapshot> {
  const validated = parseRolePermissionPayload(entries);
  return db.$transaction(async (tx) => {
    // One database lock serializes saves across processes, including the first
    // save when there are no permission rows to lock yet. ReadCommitted makes
    // the following read see the preceding lock holder's committed changes.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(191905027, 1)::text`;
    const current = await loadGlobalRolePermissions(tx);
    const before = buildSnapshot(current);
    if (before.version !== options.version) throw new RolePermissionConflictError();

    // Pin pre-patch effective access in one batch. Existing explicit decisions
    // win via skipDuplicates; this migration does not itself create an audit.
    await tx.rolePermission.createMany({
      data: EDITABLE_ROLES.flatMap((role) => Object.entries(TRANSITION_RESOURCE_PERMISSIONS).flatMap(([target, transition]) =>
        transition.actions.map((action) => ({
          role, scope: RESOURCE_SCOPE, target, action,
          allowed: current[role].resources[target][action],
        })),
      )),
      skipDuplicates: true,
    });

    const changedEntries = validated.filter((entry) => {
      const allowed = entry.scope === "page"
        ? current[entry.role].pages[entry.target]
        : current[entry.role].resources[entry.target]?.[entry.action as "create" | "read" | "update" | "delete"];
      return allowed !== entry.allowed;
    });

    if (changedEntries.length === 0) return before;
    for (const upsert of buildRolePermissionUpserts(changedEntries)) {
      await tx.rolePermission.upsert(upsert);
    }
    const after = buildSnapshot(await loadGlobalRolePermissions(tx));
    const audit = await tx.rolePermissionAudit.create({
      data: {
        actorId: options.actor.id,
        actorName: options.actor.name,
        actorStoreId: options.actor.storeId,
        versionBefore: before.version,
        versionAfter: after.version,
        changes: changedEntries.map((entry) => ({ ...entry, before: !entry.allowed })),
      },
    });
    return { ...after, audit: [audit] };
  }, { isolationLevel: "ReadCommitted" });
}

/** Kept for callers upgrading from the old process-local cache. */
export function clearRolePermissionCache() {
  // Permission reads are deliberately uncached.
}
