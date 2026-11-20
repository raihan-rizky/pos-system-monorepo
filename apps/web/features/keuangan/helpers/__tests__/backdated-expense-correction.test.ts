import { describe, expect, it } from "vitest";
import { planBackdatedExpenseCorrection } from "../backdated-expense-correction";

const purchase = {
  id: "purchase-1",
  reference: "BT-1",
  purchaseDate: "2026-11-01",
  dueDate: "2026-11-22",
  paymentMethod: "GIRO" as const,
  amountCents: 261_500_000,
  payments: [
    { id: "payment-1", amountCents: 120_000_000, paidAt: "2026-11-05" },
    { id: "payment-2", amountCents: 80_000_000, paidAt: "2026-11-08" },
  ],
};
const today = "2026-11-20";

describe("koreksi Belanja Terdahulu", () => {
  it("memisahkan pembatalan satu pembayaran dari pembatalan pembelian", () => {
    const plan = planBackdatedExpenseCorrection(purchase, "payment-2", "cancel", undefined, today);
    expect(plan.before.remainingCents).toBe(61_500_000);
    expect(plan.after).toMatchObject({
      amountCents: 261_500_000, remainingCents: 141_500_000, cancelled: false,
      payments: [{ id: "payment-1", amountCents: 120_000_000 }],
    });
    expect(plan.paymentsToSettle).toEqual([purchase.payments[1]]);
  });

  it("menghitung seluruh pembayaran yang perlu diselesaikan saat pembelian dibatalkan", () => {
    const plan = planBackdatedExpenseCorrection(purchase, undefined, "cancel", undefined, today);
    expect(plan.after).toMatchObject({ amountCents: 0, remainingCents: 0, cancelled: true, payments: [] });
    expect(plan.paymentsToSettle).toEqual(purchase.payments);
  });

  it("mengoreksi nominal pembayaran tertentu dan menghitung ulang sisa tagihan", () => {
    const plan = planBackdatedExpenseCorrection(purchase, "payment-2", "edit", {
      amountCents: 70_000_000, paidAt: "2026-11-09",
    }, today);
    expect(plan.after).toMatchObject({
      remainingCents: 71_500_000,
      payments: [purchase.payments[0], { id: "payment-2", amountCents: 70_000_000, paidAt: "2026-11-09" }],
    });
    expect(plan.paymentsToSettle).toEqual([]);
  });

  it("menolak pembayaran yang bukan bagian dari pembelian dan nominal yang membuat tagihan negatif", () => {
    expect(() => planBackdatedExpenseCorrection(purchase, "other", "cancel", undefined, today)).toThrow(/tidak ditemukan/i);
    expect(() => planBackdatedExpenseCorrection(purchase, undefined, "edit", { amountCents: 199_999_999 }, today))
      .toThrow(/pembayaran.*melebihi/i);
  });

  it("menjaga urutan tanggal pembelian, pembayaran, dan jatuh tempo", () => {
    for (const changes of [{ purchaseDate: "2026-11-06" }, { dueDate: "2026-10-31" }]) {
      expect(() => planBackdatedExpenseCorrection(purchase, undefined, "edit", changes, today)).toThrow(/tanggal/i);
    }
    expect(() => planBackdatedExpenseCorrection(purchase, "payment-2", "edit", { paidAt: "2026-11-21" }, today))
      .toThrow(/tanggal/i);
  });
});
