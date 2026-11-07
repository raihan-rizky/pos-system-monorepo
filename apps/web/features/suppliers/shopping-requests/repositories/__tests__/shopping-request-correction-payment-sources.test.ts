import { describe, expect, it } from "vitest";
import { resolveCorrectionPaymentSources } from "../shopping-request-correction-payment-sources";

const expense = { paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE" as const, amount: "1000000.00", paidAt: "2026-10-01" };
const payment = { paymentId: "payment-1", sourceKind: "PAYABLE_PAYMENT" as const, amount: "200000.00", paidAt: "2026-10-03" };

describe("sumber pembayaran untuk koreksi berikutnya", () => {
  it("memakai sumber awal sebelum ada koreksi", () => {
    expect(resolveCorrectionPaymentSources({ previous: null, current: [expense, payment] })).toEqual([expense, payment]);
  });

  it("mempertahankan pembayaran Transfer ketika nilai pengeluaran sudah berubah dan menambahkan pembayaran giro baru", () => {
    expect(resolveCorrectionPaymentSources({
      previous: [expense], current: [{ ...expense, amount: "700000.00" }, payment],
    })).toEqual([expense, payment]);
  });

  it("tidak menganggap pengeluaran yang baru muncul setelah snapshot kosong sebagai pembayaran", () => {
    expect(resolveCorrectionPaymentSources({ previous: [], current: [expense, payment] })).toEqual([payment]);
  });

  it("memasukkan Transfer baru yang memiliki sumber permanen setelah koreksi pra-penerimaan", () => {
    expect(resolveCorrectionPaymentSources({ previous: [], current: [expense], trustedTransferIds: [expense.paymentId] })).toEqual([expense]);
  });

  it("menolak sumber sebelumnya yang hilang dan identitas sumber ganda", () => {
    expect(() => resolveCorrectionPaymentSources({ previous: [payment], current: [] })).toThrow(/sumber.*pembayaran/i);
    expect(() => resolveCorrectionPaymentSources({ previous: null, current: [expense, expense] })).toThrow(/ganda/i);
    expect(() => resolveCorrectionPaymentSources({ previous: [expense, expense], current: [expense] })).toThrow(/ganda/i);
  });

  it("menolak nominal dan tanggal sumber yang tidak valid", () => {
    expect(() => resolveCorrectionPaymentSources({ previous: null, current: [{ ...expense, amount: "-1" }] })).toThrow(/nominal/i);
    expect(() => resolveCorrectionPaymentSources({ previous: [{ ...expense, paidAt: "2026-02-30" }], current: [expense] })).toThrow(/tanggal/i);
  });
});
