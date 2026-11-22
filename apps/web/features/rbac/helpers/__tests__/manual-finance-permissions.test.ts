import { describe, expect, it } from "vitest";
import {
  EDITABLE_ROLES,
  buildDefaultRolePermissions,
  canRolePerformAction,
  isKnownResourceTarget,
  normalizeRolePermissions,
} from "../rbac-core";

const updateTargets = [
  "customer.receivable.manual",
  "customer.receivable.manual.payment",
  "expense.payable.manual",
  "expense.payable.manual.payment",
  "expense.manual_transfer.edit",
  "expense.manual_transfer.allocation",
] as const;

describe("manual finance correction permissions", () => {
  it("registers each correction and allows only the owner by default", () => {
    const defaults = buildDefaultRolePermissions();

    for (const target of updateTargets) {
      expect(isKnownResourceTarget(target)).toBe(true);
      expect(canRolePerformAction("OWNER", target, "update", defaults)).toBe(true);
      for (const role of EDITABLE_ROLES) {
        expect(canRolePerformAction(role, target, "update", defaults)).toBe(false);
      }
    }
  });

  it("grants a selected correction without granting other corrections", () => {
    const permissions = normalizeRolePermissions([
      { role: "ADMIN", scope: "resource", target: "expense.payable.manual.payment", action: "update", allowed: true },
    ]);

    expect(canRolePerformAction("ADMIN", "expense.payable.manual.payment", "update", permissions)).toBe(true);
    for (const target of updateTargets.filter((value) => value !== "expense.payable.manual.payment")) {
      expect(canRolePerformAction("ADMIN", target, "update", permissions)).toBe(false);
    }
    expect(canRolePerformAction("CASHIER", "expense.payable.manual.payment", "update", permissions)).toBe(false);
  });
});
