import { describe, expect, it } from "vitest";
import * as unvoid from "../transaction-unvoid-plan";

const plan = (unvoid as Record<string, any>).buildUnvoidPlan;
const snapshot = {
  action: "VOID",
  previousStatus: "DP",
  transaction: { id: "tx-1", customerId: "customer-1", invoiceNumber: "INV-1", draftNumber: null },
  stockReturns: [{ productId: "product-1", stockGroupIdSnapshot: null, baseDelta: 3 }],
  stockResults: [{ productId: "product-1", stockGroupId: null, baseDelta: 3, beforeStock: 2, afterStock: 5 }],
  suratJalan: [
    { id: "sj-1", status: "CONFIRMED" },
    { id: "sj-2", status: "CANCELLED" },
  ],
  financialReversal: { amountPaid: 75, debtRemoved: 25 },
};

describe("rencana pemulihan dari audit void", () => {
  it("menyajikan dampak stok, saldo, dan surat jalan yang dibatalkan oleh void", () => {
    expect(plan?.("tx-1", snapshot)).toEqual({
      previousStatus: "DP", customerId: "customer-1",
      stockReturns: snapshot.stockReturns,
      shipments: [{ id: "sj-1", status: "CONFIRMED" }],
      financialReversal: snapshot.financialReversal,
    });
  });

  it.each([
    { ...snapshot, transaction: { ...snapshot.transaction, id: "another" } },
    { ...snapshot, stockResults: [] },
    { ...snapshot, stockResults: [{ ...snapshot.stockResults[0], afterStock: 99 }] },
    { ...snapshot, stockReturns: [{ productId: "product-1", stockGroupIdSnapshot: null, baseDelta: -3 }] },
    { ...snapshot, previousStatus: "VOIDED" },
    { ...snapshot, financialReversal: { amountPaid: -1, debtRemoved: 25 } },
    { ...snapshot, financialReversal: null },
  ])("menolak audit yang tidak konsisten", (invalid) => {
    expect(() => plan?.("tx-1", invalid)).toThrow();
  });
});
