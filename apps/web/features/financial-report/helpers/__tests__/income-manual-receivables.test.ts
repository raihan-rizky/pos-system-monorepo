import { describe, expect, it } from "vitest";
import { buildIncomePeriod } from "../income-period";

describe("penerimaan pembayaran piutang manual", () => {
  it("memakai tanggal pembayaran dan kategori yang dipilih, termasuk data lama tanpa kategori", () => {
    const result = buildIncomePeriod({
      fromDate: "2026-11-10", toDate: "2026-11-11", transactions: [], manualIncome: [],
      manualReceivables: [
        { id: "atk", amount: 100, reportCategory: "ATK", payments: [
          { id: "one", method: "TRANSFER", amount: 40, paidAt: new Date("2026-11-10T00:00:00Z"), createdAt: new Date("2026-11-11T08:00:00Z") },
          { id: "two", method: "CASH", amount: 60, paidAt: null, createdAt: new Date("2026-11-10T17:00:00Z") },
        ] },
        { id: "legacy", amount: 10, reportCategory: null, payments: [
          { id: "legacy-payment", method: "CASH", amount: 10, paidAt: null, createdAt: new Date("2026-11-10T16:59:59Z") },
        ] },
      ],
    });
    expect(result.days.map(day => [day.date, day.total])).toEqual([["2026-11-10", 50], ["2026-11-11", 60]]);
    expect(result.days[0].categories).toEqual(expect.arrayContaining([
      { category: "ATK", amount: 40 }, { category: "Belum ditentukan", amount: 10 },
    ]));
    expect(result.days[1].paymentMethods).toEqual([{ method: "CASH", amount: 60 }]);
  });
});
