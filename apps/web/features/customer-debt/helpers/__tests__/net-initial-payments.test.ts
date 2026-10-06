import { describe, expect, it } from "vitest";
import { netInitialPayments } from "../net-initial-payments";

describe("netInitialPayments", () => {
  it("keeps partial receipts and excludes the Tempo obligation", () => {
    expect(netInitialPayments([{ method: "CASH", amount: 25 }, { method: "TEMPO", amount: 75 }], { total: 100, amountPaid: 25 })).toEqual([{ method: "CASH", amount: 25 }, { method: "TEMPO", amount: 0 }]);
  });
  it("returns cash change before reducing a non-cash tender", () => {
    expect(netInitialPayments([{ method: "TRANSFER", amount: 80 }, { method: "CASH", amount: 50 }], { total: 100, amountPaid: 130, change: 30 }).map((row) => row.amount)).toEqual([80, 20]);
  });
  it("allocates legacy non-cash overpayment deterministically without negative amounts", () => {
    expect(netInitialPayments([{ method: "QRIS", amount: 20 }, { method: "TRANSFER", amount: 130 }], { total: 100, amountPaid: 150 }).map((row) => row.amount)).toEqual([20, 80]);
  });
  it("uses cents and preserves dates and input rows", () => {
    const rows = [{ method: "CASH", amount: 10.03, createdAt: new Date("2026-10-05T17:00:00Z") }];
    expect(netInitialPayments(rows, { total: 10.01, amountPaid: 10.03, change: 0.02 })).toEqual([{ ...rows[0], amount: 10.01 }]);
    expect(rows[0].amount).toBe(10.03);
  });
  it("caps impossible tenders at the recorded retained total", () => {
    expect(netInitialPayments([{ method: "CASH", amount: 150 }, { method: "TRANSFER", amount: 75 }], { total: 100, amountPaid: 50, change: 0 }).reduce((sum, row) => sum + row.amount, 0)).toBe(50);
  });
});
