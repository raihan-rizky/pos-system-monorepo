import { describe, expect, it } from "vitest";
import { buildDefaultRolePermissions } from "../rbac-core";
import * as ui from "../rbac-settings-ui";
import * as catalog from "../rbac-settings-ui";

describe("RBAC editor catalog", () => {
  it("presents the same meaningful permission names for review and audit records", () => {
    expect(ui.buildPermissionPresentation({ scope: "resource", target: "transaction.approve", action: "delete" })).toEqual({
      label: "Persetujuan transaksi / Tolak atau batalkan transaksi", technicalId: "transaction.approve.delete",
    });
    expect(ui.buildPermissionPresentation({ scope: "page", target: "/history", action: "access" })).toEqual({
      label: "Riwayat / Buka halaman", technicalId: "/history.access",
    });
  });

  it.each(["disabled", "detached"])("returns focus to module search when the trigger is %s", (state) => {
    const ownerDocument = Object.assign(new EventTarget(), { activeElement: null as unknown, getElementById: (_id: string) => fallback });
    const control = (): { isConnected: boolean; disabled: boolean; focus(): void } => ({ isConnected: true, disabled: false, focus() { if (this.isConnected && !this.disabled) ownerDocument.activeElement = this; } });
    const trigger = control();
    const fallback = control();
    const close = control();
    trigger.focus();
    const dialog = { ownerDocument, querySelectorAll: () => [close], contains: (node: unknown) => node === close };
    const cleanup = ui.bindDialogFocus(dialog as unknown as HTMLElement, () => {});
    if (state === "disabled") trigger.disabled = true;
    else trigger.isConnected = false;
    cleanup();
    expect(ownerDocument.activeElement).toBe(fallback);
  });

  it("initially focuses the dialog, traps Tab in both directions, closes with Escape and restores focus", () => {
    const documentEvents = new EventTarget();
    const ownerDocument = Object.assign(documentEvents, { activeElement: null as unknown });
    const makeButton = () => ({ isConnected: true, focus() { ownerDocument.activeElement = this; } });
    const trigger = makeButton();
    const first = makeButton();
    const last = makeButton();
    trigger.focus();
    const dialog = { ownerDocument, querySelectorAll: () => [first, last], contains: (node: unknown) => node === first || node === last };
    let closed = false;
    const cleanup = ui.bindDialogFocus(dialog as unknown as HTMLElement, () => { closed = true; });
    expect(ownerDocument.activeElement).toBe(first);
    last.focus();
    ownerDocument.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key: "Tab", shiftKey: false }));
    expect(ownerDocument.activeElement).toBe(first);
    ownerDocument.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key: "Tab", shiftKey: true }));
    expect(ownerDocument.activeElement).toBe(last);
    ownerDocument.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
    expect(closed).toBe(true);
    cleanup();
    expect(ownerDocument.activeElement).toBe(trigger);
  });

  it("makes every module reachable exactly once through the shared grouped navigation", () => {
    const ids = ui.buildModuleGroups().flatMap((group) => group.modules.map((module) => module.id));
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
    expect([...ids].sort()).toEqual(ui.RBAC_PERMISSION_MODULES.map((module) => module.id).sort());
    expect(ui.buildModuleGroups("nota percetakan").flatMap((group) => group.modules.map((module) => module.id)))
      .toEqual(["processed-printing-receipts"]);
    expect(ui.buildModuleGroups("tidak ada modul ini")).toEqual([]);
  });

  it("describes actual action controls and immutable Owner policies", () => {
    expect(catalog.RBAC_RESOURCE_METADATA["printing_receipt.processed"].actions).toEqual(["update"]);
    expect(catalog.RBAC_RESOURCE_METADATA["transaction.auto_approve"].actions).toEqual(["create"]);
    expect(catalog.RBAC_RESOURCE_METADATA["proof_upload"].actions).toEqual(["delete"]);
    expect(catalog.RBAC_RESOURCE_METADATA["inventory.inbound_receipt.approve"].actions).toEqual(["update"]);
    expect(catalog.RBAC_RESOURCE_METADATA["transaction.approve"].actions).toEqual(["update", "delete"]);
    for (const resource of ["rbac", "inventory.approve"]) {
      expect(catalog.RBAC_RESOURCE_METADATA[resource].ownerOnlyReason).toBeTruthy();
    }
  });

  it("counts only supported effective actions while retaining hidden stored grants", () => {
    const permissions = buildDefaultRolePermissions();
    for (const resource of Object.values(permissions.ADMIN.resources)) {
      for (const action of ["create", "read", "update", "delete"] as const) resource[action] = false;
    }
    permissions.ADMIN.resources.rbac.update = true;
    permissions.ADMIN.resources["inventory.approve"].update = true;
    Object.assign(permissions.ADMIN.resources["printing_receipt.processed"], { create: true, read: true, update: true, delete: true });
    expect(ui.buildRoleSummaries(permissions).find((summary) => summary.role === "ADMIN")?.enabledActions).toBe(1);
    expect(ui.countSupportedResourceActions(["printing_receipt.processed", "rbac", "inventory.approve"], "ADMIN", permissions)).toBe(1);
    expect(permissions.ADMIN.resources["printing_receipt.processed"].create).toBe(true);
  });

  it("evaluates history prerequisites without confusing transaction read with approval read", () => {
    const permissions = buildDefaultRolePermissions();
    permissions.ADMIN.pages["/history"] = true;
    permissions.ADMIN.resources.transaction.read = true;
    permissions.ADMIN.resources["transaction.approve"].read = false;
    let preview = catalog.buildEffectiveActivities("ADMIN", permissions);
    expect(preview.find((activity) => activity.id === "history-open")?.available).toBe(true);
    expect(preview.find((activity) => activity.id === "history-read")?.available).toBe(true);
    expect(ui.buildModuleWarnings("ADMIN", permissions).filter((warning) => warning.moduleId === "transaction-approval")).toEqual([]);

    permissions.ADMIN.resources.transaction.read = false;
    preview = catalog.buildEffectiveActivities("ADMIN", permissions);
    expect(preview.find((activity) => activity.id === "history-read")?.missing).toEqual([expect.objectContaining({ target: "transaction", action: "read" })]);
    expect(preview.find((activity) => activity.id === "history-approve")?.available).toBe(false);
    expect(ui.buildModuleWarnings("ADMIN", permissions)).toContainEqual(expect.objectContaining({
      moduleId: "transaction-approval", message: expect.stringContaining("transaction.read"),
    }));
  });

  it("warns when Riwayat opens but no transaction data can be read", () => {
    const permissions = buildDefaultRolePermissions();
    permissions.CASHIER.pages["/history"] = true;
    permissions.CASHIER.resources.transaction.read = false;
    permissions.CASHIER.resources.transaction.update = false;
    permissions.CASHIER.resources["transaction.approve"].update = false;
    permissions.CASHIER.resources["transaction.approve"].delete = false;
    permissions.CASHIER.resources["transaction.draft"].update = false;
    expect(ui.buildModuleWarnings("CASHIER", permissions)).toContainEqual(expect.objectContaining({
      moduleId: "transaction-approval", message: expect.stringContaining("transaction.read"),
    }));
  });

  it("requires page, read and the respective action for history operations and preserves stored grants", () => {
    const permissions = buildDefaultRolePermissions();
    permissions.SALES.pages["/history"] = false;
    permissions.SALES.resources.transaction.read = true;
    permissions.SALES.resources.transaction.update = true;
    permissions.SALES.resources.transaction.delete = true;
    permissions.SALES.resources["transaction.approve"].update = true;
    permissions.SALES.resources["transaction.approve"].delete = true;
    permissions.SALES.resources["transaction.draft"].update = true;
    const before = structuredClone(permissions);
    expect(catalog.buildEffectiveActivities("SALES", permissions).every((activity) => !activity.available)).toBe(true);
    permissions.SALES.pages["/history"] = true;
    const preview = catalog.buildEffectiveActivities("SALES", permissions);
    expect(preview.every((activity) => activity.available)).toBe(true);
    expect(preview.find((activity) => activity.id === "history-draft")?.note).toContain("requestedById");
    expect(preview.find((activity) => activity.id === "history-draft")?.note).toContain("tidak dapat menyetujui draft yang dibuat Sales");
    expect(permissions.SALES.resources).toEqual(before.SALES.resources);
    permissions.SALES.resources["transaction.approve"].delete = false;
    expect(catalog.buildEffectiveActivities("SALES", permissions).find((activity) => activity.id === "history-reject")?.available).toBe(false);
  });
});
