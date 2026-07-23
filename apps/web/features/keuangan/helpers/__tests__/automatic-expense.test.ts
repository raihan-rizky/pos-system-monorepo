import { describe, expect, it } from "vitest";
import { classifyAutomaticExpense } from "../automatic-expense";

describe("automatic expense classification", () => {
  it("prefers the goods purchase source", () => {
    expect(
      classifyAutomaticExpense({
        goodsPurchaseId: "purchase-1",
        shoppingRequestId: "request-1",
      }),
    ).toEqual({
      automatic: true,
      label: "Pembelian Barang",
    });
  });

  it("keeps legacy shopping-request expenses protected", () => {
    expect(
      classifyAutomaticExpense({
        goodsPurchaseId: null,
        shoppingRequestId: "request-legacy",
      }),
    ).toEqual({
      automatic: true,
      label: "Daftar Belanja (Legacy)",
    });
  });

  it("classifies unlinked expenses as manual", () => {
    expect(
      classifyAutomaticExpense({
        goodsPurchaseId: null,
        shoppingRequestId: null,
      }),
    ).toEqual({ automatic: false, label: "Manual" });
  });
});
