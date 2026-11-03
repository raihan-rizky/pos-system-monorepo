import { describe, expect, it } from "vitest";
import { buildAuthorizationFingerprint } from "../authorization-fingerprint";
import { buildDefaultRolePermissions } from "../rbac-core";

describe("effective authorization fingerprint", () => {
  it("does not interrupt a user's form when another role's permissions change", () => {
    const permissions = buildDefaultRolePermissions();
    const owner = buildAuthorizationFingerprint("OWNER", permissions);
    const cashier = buildAuthorizationFingerprint("CASHIER", permissions);
    const sales = buildAuthorizationFingerprint("SALES", permissions);
    permissions.SALES.resources.transaction.update = true;
    expect(buildAuthorizationFingerprint("OWNER", permissions)).toBe(owner);
    expect(buildAuthorizationFingerprint("CASHIER", permissions)).toBe(cashier);
    expect(buildAuthorizationFingerprint("SALES", permissions)).not.toBe(sales);
  });
});
