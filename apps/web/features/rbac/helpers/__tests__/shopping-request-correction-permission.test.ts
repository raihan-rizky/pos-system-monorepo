import { describe, expect, it } from "vitest";
import {
  buildDefaultRolePermissions,
  canRolePerformAction,
  isKnownResourceTarget,
  normalizeRolePermissions,
} from "../rbac-core";
import { RBAC_RESOURCE_METADATA } from "../rbac-activity-catalog";
import { findModuleForTarget } from "../rbac-settings-ui";

const target = "supplier.shopping_request.correct_processed";

describe("izin koreksi daftar belanja yang sudah diproses", () => {
  it("tersedia untuk Owner dan tertutup untuk role lain secara bawaan", () => {
    const permissions = buildDefaultRolePermissions();
    expect(isKnownResourceTarget(target)).toBe(true);
    expect(canRolePerformAction("OWNER", target, "update", permissions)).toBe(true);
    for (const role of ["ADMIN", "CASHIER", "SALES", "INVENTORY"] as const) {
      expect(canRolePerformAction(role, target, "update", permissions)).toBe(false);
    }
  });

  it("tidak memberikan izin koreksi hanya karena role boleh mengedit daftar awal", () => {
    const permissions = normalizeRolePermissions([
      { role: "ADMIN", scope: "resource", target: "supplier.shopping_request.edit", action: "update", allowed: true },
    ]);
    expect(canRolePerformAction("ADMIN", "supplier.shopping_request.edit", "update", permissions)).toBe(true);
    expect(canRolePerformAction("ADMIN", target, "update", permissions)).toBe(false);
  });

  it("dapat diberikan kepada role lain secara terpisah", () => {
    const permissions = normalizeRolePermissions([
      { role: "ADMIN", scope: "resource", target, action: "update", allowed: true },
    ]);
    expect(canRolePerformAction("ADMIN", target, "update", permissions)).toBe(true);
    expect(canRolePerformAction("CASHIER", target, "update", permissions)).toBe(false);
  });

  it("menyediakan pengaturan izin koreksi pada modul supplier", () => {
    expect(findModuleForTarget(target).id).toBe("suppliers");
    expect(RBAC_RESOURCE_METADATA[target]?.actions).toContain("update");
    expect(RBAC_RESOURCE_METADATA[target]?.guidance).toMatch(/stok/i);
    expect(RBAC_RESOURCE_METADATA[target]?.guidance).toMatch(/keuangan/i);
  });
});
