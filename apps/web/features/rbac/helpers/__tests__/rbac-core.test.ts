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
  it("reserves proof deletion for OWNER by default and allows an explicit grant", () => {
    const defaults = buildDefaultRolePermissions();

    expect(canRolePerformAction("OWNER", "proof_upload", "delete", defaults)).toBe(true);
    for (const role of ["ADMIN", "CASHIER", "SALES", "INVENTORY"] as const) {
      expect(canRolePerformAction(role, "proof_upload", "delete", defaults)).toBe(false);
    }

    const granted = normalizeRolePermissions([
      {
        role: "ADMIN",
        scope: "resource",
        target: "proof_upload",
        action: "delete",
        allowed: true,
      },
    ]);
    expect(canRolePerformAction("ADMIN", "proof_upload", "delete", granted)).toBe(true);
  });

  it("keeps owner full-access and outside editable role settings", () => {
    expect(OWNER_ROLE).toBe("OWNER");
    expect(EDITABLE_ROLES).toEqual(["ADMIN", "CASHIER", "SALES", "INVENTORY"]);
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
    expect(canRoleAccessPage("ADMIN", "/suppliers", defaults)).toBe(true);
    expect(canRoleAccessPage("ADMIN", "/financial-report", defaults)).toBe(true);
    expect(canRoleAccessPage("CASHIER", "/products", defaults)).toBe(false);
    expect(canRoleAccessPage("CASHIER", "/suppliers", defaults)).toBe(false);
    expect(canRoleAccessPage("CASHIER", "/financial-report", defaults)).toBe(false);
    expect(canRoleAccessPage("SALES", "/financial-report", defaults)).toBe(false);
    expect(canRoleAccessPage("SALES", "/pos", defaults)).toBe(true);

    expect(canRolePerformAction("ADMIN", "product", "update", defaults)).toBe(true);
    expect(canRolePerformAction("ADMIN", "supplier", "create", defaults)).toBe(true);
    expect(canRolePerformAction("CASHIER", "supplier", "read", defaults)).toBe(false);
    expect(canRolePerformAction("ADMIN", "financial-report", "read", defaults)).toBe(true);
    expect(canRolePerformAction("CASHIER", "financial-report", "read", defaults)).toBe(false);
    expect(canRolePerformAction("CASHIER", "product", "update", defaults)).toBe(false);
    expect(canRolePerformAction("SALES", "customer", "create", defaults)).toBe(true);
    expect(canRolePerformAction("SALES", "customer", "delete", defaults)).toBe(false);
    expect(canRolePerformAction("ADMIN", "whatsapp", "read", defaults)).toBe(true);
    expect(canRolePerformAction("CASHIER", "whatsapp", "read", defaults)).toBe(false);
    expect(canRolePerformAction("ADMIN", "transaction.auto_approve", "create", defaults)).toBe(true);
    expect(canRolePerformAction("CASHIER", "transaction.auto_approve", "create", defaults)).toBe(true);
    expect(canRolePerformAction("SALES", "transaction.auto_approve", "create", defaults)).toBe(false);
  });

  it("allows auto approval to be configured independently per editable role", () => {
    const permissions = normalizeRolePermissions([
      { role: "SALES", scope: "resource", target: "transaction.auto_approve", action: "create", allowed: true },
      { role: "CASHIER", scope: "resource", target: "transaction.auto_approve", action: "create", allowed: false },
    ]);

    expect(canRolePerformAction("SALES", "transaction.auto_approve", "create", permissions)).toBe(true);
    expect(canRolePerformAction("CASHIER", "transaction.auto_approve", "create", permissions)).toBe(false);
  });

  it("allows all four roles to create a draft transaction", () => {
    const defaults = buildDefaultRolePermissions();
    expect(canRolePerformAction("OWNER", "transaction.draft", "create", defaults)).toBe(true);
    expect(canRolePerformAction("ADMIN", "transaction.draft", "create", defaults)).toBe(true);
    expect(canRolePerformAction("CASHIER", "transaction.draft", "create", defaults)).toBe(true);
    expect(canRolePerformAction("SALES", "transaction.draft", "create", defaults)).toBe(true);
  });

  it("denies SALES from approving or cancelling drafts but allows CASHIER+", () => {
    const defaults = buildDefaultRolePermissions();
    expect(canRolePerformAction("SALES", "transaction.draft", "update", defaults)).toBe(false);
    expect(canRolePerformAction("SALES", "transaction.draft", "delete", defaults)).toBe(false);
    expect(canRolePerformAction("CASHIER", "transaction.draft", "update", defaults)).toBe(true);
    expect(canRolePerformAction("CASHIER", "transaction.draft", "delete", defaults)).toBe(true);
    expect(canRolePerformAction("ADMIN", "transaction.draft", "update", defaults)).toBe(true);
    expect(canRolePerformAction("OWNER", "transaction.draft", "update", defaults)).toBe(true);
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

  it("ignores persisted permissions for unknown pages and resources", () => {
    const normalized = normalizeRolePermissions([
      { role: "ADMIN", scope: "page", target: "/unknown", action: "access", allowed: true },
      { role: "ADMIN", scope: "resource", target: "product.typo", action: "read", allowed: true },
    ]);

    expect(normalized.ADMIN.pages).not.toHaveProperty("/unknown");
    expect(normalized.ADMIN.resources).not.toHaveProperty("product.typo");
  });

  it("restricts inventory.approve to OWNER by default", () => {
    const defaults = buildDefaultRolePermissions();
    expect(canRolePerformAction("OWNER", "inventory.approve", "update", defaults)).toBe(true);
    expect(canRolePerformAction("ADMIN", "inventory.approve", "update", defaults)).toBe(false);
    expect(canRolePerformAction("CASHIER", "inventory.approve", "update", defaults)).toBe(false);
    expect(canRolePerformAction("SALES", "inventory.approve", "update", defaults)).toBe(false);
  });

  it("grants OUT log verification to owner, admin, and inventory by default", () => {
    const defaults = buildDefaultRolePermissions();

    expect(canRolePerformAction("OWNER", "inventory.out_log.verify", "update", defaults)).toBe(true);
    expect(canRolePerformAction("ADMIN", "inventory.out_log.verify", "update", defaults)).toBe(true);
    expect(canRolePerformAction("INVENTORY", "inventory.out_log.verify", "update", defaults)).toBe(true);
    expect(canRolePerformAction("CASHIER", "inventory.out_log.verify", "update", defaults)).toBe(false);
    expect(canRolePerformAction("SALES", "inventory.out_log.verify", "update", defaults)).toBe(false);
  });

  it("adds configurable inbound receipt decision resources with owner-only defaults", () => {
    const defaults = buildDefaultRolePermissions();
    const decisionResources = [
      "inventory.inbound_receipt.approve",
      "inventory.inbound_receipt.reject",
      "inventory.inbound_receipt.revise",
    ];

    for (const resource of decisionResources) {
      expect(canRolePerformAction("OWNER", resource, "update", defaults)).toBe(true);
      expect(canRolePerformAction("ADMIN", resource, "update", defaults)).toBe(false);
      expect(canRolePerformAction("INVENTORY", resource, "update", defaults)).toBe(false);
    }

    const normalized = normalizeRolePermissions([
      {
        role: "ADMIN",
        scope: "resource",
        target: "inventory.inbound_receipt.approve",
        action: "update",
        allowed: true,
      },
      {
        role: "INVENTORY",
        scope: "resource",
        target: "inventory.inbound_receipt.revise",
        action: "update",
        allowed: true,
      },
    ]);

    expect(
      canRolePerformAction("ADMIN", "inventory.inbound_receipt.approve", "update", normalized),
    ).toBe(true);
    expect(
      canRolePerformAction("INVENTORY", "inventory.inbound_receipt.revise", "update", normalized),
    ).toBe(true);
  });

  it("adds INVENTORY as an editable role with inventory workspace access but no stock approval", () => {
    const defaults = buildDefaultRolePermissions();

    expect(EDITABLE_ROLES).toEqual(["ADMIN", "CASHIER", "SALES", "INVENTORY"]);
    expect(canRoleAccessPage("INVENTORY", "/inventory", defaults)).toBe(true);
    expect(canRoleAccessPage("INVENTORY", "/products", defaults)).toBe(false);
    expect(canRolePerformAction("INVENTORY", "inventory", "read", defaults)).toBe(true);
    expect(canRolePerformAction("INVENTORY", "inventory", "create", defaults)).toBe(true);
    expect(canRolePerformAction("INVENTORY", "inventory", "update", defaults)).toBe(true);
    expect(canRolePerformAction("INVENTORY", "inventory.approve", "update", defaults)).toBe(false);
  });

  it("adds surat_jalan as its own configurable resource", () => {
    const defaults = buildDefaultRolePermissions();
    expect(canRolePerformAction("OWNER", "surat_jalan", "create", defaults)).toBe(true);
    expect(canRolePerformAction("OWNER", "surat_jalan", "update", defaults)).toBe(true);
    expect(canRolePerformAction("CASHIER", "surat_jalan", "create", defaults)).toBe(true);
    expect(canRolePerformAction("SALES", "surat_jalan", "create", defaults)).toBe(true);
    expect(canRolePerformAction("CASHIER", "surat_jalan", "read", defaults)).toBe(true);
    expect(canRolePerformAction("SALES", "surat_jalan", "read", defaults)).toBe(true);
    expect(canRolePerformAction("CASHIER", "surat_jalan", "update", defaults)).toBe(false);
    expect(canRolePerformAction("SALES", "surat_jalan", "update", defaults)).toBe(false);
  });

  it("keeps product price logs as a configurable admin-only resource by default", () => {
    const defaults = buildDefaultRolePermissions();

    expect(canRolePerformAction("OWNER", "product.price_log", "read", defaults)).toBe(true);
    expect(canRolePerformAction("ADMIN", "product.price_log", "read", defaults)).toBe(true);
    expect(canRolePerformAction("CASHIER", "product.price_log", "read", defaults)).toBe(false);
    expect(canRolePerformAction("SALES", "product.price_log", "read", defaults)).toBe(false);
    expect(canRolePerformAction("INVENTORY", "product.price_log", "read", defaults)).toBe(false);
  });

  it("ignores persisted editable-role grants for owner-locked inventory approval", () => {
    const normalized = normalizeRolePermissions([
      {
        role: "ADMIN",
        scope: "resource",
        target: "inventory.approve",
        action: "update",
        allowed: true,
      },
      {
        role: "ADMIN",
        scope: "resource",
        target: "inventory",
        action: "update",
        allowed: true,
      },
    ]);

    expect(canRolePerformAction("ADMIN", "inventory", "update", normalized)).toBe(true);
    expect(canRolePerformAction("ADMIN", "inventory.approve", "update", normalized)).toBe(false);
    expect(canRolePerformAction("OWNER", "inventory.approve", "update", normalized)).toBe(true);
  });
});
