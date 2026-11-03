import { describe, expect, it } from "vitest";
import { ACTIONS, EDITABLE_ROLES, buildDefaultRolePermissions, buildDeniedRolePermissions, canRolePerformAction, normalizeRolePermissions } from "../rbac-core";
import type { PermissionEntry, ResourceAction } from "../rbac-core";
import { RBAC_PERMISSION_MODULES, RBAC_RESOURCE_METADATA, buildPermissionPresentation, buildModuleWarnings } from "../rbac-settings-ui";
import { parseRolePermissionPayload } from "../rbac-settings";

const transitions: [string, string, ResourceAction[]][] = [
  ["transaction.custom_price", "product", ["update"]],
  ["income.manual", "income", ["create", "read", "update", "delete"]],
  ["expense.manual_transfer", "expense", ["create", "update", "delete"]],
  ["expense.payable", "expense", ["create", "read", "update"]],
  ["expense.giro", "expense", ["read", "update"]],
  ["financial-report.export", "financial-report", ["read"]],
  ["product.import", "product", ["create", "read", "update"]],
  ["inventory.bulk", "inventory", ["read", "update"]],
];
const row = (target: string, action: ResourceAction, allowed: boolean): PermissionEntry => ({ role: "SALES", scope: "resource", target, action, allowed });

describe("recent feature permission compatibility", () => {
  it("rejects unsupported transition grants before a misleading save can be audited", () => {
    expect(() => parseRolePermissionPayload([row("product.import", "delete", true)])).toThrow("Invalid permission action");
    expect(parseRolePermissionPayload([row("product.import", "delete", false)])).toHaveLength(1);
  });

  it("does not count import progress as access to product data in the host module", () => {
    const permissions = buildDefaultRolePermissions();
    permissions.SALES.pages["/products"] = true;
    permissions.SALES.resources.product.read = false;
    permissions.SALES.resources["product.import"].read = true;
    expect(buildModuleWarnings("SALES", permissions)).toContainEqual(expect.objectContaining({
      moduleId: "products", message: expect.stringContaining("halamannya bisa dibuka"),
    }));
    permissions.SALES.resources.product.read = true;
    expect(buildModuleWarnings("SALES", permissions).filter(warning => warning.moduleId === "products")).toEqual([]);
  });
  it.each(transitions)("inherits default supported actions for %s", (target, parent, supported) => {
    const permissions = buildDefaultRolePermissions();
    for (const role of EDITABLE_ROLES) for (const action of ACTIONS) {
      expect(canRolePerformAction(role, target, action, permissions)).toBe(supported.includes(action) && canRolePerformAction(role, parent, action, permissions));
      expect(canRolePerformAction(role, target, action, buildDeniedRolePermissions())).toBe(false);
    }
    expect(canRolePerformAction("OWNER", target, "delete", permissions)).toBe(true);
  });

  it.each(transitions)("inherits persisted legacy values only when %s action is absent", (target, parent, supported) => {
    for (const action of supported) {
      expect(canRolePerformAction("SALES", target, action, normalizeRolePermissions([row(parent, action, true)]))).toBe(true);
      expect(canRolePerformAction("SALES", target, action, normalizeRolePermissions([row(parent, action, false)]))).toBe(false);
      for (const entries of [[row(target, action, false), row(parent, action, true)], [row(parent, action, true), row(target, action, false)]]) {
        expect(canRolePerformAction("SALES", target, action, normalizeRolePermissions(entries))).toBe(false);
      }
      expect(canRolePerformAction("SALES", target, action, normalizeRolePermissions([row(parent, action, false), row(target, action, true)]))).toBe(true);
    }
    for (const action of ACTIONS.filter(action => !supported.includes(action))) {
      expect(canRolePerformAction("SALES", target, action, normalizeRolePermissions([row(target, action, true)]))).toBe(false);
    }
  });

  it.each(transitions)("offers %s once in the existing modules with readable audit labels", (target, _parent, supported) => {
    expect(RBAC_PERMISSION_MODULES).toHaveLength(25);
    expect(RBAC_PERMISSION_MODULES.filter(module => module.resourceTargets.includes(target))).toHaveLength(1);
    expect(RBAC_RESOURCE_METADATA[target]?.actions).toEqual(supported);
    const presentation = buildPermissionPresentation({ scope: "resource", target, action: supported[0] });
    expect(presentation.label).not.toContain("Izin data");
    expect(presentation.technicalId).toBe(`${target}.${supported[0]}`);
    expect(RBAC_RESOURCE_METADATA[target]?.guidance).toBeTruthy();
  });
});
