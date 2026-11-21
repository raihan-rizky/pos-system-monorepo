import { describe, expect, it } from "vitest";
import { buildDefaultRolePermissions, canRolePerformAction, isKnownResourceTarget, isOwnerLockedResource } from "../rbac-core";

describe("izin pemulihan transaksi", () => {
  it("mendaftarkan aksi yang hanya dapat dijalankan owner", () => {
    expect(isKnownResourceTarget("transaction.unvoid")).toBe(true);
    expect(isOwnerLockedResource("transaction.unvoid")).toBe(true);
    const permissions = buildDefaultRolePermissions();
    expect(canRolePerformAction("OWNER", "transaction.unvoid", "update", permissions)).toBe(true);
    for (const role of ["ADMIN", "CASHIER", "SALES", "INVENTORY"] as const) {
      permissions[role].resources["transaction.unvoid"].update = true;
      expect(canRolePerformAction(role, "transaction.unvoid", "update", permissions)).toBe(false);
    }
  });
});
