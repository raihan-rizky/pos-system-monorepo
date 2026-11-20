import { describe, expect, it } from "vitest";
import { planExpensePaymentSettlement } from "../expense-correction-settlement";

const example = [{ id: "payment-1", amountCents: 200_000_000, paidAt: "2026-11-10" }];
const today = "2026-11-20";

describe("penyelesaian pembayaran pengeluaran", () => {
  it("menahan pembatalan selama pembayaran belum diselesaikan", () => {
    expect(planExpensePaymentSettlement(example, [], today)).toMatchObject({
      blockers: [{ paymentId: "payment-1", remainingCents: 200_000_000 }],
      settledCents: 0,
    });
  });

  it("mengizinkan dana kembali sebagian dan kredit pemasok untuk sisanya", () => {
    expect(planExpensePaymentSettlement(example, [
      {
        kind: "refund", paymentId: "payment-1", amountCents: 50_000_000,
        date: today, reference: "REF-31",
      },
      {
        kind: "credit", paymentId: "payment-1", amountCents: 150_000_000,
        supplierId: "supplier-1", reference: "NK-25",
      },
    ], today)).toMatchObject({
      blockers: [],
      settledCents: 200_000_000,
      refundedCents: 50_000_000,
      creditCents: 150_000_000,
      entryErrorCents: 0,
    });
  });

  it("menahan refund bertanggal setelah hari ini dan nominal yang melebihi pembayaran", () => {
    const refund = { kind: "refund", paymentId: "payment-1", date: "2026-11-21", reference: "REF-31" } as const;
    expect(planExpensePaymentSettlement(example, [{ ...refund, amountCents: 200_000_000 }], today).blockers)
      .toEqual([expect.objectContaining({ paymentId: "payment-1" })]);
    expect(planExpensePaymentSettlement(example, [{ ...refund, date: today, amountCents: 200_000_001 }], today).blockers)
      .toEqual([expect.objectContaining({ paymentId: "payment-1" })]);
  });

  it("menolak tanggal refund sebelum pembayaran atau tanggal kalender yang tidak valid", () => {
    const refund = { kind: "refund", paymentId: "payment-1", amountCents: 200_000_000, reference: "REF-31" } as const;
    for (const date of ["2026-11-09", "2026-10-32"]) {
      expect(planExpensePaymentSettlement(example, [{ ...refund, date }], today).blockers)
        .toMatchObject([{ paymentId: "payment-1" }]);
    }
  });

  it("menolak penyelesaian untuk pembayaran di luar transaksi yang dipilih", () => {
    expect(planExpensePaymentSettlement(example, [
      {
        kind: "credit", paymentId: "other-payment", amountCents: 200_000_000,
        supplierId: "supplier-1", reference: "NK-25",
      },
    ], today).blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ paymentId: "other-payment" }),
    ]));
  });

  it("membedakan salah catat tanpa arus kas dari refund atau kredit nyata", () => {
    expect(planExpensePaymentSettlement(example, [
      { kind: "entryError", paymentId: "payment-1", amountCents: 200_000_000, reference: "Catatan ganda" },
    ], today)).toMatchObject({
      blockers: [], settledCents: 200_000_000, refundedCents: 0, creditCents: 0, entryErrorCents: 200_000_000,
    });
  });
});
