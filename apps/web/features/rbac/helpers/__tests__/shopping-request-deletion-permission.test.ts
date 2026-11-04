import { describe, expect, it } from "vitest";
import { buildDefaultRolePermissions, canRolePerformAction, isKnownResourceTarget, normalizeRolePermissions } from "../rbac-core";

const target = "supplier.shopping_request.delete";
describe("izin hapus daftar belanja", () => {
  it("terdaftar, terbuka untuk Owner dan tertutup secara default untuk role lain", () => {
    expect(isKnownResourceTarget(target)).toBe(true);
    const defaults = buildDefaultRolePermissions();
    expect(canRolePerformAction("OWNER", target, "delete", defaults)).toBe(true);
    for (const role of ["ADMIN", "CASHIER", "SALES", "INVENTORY"] as const) {
      expect(canRolePerformAction(role, target, "delete", defaults)).toBe(false);
    }
  });

  it("dapat diberikan khusus kepada Admin tanpa memberi izin kepada role lain", () => {
    const permissions = normalizeRolePermissions([{ role: "ADMIN", scope: "resource", target, action: "delete", allowed: true }]);
    expect(canRolePerformAction("ADMIN", target, "delete", permissions)).toBe(true);
    expect(canRolePerformAction("CASHIER", target, "delete", permissions)).toBe(false);
  });
});
