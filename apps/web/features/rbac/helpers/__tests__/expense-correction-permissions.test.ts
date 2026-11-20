import { describe, expect, it } from "vitest";
import { RBAC_RESOURCE_METADATA } from "../rbac-activity-catalog";
import {
  buildDefaultRolePermissions,
  canRolePerformAction,
  EDITABLE_ROLES,
  isKnownResourceTarget,
  normalizeRolePermissions,
} from "../rbac-core";
import { findModuleForTarget } from "../rbac-settings-ui";
import { expenseCorrectionPermission } from "@/features/keuangan/helpers/expense-correction-contract";

const targets = [
  "supplier.goods_purchase.correction",
  "supplier.backdated_purchase.correction",
  "supplier.backdated_payment.correction",
] as const;

describe("izin koreksi pengeluaran otomatis", () => {
  it.each(targets)("mendaftarkan aksi ubah dan batal untuk %s", (target) => {
    expect(isKnownResourceTarget(target)).toBe(true);
    expect(RBAC_RESOURCE_METADATA[target]?.actions).toEqual(["update", "delete"]);
    expect(findModuleForTarget(target)).toBeDefined();
  });

  it.each(targets)("memberi izin bawaan hanya kepada Owner untuk %s", (target) => {
    const permissions = buildDefaultRolePermissions();
    for (const action of ["update", "delete"] as const) {
      expect(canRolePerformAction("OWNER", target, action, permissions)).toBe(true);
      for (const role of EDITABLE_ROLES) {
        expect(canRolePerformAction(role, target, action, permissions)).toBe(false);
      }
    }
  });

  it("memisahkan hak mengubah pembayaran terdahulu dari hak membatalkan pembeliannya", () => {
    const permissions = normalizeRolePermissions([
      {
        role: "ADMIN", scope: "resource", target: "supplier.backdated_payment.correction",
        action: "update", allowed: true,
      },
    ]);
    expect(canRolePerformAction("ADMIN", "supplier.backdated_payment.correction", "update", permissions)).toBe(true);
    expect(canRolePerformAction("ADMIN", "supplier.backdated_payment.correction", "delete", permissions)).toBe(false);
    expect(canRolePerformAction("ADMIN", "supplier.backdated_purchase.correction", "delete", permissions)).toBe(false);
    expect(canRolePerformAction("CASHIER", "supplier.backdated_payment.correction", "update", permissions)).toBe(false);
  });

  it("memakai hak koreksi transaksi sumber sesuai baris dan aksi", () => {
    expect(expenseCorrectionPermission({ type: "SHOPPING_REQUEST", id: "request-1" }, "edit"))
      .toEqual(["supplier.shopping_request.correct_processed", "update"]);
    expect(expenseCorrectionPermission({ type: "SHOPPING_REQUEST", id: "request-1" }, "cancel"))
      .toEqual(["supplier.shopping_request.delete", "delete"]);
    expect(expenseCorrectionPermission({ type: "GOODS_PURCHASE", id: "purchase-1" }, "edit"))
      .toEqual(["supplier.goods_purchase.correction", "update"]);
    expect(expenseCorrectionPermission({ type: "BACKDATED_PURCHASE", id: "historical-1" }, "cancel"))
      .toEqual(["supplier.backdated_purchase.correction", "delete"]);
    expect(expenseCorrectionPermission({
      type: "BACKDATED_PURCHASE", id: "historical-1", payment: { kind: "BACKDATED_PAYMENT", id: "payment-1" },
    }, "edit")).toEqual(["supplier.backdated_payment.correction", "update"]);
  });
});
