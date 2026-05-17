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
