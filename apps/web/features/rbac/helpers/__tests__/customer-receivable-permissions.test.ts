import { describe, expect, it } from "vitest";
import {
  buildDefaultRolePermissions,
  canRolePerformAction,
  normalizeRolePermissions,
  type PermissionEntry,
  type ResourceAction,
  type Role,
} from "../rbac-core";
import { RBAC_RESOURCE_METADATA } from "../rbac-activity-catalog";
import { RBAC_PERMISSION_MODULES } from "../rbac-settings-ui";

function grants(role: Role, entries: PermissionEntry[] | null = null) {
  const permissions = entries === null ? buildDefaultRolePermissions() : normalizeRolePermissions(entries);
  const actions: ResourceAction[] = ["read", "create", "update"];
  return [
    ...actions.map((action) => canRolePerformAction(role, "customer.receivable", action, permissions)),
    canRolePerformAction(role, "customer.receivable.payment", "create", permissions),
  ];
}

describe("customer receivable permissions", () => {
  it.each([
    ["OWNER", [true, true, true, true]],
    ["ADMIN", [true, true, true, true]],
    ["SALES", [true, false, false, false]],
    ["CASHIER", [true, false, false, false]],
    ["INVENTORY", [false, false, false, false]],
  ] as const)("provides the intended %s default", (role, expected) => {
    expect(grants(role)).toEqual(expected);
  });

  it("keeps customer profile and unrelated defaults independent", () => {
    const permissions = buildDefaultRolePermissions();
    expect(canRolePerformAction("SALES", "customer", "update", permissions)).toBe(true);
    expect(canRolePerformAction("CASHIER", "transaction", "update", permissions)).toBe(true);
    expect(canRolePerformAction("CASHIER", "financial-report", "read", permissions)).toBe(false);
  });

  it("preserves a legacy customer-read denial until the new permission is granted", () => {
    const entries: PermissionEntry[] = [
      { role: "SALES", scope: "resource", target: "customer", action: "read", allowed: false },
    ];
    expect(grants("SALES", entries)).toEqual([false, false, false, false]);
    expect(grants("SALES", [...entries, {
      role: "SALES", scope: "resource", target: "customer.receivable", action: "read", allowed: true,
    }])).toEqual([true, false, false, false]);
  });

  it("does not broaden customized legacy Admin mutation permissions", () => {
    const entries: PermissionEntry[] = [
      { role: "ADMIN", scope: "resource", target: "customer", action: "update", allowed: false },
      { role: "ADMIN", scope: "resource", target: "transaction", action: "update", allowed: true },
    ];
    expect(grants("ADMIN", entries)).toEqual([true, false, false, false]);
  });

  it("requires both legacy mutation grants to default Admin payment on existing installations", () => {
    const entries: PermissionEntry[] = [
      { role: "ADMIN", scope: "resource", target: "transaction", action: "update", allowed: false },
    ];
    expect(grants("ADMIN", entries)).toEqual([true, true, true, false]);
  });

  it("honors an explicit new payment grant independently of old permissions", () => {
    const entries: PermissionEntry[] = [
      { role: "SALES", scope: "resource", target: "customer.receivable.payment", action: "create", allowed: true },
    ];
    expect(grants("SALES", entries)).toEqual([true, false, false, true]);
  });

  it("offers separate receivable actions in the customer settings module", () => {
    expect(RBAC_RESOURCE_METADATA["customer.receivable"]?.actions).toEqual(["read", "create", "update"]);
    expect(RBAC_RESOURCE_METADATA["customer.receivable.payment"]?.actions).toEqual(["create"]);
    expect(RBAC_PERMISSION_MODULES.find((module) => module.id === "customers")?.resourceTargets)
      .toEqual(expect.arrayContaining(["customer", "customer.receivable", "customer.receivable.payment"]));
  });
});
