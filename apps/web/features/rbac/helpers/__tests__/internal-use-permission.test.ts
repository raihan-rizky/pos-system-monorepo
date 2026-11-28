import { describe, expect, it } from "vitest";
import { buildDefaultRolePermissions, canRolePerformAction, normalizeRolePermissions } from "../rbac-core";

describe("internal usage edit permission", () => {
  it.each(["OWNER", "ADMIN", "INVENTORY"] as const)("grants %s pending edit by default", (role) => {
    expect(canRolePerformAction(role, "inventory.internal_use", "update", buildDefaultRolePermissions())).toBe(true);
  });

  it.each(["CASHIER", "SALES"] as const)("denies %s by default", (role) => {
    expect(canRolePerformAction(role, "inventory.internal_use", "update", buildDefaultRolePermissions())).toBe(false);
  });

  it("inherits an existing custom stock access grant until the new permission is configured", () => {
    const original = { role: "CASHIER", scope: "resource", target: "inventory", action: "update", allowed: true } as const;
    const inherited = normalizeRolePermissions([original]);
    const configured = normalizeRolePermissions([original, { ...original, target: "inventory.internal_use", allowed: false }]);

    expect(canRolePerformAction("CASHIER", "inventory.internal_use", "update", inherited)).toBe(true);
    expect(canRolePerformAction("CASHIER", "inventory.internal_use", "update", configured)).toBe(false);
  });
});
