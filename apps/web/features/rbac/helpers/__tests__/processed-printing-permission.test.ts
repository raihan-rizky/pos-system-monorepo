import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  EDITABLE_ROLES,
  RESOURCE_TARGETS,
  buildDefaultRolePermissions,
  canRolePerformAction,
  flattenRolePermissions,
  normalizeRolePermissions,
} from "../rbac-core";
import { buildRolePermissionUpserts, parseRolePermissionPayload } from "../rbac-settings";
import { RBAC_PERMISSION_MODULES, buildPermissionChanges } from "../rbac-settings-ui";

const target = "printing_receipt.processed";

describe("processed printing receipt permission", () => {
  it("registers a separate resource closed for every non-owner action by default", () => {
    expect(RESOURCE_TARGETS).toContain(target);
    const permissions = buildDefaultRolePermissions();

    expect(canRolePerformAction("OWNER", target, "update", permissions)).toBe(true);
    for (const role of EDITABLE_ROLES) {
      expect(permissions[role].resources[target]).toEqual({
        create: false, read: false, update: false, delete: false,
      });
      for (const action of ACTIONS) {
        expect(canRolePerformAction(role, target, action, permissions)).toBe(false);
      }
    }
  });

  it("keeps existing saved configurations closed without inheriting transaction edit access", () => {
    const legacyEntries = flattenRolePermissions(buildDefaultRolePermissions())
      .filter((entry) => entry.target !== target);
    const permissions = normalizeRolePermissions(legacyEntries);

    expect(canRolePerformAction("ADMIN", "transaction", "update", permissions)).toBe(true);
    for (const role of EDITABLE_ROLES) {
      expect(permissions[role].resources[target]?.update).toBe(false);
    }
  });

  it.each(EDITABLE_ROLES)("persists an explicit %s update grant and supports revocation", (role) => {
    const entries = parseRolePermissionPayload([
      { role, scope: "resource", target, action: "update", allowed: true },
    ]);
    const upserts = buildRolePermissionUpserts(entries);
    expect(upserts[0].create).toMatchObject({ role, target, action: "update", allowed: true });
    const permissions = normalizeRolePermissions(entries);
    expect(canRolePerformAction(role, target, "update", permissions)).toBe(true);
    expect(canRolePerformAction(role, target, "delete", permissions)).toBe(false);

    const revoked = normalizeRolePermissions([{ ...entries[0], allowed: false }]);
    expect(canRolePerformAction(role, target, "update", revoked)).toBe(false);
  });

  it("shows a dedicated critical setting explaining financial, stock, and debt impact", () => {
    const modules = RBAC_PERMISSION_MODULES.filter((module) => module.resourceTargets.includes(target));
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({
      label: "Edit nota percetakan diproses",
      pageTargets: [],
      resourceTargets: [target],
      sensitivity: "critical",
    });
    expect(modules[0].description).toMatch(/keuangan/i);
    expect(modules[0].description).toMatch(/stok/i);
    expect(modules[0].description).toMatch(/piutang/i);
    const permissions = normalizeRolePermissions([
      { role: "ADMIN", scope: "resource", target, action: "update", allowed: true },
    ]);
    expect(buildPermissionChanges(permissions)).toContainEqual(expect.objectContaining({
      target, action: "update", sensitivity: "critical", requiresConfirmation: true,
    }));
  });
});
