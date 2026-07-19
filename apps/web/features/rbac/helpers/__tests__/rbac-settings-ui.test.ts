import { describe, expect, it } from "vitest";
import {
  EDITABLE_ROLES,
  PAGE_TARGETS,
  RESOURCE_TARGETS,
  buildDefaultRolePermissions,
} from "../rbac-core";

describe("RBAC settings UI helpers", () => {
  it("exposes proof deletion as a critical configurable permission", async () => {
    const { RBAC_PERMISSION_MODULES } = await import("../rbac-settings-ui");
    const proofMediaModule = RBAC_PERMISSION_MODULES.find(
      (item) => item.id === "proof-media",
    );

    expect(proofMediaModule).toMatchObject({
      resourceTargets: ["proof_upload"],
      sensitivity: "critical",
    });
  });

  it("covers every page and resource target in the module catalog", async () => {
    const { RBAC_PERMISSION_MODULES } = await import("../rbac-settings-ui");
    const coveredPages = new Set(RBAC_PERMISSION_MODULES.flatMap((module) => module.pageTargets));
    const coveredResources = new Set(
      RBAC_PERMISSION_MODULES.flatMap((module) => module.resourceTargets),
    );

    expect([...PAGE_TARGETS].filter((target) => !coveredPages.has(target))).toEqual([]);
    expect([...RESOURCE_TARGETS].filter((target) => !coveredResources.has(target))).toEqual([]);
  });

  it("keeps representative default access visible for drift review", async () => {
    const { buildRoleSummaries } = await import("../rbac-settings-ui");
    const defaults = buildDefaultRolePermissions();
    const summaries = buildRoleSummaries(defaults);

    expect(summaries.map((summary) => summary.role)).toEqual([...EDITABLE_ROLES]);
    expect(summaries.find((summary) => summary.role === "ADMIN")).toMatchObject({
      enabledPages: 15,
      warningCount: 0,
      customizationCount: 0,
    });
    expect(summaries.find((summary) => summary.role === "INVENTORY")).toMatchObject({
      enabledPages: 1,
      warningCount: 0,
      customizationCount: 0,
    });
  });

  it("returns target-level additions and removals from defaults", async () => {
    const { buildPermissionChanges } = await import("../rbac-settings-ui");
    const permissions = buildDefaultRolePermissions();
    permissions.CASHIER.pages["/products"] = true;
    permissions.ADMIN.resources.product.update = false;

    const changes = buildPermissionChanges(permissions);

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "CASHIER",
          scope: "page",
          target: "/products",
          direction: "added",
        }),
        expect.objectContaining({
          role: "ADMIN",
          scope: "resource",
          target: "product",
          action: "update",
          direction: "removed",
        }),
      ]),
    );
  });

  it("detects sensitive and critical permission deviations", async () => {
    const { buildPermissionChanges } = await import("../rbac-settings-ui");
    const permissions = buildDefaultRolePermissions();
    permissions.CASHIER.resources["product.price_log"].read = true;
    permissions.ADMIN.resources["inventory.approve"].update = true;

    const changes = buildPermissionChanges(permissions);

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "product.price_log",
          sensitivity: "sensitive",
          requiresConfirmation: true,
        }),
        expect.objectContaining({
          target: "inventory.approve",
          sensitivity: "critical",
          requiresConfirmation: true,
        }),
      ]),
    );
  });

  it("groups inbound receipt decision permissions under critical inventory approval", async () => {
    const { RBAC_PERMISSION_MODULES, buildPermissionChanges } = await import("../rbac-settings-ui");
    const approvalModule = RBAC_PERMISSION_MODULES.find((module) => module.id === "inventory-approval");
    const permissions = buildDefaultRolePermissions();
    permissions.ADMIN.resources["inventory.inbound_receipt.reject"].update = true;

    expect(approvalModule?.resourceTargets).toEqual(
      expect.arrayContaining([
        "inventory.inbound_receipt.approve",
        "inventory.inbound_receipt.reject",
        "inventory.inbound_receipt.revise",
      ]),
    );
    expect(buildPermissionChanges(permissions)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "inventory.inbound_receipt.reject",
          moduleId: "inventory-approval",
          sensitivity: "critical",
          requiresConfirmation: true,
        }),
      ]),
    );
  });

  it("shows OUT log verification in the inventory approval module", async () => {
    const { RBAC_PERMISSION_MODULES } = await import("../rbac-settings-ui");
    const approvalModule = RBAC_PERMISSION_MODULES.find(
      (module) => module.id === "inventory-approval",
    );

    expect(approvalModule?.resourceTargets).toContain("inventory.out_log.verify");
  });

  it("exposes configurable stock approval for shopping requests with Owner-only defaults", async () => {
    const { RBAC_PERMISSION_MODULES } = await import("../rbac-settings-ui");
    const defaults = buildDefaultRolePermissions();
    const supplierModule = RBAC_PERMISSION_MODULES.find(
      (module) => module.id === "suppliers",
    );

    expect(supplierModule?.resourceTargets).toContain(
      "supplier.shopping_request.approve_stock",
    );
    expect(
      EDITABLE_ROLES.every(
        (role) =>
          defaults[role].resources["supplier.shopping_request.approve_stock"]
            .update === false,
      ),
    ).toBe(true);
  });

  it("exposes Owner-only defaults for editing requests and filling approved quantities", async () => {
    const { RBAC_PERMISSION_MODULES } = await import("../rbac-settings-ui");
    const defaults = buildDefaultRolePermissions();
    const supplierModule = RBAC_PERMISSION_MODULES.find(
      (module) => module.id === "suppliers",
    );
    const resources = [
      "supplier.shopping_request.edit",
      "supplier.shopping_request.set_approved_qty",
    ] as const;

    expect(supplierModule?.resourceTargets).toEqual(
      expect.arrayContaining([...resources]),
    );
    for (const resource of resources) {
      expect(
        EDITABLE_ROLES.every(
          (role) => defaults[role].resources[resource].update === false,
        ),
      ).toBe(true);
    }
  });

  it("explains page and resource mismatch warnings in practical language", async () => {
    const { buildModuleWarnings } = await import("../rbac-settings-ui");
    const permissions = buildDefaultRolePermissions();
    permissions.ADMIN.pages["/products"] = false;
    permissions.ADMIN.resources.product.read = true;

    const warnings = buildModuleWarnings("ADMIN", permissions);

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: "products",
          severity: "warning",
          message: expect.stringContaining("page is hidden"),
        }),
      ]),
    );
  });
});
