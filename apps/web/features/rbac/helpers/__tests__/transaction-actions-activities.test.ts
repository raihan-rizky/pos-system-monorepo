import { describe, expect, it } from "vitest";

import { buildEffectiveActivities } from "../rbac-activity-catalog";
import { buildDefaultRolePermissions } from "../rbac-core";

describe("transaction action activity permissions", () => {
  for (const role of ["SALES", "CASHIER"] as const) {
    it.each([
      { update: false, delete: false, voidAvailable: false, deleteAvailable: false },
      { update: true, delete: false, voidAvailable: true, deleteAvailable: false },
      { update: false, delete: true, voidAvailable: false, deleteAvailable: true },
      { update: true, delete: true, voidAvailable: true, deleteAvailable: true },
    ])(`${role} uses configured update=$update and delete=$delete grants independently`, (grants) => {
      const permissions = buildDefaultRolePermissions();
      permissions[role].pages["/history"] = true;
      permissions[role].resources.transaction.read = true;
      permissions[role].resources.transaction.update = grants.update;
      permissions[role].resources.transaction.delete = grants.delete;

      const activities = buildEffectiveActivities(role, permissions);

      expect(activities.find(activity => activity.id === "history-void"))
        .toMatchObject({ available: grants.voidAvailable, actionGranted: grants.update });
      expect(activities.find(activity => activity.id === "history-delete"))
        .toMatchObject({ available: grants.deleteAvailable, actionGranted: grants.delete });
    });

    it.each([
      { pageAccess: false, read: true, scope: "page", target: "/history", action: "access" },
      { pageAccess: true, read: false, scope: "resource", target: "transaction", action: "read" },
    ])(`${role} reports missing history prerequisites with page=$pageAccess and read=$read`, (prerequisite) => {
      const permissions = buildDefaultRolePermissions();
      permissions[role].pages["/history"] = prerequisite.pageAccess;
      permissions[role].resources.transaction.read = prerequisite.read;
      permissions[role].resources.transaction.update = true;
      permissions[role].resources.transaction.delete = true;

      const activities = buildEffectiveActivities(role, permissions);

      for (const id of ["history-void", "history-delete"]) {
        expect(activities.find(activity => activity.id === id)).toMatchObject({
          available: false,
          actionGranted: true,
          shouldWarn: true,
          missing: [expect.objectContaining({
            scope: prerequisite.scope,
            target: prerequisite.target,
            action: prerequisite.action,
          })],
        });
      }
    });
  }
});
