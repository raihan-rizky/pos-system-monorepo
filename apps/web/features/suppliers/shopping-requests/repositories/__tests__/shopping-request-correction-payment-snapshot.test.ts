import { describe, expect, it } from "vitest";
import { readCorrectionPaymentSnapshot } from "../shopping-request-correction-payment-snapshot";

describe("snapshot pembayaran koreksi", () => {
  it("membedakan snapshot kosong dari koreksi yang belum memiliki snapshot", () => {
    expect(readCorrectionPaymentSnapshot({ paymentSnapshot: { sources: [], allocations: [] } })).toEqual({ sources: [], allocations: [] });
    expect(() => readCorrectionPaymentSnapshot({})).toThrow(/riwayat.*pembayaran/i);
  });

  it("mempertahankan alokasi lintas metode dan tanggal sumber", () => {
    const sources = [{ paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", amount: "1000.00", paidAt: "2026-10-01" }];
    const allocations = [
      { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", method: "TRANSFER", amount: "400.00" },
      { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", method: "GIRO", amount: "600.00" },
    ];
    expect(readCorrectionPaymentSnapshot({ paymentSnapshot: { sources, allocations } })).toEqual({ sources, allocations });
  });

  it("menolak snapshot tidak lengkap atau alokasi yang tidak sesuai", () => {
    const source = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", amount: "1000.00", paidAt: "2026-10-01" };
    expect(() => readCorrectionPaymentSnapshot({ paymentSnapshot: { sources: [source] } })).toThrow(/riwayat.*pembayaran/i);
    expect(() => readCorrectionPaymentSnapshot({ paymentSnapshot: { sources: [source], allocations: [{ paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", method: "GIRO", amount: "900.00" }] } })).toThrow(/alokasi/i);
  });
});
