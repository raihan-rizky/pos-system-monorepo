import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDefaultRolePermissions, canRoleAccessPage, canRolePerformAction, normalizeRolePermissions } from "../rbac-core";
import { RBAC_RESOURCE_METADATA, RBAC_PERMISSION_MODULES } from "../rbac-settings-ui";

const targets = ["financial-report.daily-income", "financial-report.daily-category", "financial-report.daily-subcategory", "financial-report.daily-payment-method"];

describe("daily finance permissions", () => {
  it("lets SALES open daily reports without full financial access", () => {
    const defaults = buildDefaultRolePermissions();
    expect(canRoleAccessPage("SALES", "/financial-report", defaults)).toBe(true);
    expect(canRolePerformAction("SALES", "financial-report", "read", defaults)).toBe(false);
    for (const target of targets) {
      expect(canRolePerformAction("SALES", target, "read", defaults)).toBe(true);
      expect(canRolePerformAction("ADMIN", target, "read", defaults)).toBe(true);
      expect(canRolePerformAction("CASHIER", target, "read", defaults)).toBe(false);
      expect(canRolePerformAction("INVENTORY", target, "read", defaults)).toBe(false);
      expect(canRolePerformAction("SALES", target, "update", defaults)).toBe(false);
    }
  });

  it("honors each independently revoked section", () => {
    for (const target of targets) {
      const permissions = normalizeRolePermissions([{ role: "SALES", scope: "resource", target, action: "read", allowed: false }]);
      expect(canRolePerformAction("SALES", target, "read", permissions)).toBe(false);
      for (const other of targets.filter(value => value !== target)) expect(canRolePerformAction("SALES", other, "read", permissions)).toBe(true);
    }
  });

  it("exposes all four read-only controls in the finance editor", () => {
    const financeModule = RBAC_PERMISSION_MODULES.find(item => item.id === "finance-report");
    for (const target of targets) {
      expect(financeModule?.resourceTargets).toContain(target);
      expect(RBAC_RESOURCE_METADATA[target]?.actions).toEqual(["read"]);
    }
  });

  it("provides an idempotent migration for existing SALES page and full permission settings", () => {
    const sql = readFileSync(resolve(process.cwd(), "../../packages/db/prisma/migrations/20261105010000_daily_finance_permissions/migration.sql"), "utf8");
    for (const target of targets) expect(sql).toContain(target);
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("/financial-report");
    expect(sql).toContain("'financial-report', 'read', false");
  });
});
