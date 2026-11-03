import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditablePermissionEntry } from "../rbac-core";

const persistence = vi.hoisted(() => ({
  rows: [] as EditablePermissionEntry[],
  audits: [] as Record<string, unknown>[],
  readFailure: false,
  auditFailure: false,
  events: [] as string[],
}));

vi.mock("@pos/db", () => {
  const rolePermission = {
    createMany: vi.fn(async ({ data, skipDuplicates }: { data: EditablePermissionEntry[]; skipDuplicates: boolean }) => {
      if (!skipDuplicates) throw new Error("transition insertion must preserve existing rows");
      persistence.events.push("materialize");
      let count = 0;
      for (const entry of data) {
        if (persistence.rows.some(row => row.role === entry.role && row.scope === entry.scope && row.target === entry.target && row.action === entry.action)) continue;
        persistence.rows.push(entry);
        count++;
      }
      return { count };
    }),
    findMany: vi.fn(async () => {
      persistence.events.push("read");
      if (persistence.readFailure) throw new Error("database unavailable");
      return structuredClone(persistence.rows);
    }),
    upsert: vi.fn(async ({ create }: { create: EditablePermissionEntry }) => {
      persistence.events.push("write");
      const index = persistence.rows.findIndex(row => row.role === create.role && row.scope === create.scope && row.target === create.target && row.action === create.action);
      if (index === -1) persistence.rows.push(create);
      else persistence.rows[index] = create;
      return create;
    }),
  };
  const tx = {
    rolePermission,
    $queryRaw: vi.fn(async () => { persistence.events.push("lock"); return []; }),
    rolePermissionAudit: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (persistence.auditFailure) throw new Error("audit unavailable");
        persistence.audits.push(data);
        return data;
      }),
      findMany: vi.fn(async () => persistence.audits),
    },
  };
  return { db: {
    ...tx,
    $transaction: vi.fn(async (operation: ((client: typeof tx) => Promise<unknown>) | Promise<unknown>[]) => {
      const originalRows = structuredClone(persistence.rows);
      try { return typeof operation === "function" ? await operation(tx) : await Promise.all(operation); }
      catch (error) { persistence.rows = originalRows; throw error; }
    }),
  } };
});

import { getGlobalRolePermissions, getGlobalRolePermissionSnapshot, saveGlobalRolePermissions, clearRolePermissionCache } from "../rbac-server";

const grant: EditablePermissionEntry = { role: "SALES", scope: "resource", target: "transaction", action: "update", allowed: true };
const actor = { id: "owner-1", name: "Pemilik", storeId: "store-1" };

describe("RBAC persisted authorization and saving", () => {
  beforeEach(() => {
    persistence.rows = [];
    persistence.audits = [];
    persistence.events = [];
    persistence.readFailure = false;
    persistence.auditFailure = false;
    clearRolePermissionCache();
  });

  it("rejects a grant immediately after another instance revokes it", async () => {
    persistence.rows = [grant];
    expect((await getGlobalRolePermissions()).SALES.resources.transaction.update).toBe(true);
    persistence.rows = [{ ...grant, allowed: false }];
    expect((await getGlobalRolePermissions()).SALES.resources.transaction.update).toBe(false);
  });

  it("does not reuse a previous grant when verification fails", async () => {
    persistence.rows = [grant];
    await getGlobalRolePermissions();
    persistence.readFailure = true;
    await expect(getGlobalRolePermissions()).rejects.toThrow("database unavailable");
  });

  it("rejects stale snapshots before writing and preserves the first owner's changes", async () => {
    const baseline = await getGlobalRolePermissionSnapshot();
    await saveGlobalRolePermissions([grant], { version: baseline.version, actor });
    const firstSaveRows = structuredClone(persistence.rows);
    await expect(saveGlobalRolePermissions([
      { role: "CASHIER", scope: "page", target: "/products", action: "access", allowed: true },
    ], { version: baseline.version, actor: { ...actor, id: "owner-2" } })).rejects.toMatchObject({ statusCode: 409 });
    expect(persistence.rows).toEqual(firstSaveRows);
    expect(persistence.rows).toContainEqual(grant);
    expect(persistence.audits).toHaveLength(1);
    expect(persistence.events.indexOf("lock")).toBeLessThan(persistence.events.lastIndexOf("read"));
  });

  it("records only actual changes with the authenticated actor in the same transaction", async () => {
    const baseline = await getGlobalRolePermissionSnapshot();
    const result = await saveGlobalRolePermissions([
      grant,
      { role: "SALES", scope: "resource", target: "transaction", action: "read", allowed: true },
    ], { version: baseline.version, actor });
    expect(result.version).not.toBe(baseline.version);
    expect(persistence.rows).toContainEqual(grant);
    expect(persistence.audits[0]).toMatchObject({
      actorId: "owner-1", actorName: "Pemilik", actorStoreId: "store-1",
      versionBefore: baseline.version, versionAfter: result.version,
      changes: [{ ...grant, before: false }],
    });
  });

  it("rolls back permission changes when the audit cannot be recorded", async () => {
    const baseline = await getGlobalRolePermissionSnapshot();
    persistence.auditFailure = true;
    await expect(saveGlobalRolePermissions([grant], { version: baseline.version, actor })).rejects.toThrow("audit unavailable");
    expect(persistence.rows).toEqual([]);
  });

  it("pins inherited values before changing their parent and audits only the patch", async () => {
    const parent: EditablePermissionEntry = { role: "SALES", scope: "resource", target: "product", action: "update", allowed: true };
    persistence.rows = [parent];
    const baseline = await getGlobalRolePermissionSnapshot();
    persistence.events = [];
    await saveGlobalRolePermissions([{ ...parent, allowed: false }], { version: baseline.version, actor });
    expect((await getGlobalRolePermissions()).SALES.resources["transaction.custom_price"]?.update).toBe(true);
    expect(persistence.rows).toContainEqual({ ...parent, target: "transaction.custom_price" });
    expect(persistence.events.slice(0, 4)).toEqual(["lock", "read", "materialize", "write"]);
    expect(persistence.events.filter(event => event === "materialize")).toHaveLength(1);
    expect(persistence.audits[0].changes).toEqual([{ ...parent, allowed: false, before: true }]);
  });

  it("materializes a no-op first save without audit or snapshot change", async () => {
    const baseline = await getGlobalRolePermissionSnapshot();
    const result = await saveGlobalRolePermissions([], { version: baseline.version, actor });
    expect(persistence.rows).toHaveLength(76);
    expect(persistence.rows.filter(row => row.target === "income.manual")).toHaveLength(16);
    expect(persistence.rows).toContainEqual({ role: "ADMIN", scope: "resource", target: "income.manual", action: "create", allowed: true });
    expect(result.version).toBe(baseline.version);
    expect(persistence.audits).toEqual([]);
  });

  it("keeps an explicit denial when materializing and rolls back materialization on audit failure", async () => {
    const explicit: EditablePermissionEntry = { role: "ADMIN", scope: "resource", target: "transaction.custom_price", action: "update", allowed: false };
    persistence.rows = [explicit];
    const baseline = await getGlobalRolePermissionSnapshot();
    persistence.auditFailure = true;
    await expect(saveGlobalRolePermissions([grant], { version: baseline.version, actor })).rejects.toThrow("audit unavailable");
    expect(persistence.rows).toEqual([explicit]);
    persistence.auditFailure = false;
    await saveGlobalRolePermissions([grant], { version: baseline.version, actor });
    expect((await getGlobalRolePermissions()).ADMIN.resources["transaction.custom_price"].update).toBe(false);
  });
});
