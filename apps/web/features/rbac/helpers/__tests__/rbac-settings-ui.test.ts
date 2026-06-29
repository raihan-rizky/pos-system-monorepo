import { describe, expect, it } from "vitest";
import {
  EDITABLE_ROLES,
  PAGE_TARGETS,
  RESOURCE_TARGETS,
  buildDefaultRolePermissions,
} from "../rbac-core";

describe("RBAC settings UI helpers", () => {
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
