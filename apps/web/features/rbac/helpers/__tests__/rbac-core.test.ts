import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  EDITABLE_ROLES,
  OWNER_ROLE,
  buildDefaultRolePermissions,
  canRoleAccessPage,
  canRolePerformAction,
  normalizeRolePermissions,
} from "../rbac-core";

describe("RBAC permission matrix", () => {
  it("keeps owner full-access and outside editable role settings", () => {
    expect(OWNER_ROLE).toBe("OWNER");
    expect(EDITABLE_ROLES).toEqual(["ADMIN", "CASHIER", "SALES"]);
    expect(EDITABLE_ROLES).not.toContain("OWNER");

    const defaults = buildDefaultRolePermissions();

    expect("OWNER" in defaults).toBe(false);
    expect(canRoleAccessPage("OWNER", "/settings/rbac", defaults)).toBe(true);
    expect(canRolePerformAction("OWNER", "rbac", "delete", defaults)).toBe(true);
  });

  it("uses create, read, update, and delete as resource actions", () => {
    expect(ACTIONS).toEqual(["create", "read", "update", "delete"]);
  });

  it("builds default permissions for editable roles from the existing RBAC baseline", () => {
    const defaults = buildDefaultRolePermissions();

    expect(canRoleAccessPage("ADMIN", "/products", defaults)).toBe(true);
    expect(canRoleAccessPage("CASHIER", "/products", defaults)).toBe(false);
    expect(canRoleAccessPage("SALES", "/pos", defaults)).toBe(true);

    expect(canRolePerformAction("ADMIN", "product", "update", defaults)).toBe(true);
    expect(canRolePerformAction("CASHIER", "product", "update", defaults)).toBe(false);
    expect(canRolePerformAction("SALES", "customer", "create", defaults)).toBe(true);
    expect(canRolePerformAction("SALES", "customer", "delete", defaults)).toBe(false);
    expect(canRolePerformAction("ADMIN", "whatsapp", "read", defaults)).toBe(true);
    expect(canRolePerformAction("CASHIER", "whatsapp", "read", defaults)).toBe(false);
  });

  it("normalizes partial persisted permissions over defaults", () => {
    const defaults = buildDefaultRolePermissions();
    const normalized = normalizeRolePermissions([
      { role: "CASHIER", scope: "page", target: "/products", action: "access", allowed: true },
      { role: "SALES", scope: "resource", target: "product", action: "update", allowed: true },
      { role: "OWNER", scope: "resource", target: "rbac", action: "delete", allowed: false },
    ]);

    expect(canRoleAccessPage("CASHIER", "/products", normalized)).toBe(true);
    expect(canRoleAccessPage("CASHIER", "/wa", normalized)).toBe(
      canRoleAccessPage("CASHIER", "/wa", defaults),
    );
    expect(canRolePerformAction("SALES", "product", "update", normalized)).toBe(true);
    expect(canRolePerformAction("OWNER", "rbac", "delete", normalized)).toBe(true);
  });
});
