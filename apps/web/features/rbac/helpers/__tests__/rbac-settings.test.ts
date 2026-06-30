import { describe, expect, it } from "vitest";
import {
  buildRolePermissionUpserts,
  parseRolePermissionPayload,
} from "../rbac-settings";

describe("RBAC settings persistence helpers", () => {
  it("rejects owner permission edits from client payloads", () => {
    expect(() =>
      parseRolePermissionPayload([
        { role: "OWNER", scope: "resource", target: "product", action: "delete", allowed: false },
      ]),
    ).toThrow("OWNER permissions cannot be edited");
  });

  it("rejects invalid resource actions", () => {
    expect(() =>
      parseRolePermissionPayload([
        { role: "ADMIN", scope: "resource", target: "product", action: "write", allowed: true },
      ]),
    ).toThrow("Invalid permission action");
  });

  it("rejects page permissions for unknown pages", () => {
    expect(() =>
      parseRolePermissionPayload([
        { role: "ADMIN", scope: "page", target: "/unknown", action: "access", allowed: true },
      ]),
    ).toThrow("Invalid permission target");
  });

  it("rejects resource permissions for unknown resources", () => {
    expect(() =>
      parseRolePermissionPayload([
        { role: "ADMIN", scope: "resource", target: "product.typo", action: "read", allowed: true },
      ]),
    ).toThrow("Invalid permission target");
  });

  it("accepts editable role page and CRUD resource permissions", () => {
    const parsed = parseRolePermissionPayload([
      { role: "ADMIN", scope: "page", target: "/products", action: "access", allowed: true },
      { role: "CASHIER", scope: "resource", target: "product", action: "create", allowed: false },
      { role: "SALES", scope: "resource", target: "customer", action: "read", allowed: true },
      { role: "SALES", scope: "resource", target: "customer", action: "update", allowed: true },
      { role: "SALES", scope: "resource", target: "customer", action: "delete", allowed: false },
    ]);

    expect(parsed).toHaveLength(5);
  });

  it("accepts granular inbound receipt decision resources for editable roles", () => {
    const parsed = parseRolePermissionPayload([
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

    expect(parsed).toEqual([
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
  });

  it("ignores OWNER-locked resources from the submitted settings matrix", () => {
    const parsed = parseRolePermissionPayload([
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
        target: "product",
        action: "read",
        allowed: true,
      },
    ]);

    expect(parsed).toEqual([
      {
        role: "ADMIN",
        scope: "resource",
        target: "product",
        action: "read",
        allowed: true,
      },
    ]);
  });

  it("does not build persistence upserts when a payload only contains OWNER-locked resources", () => {
    const parsed = parseRolePermissionPayload([
      {
        role: "ADMIN",
        scope: "resource",
        target: "inventory.approve",
        action: "read",
        allowed: true,
      },
      {
        role: "CASHIER",
        scope: "resource",
        target: "inventory.approve",
        action: "update",
        allowed: true,
      },
      {
        role: "SALES",
        scope: "resource",
        target: "inventory.approve",
        action: "delete",
        allowed: true,
      },
    ]);

    expect(parsed).toEqual([]);
    expect(buildRolePermissionUpserts(parsed)).toEqual([]);
  });

  it("builds stable upsert inputs keyed by role, scope, target, and action", () => {
    const entries = parseRolePermissionPayload([
      { role: "ADMIN", scope: "page", target: "/products", action: "access", allowed: true },
      { role: "ADMIN", scope: "resource", target: "product", action: "update", allowed: false },
    ]);

    expect(buildRolePermissionUpserts(entries)).toEqual([
      {
        where: {
          role_scope_target_action: {
            role: "ADMIN",
            scope: "page",
            target: "/products",
            action: "access",
          },
        },
        create: {
          role: "ADMIN",
          scope: "page",
          target: "/products",
          action: "access",
          allowed: true,
        },
        update: { allowed: true },
      },
      {
        where: {
          role_scope_target_action: {
            role: "ADMIN",
            scope: "resource",
            target: "product",
            action: "update",
          },
        },
        create: {
          role: "ADMIN",
          scope: "resource",
          target: "product",
          action: "update",
          allowed: false,
        },
        update: { allowed: false },
      },
    ]);
  });
});
