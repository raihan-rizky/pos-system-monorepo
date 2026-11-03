import { describe, expect, it } from "vitest";
import { canSelectTransactionStatus } from "../helpers/transaction-status-option";

describe("Pilihan status formulir Ubah Transaksi", () => {
  it.each([
    { role: "OWNER", option: "VOIDED", allowed: true },
    { role: "ADMIN", option: "DP", allowed: true },
    { role: "SALES", option: "VOIDED", allowed: false },
    { role: "CASHIER", option: "REFUNDED", allowed: false },
    { role: "INVENTORY", option: "DP", allowed: false },
    { role: "UNKNOWN", option: "VOIDED", allowed: false },
    { role: null, option: "VOIDED", allowed: false },
    { role: null, option: "COMPLETED", allowed: true },
    { role: "OWNER", option: "PENDING_APPROVAL", allowed: false },
    { role: "SALES", option: "COMPLETED", allowed: true },
  ])("menerapkan batas server untuk $role → $option", ({ role, option, allowed }) => {
    expect(canSelectTransactionStatus(role, "COMPLETED", option, ["DP", "VOIDED", "REFUNDED"])).toBe(allowed);
  });

  it.each(["OWNER", "ADMIN", "SALES", "CASHIER"])("tidak membuka transisi terminal untuk %s", (role) => {
    expect(canSelectTransactionStatus(role, "VOIDED", "COMPLETED", [])).toBe(false);
  });
});
