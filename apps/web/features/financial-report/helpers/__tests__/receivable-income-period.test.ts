import { describe, expect, it } from "vitest";
import { buildIncomePeriod } from "../income-period";

const nota = {
  id: "nota-1", createdAt: new Date("2026-11-09T03:00:00Z"), status: "COMPLETED",
  paymentMethod: "TEMPO", total: 150_000, amountPaid: 150_000, change: 0,
  transactionCategory: "ATK", items: [],
  payments: [{ id: "awal", method: "CASH", amount: 90_000, createdAt: new Date("2026-11-10T03:00:00Z") }],
  debtPaymentLogs: [{ id: "pelunasan", paymentMethod: "TRANSFER", amount: 60_000, createdAt: new Date("2026-11-11T03:00:00Z") }],
};

describe("penerimaan pembayaran piutang", () => {
  it("menggabungkan pelunasan nota dan piutang manual tanpa menggandakan pembayaran", () => {
    const pembayaran = { id: "manual-1", receivableId: "piutang-1", method: "TRANSFER", amount: 25_000, createdAt: new Date("2026-11-11T04:00:00Z") };
    const input = {
      fromDate: "2026-11-11", toDate: "2026-11-11", transactions: [nota], manualIncome: [],
      manualReceivablePayments: [pembayaran, pembayaran, { ...pembayaran, id: "manual-2", method: "CASH", amount: 15_000 }],
    };

    const result = buildIncomePeriod(input);

    expect(result.days[0].total).toBe(100_000);
    expect(result.days[0].paymentMethods).toEqual([{ method: "CASH", amount: 15_000 }, { method: "TRANSFER", amount: 85_000 }]);
    expect(result.days[0].categories).toEqual(expect.arrayContaining([
      { category: "ATK", amount: 60_000 }, { category: "Piutang Manual", amount: 40_000 },
    ]));
    expect(result.contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "transaction", transactionId: "nota-1", method: "TRANSFER", amount: 60_000 }),
      expect.objectContaining({ source: "manual-receivable", receivablePaymentId: "manual-1", method: "TRANSFER", amount: 25_000 }),
    ]));
  });

  it("memisahkan pembayaran manual pada batas tengah malam WIB", () => {
    const input = {
      fromDate: "2026-11-10", toDate: "2026-11-11", transactions: [], manualIncome: [],
      manualReceivablePayments: [
        { id: "before", receivableId: "r", method: "CASH", amount: 10, createdAt: new Date("2026-11-10T16:59:59.999Z") },
        { id: "after", receivableId: "r", method: "QRIS", amount: 20, createdAt: new Date("2026-11-10T17:00:00.000Z") },
        { id: "outside", receivableId: "r", method: "CASH", amount: 30, createdAt: new Date("2026-11-11T17:00:00.000Z") },
      ],
    };
    expect(buildIncomePeriod(input).days.map(day => day.total)).toEqual([10, 20]);
  });
});
