import { describe, expect, it } from "vitest";
import {
  formatHistoryPaymentAmount,
  getHistoryPaymentEntries,
} from "../helpers/payment-presentation";

describe("history payment presentation", () => {
  it("formats whole Rupiah amounts with the Indonesian thousands separator", () => {
    expect(formatHistoryPaymentAmount(15_000)).toBe("Rp 15.000");
  });

  it("keeps zero and decimal amounts stable", () => {
    expect(formatHistoryPaymentAmount(0)).toBe("Rp 0");
    expect(formatHistoryPaymentAmount("1000.5")).toBe("Rp 1.000,5");
  });

  it("uses the stored single payment when available", () => {
    expect(getHistoryPaymentEntries({
      paymentMethod: "CASH",
      amountPaid: 1_000,
      payments: [{ method: "CASH", amount: 1_000 }],
    })).toEqual([{ method: "CASH", amount: 1_000 }]);
  });

  it("falls back to the legacy payment method and amount paid", () => {
    expect(getHistoryPaymentEntries({
      paymentMethod: "QRIS",
      amountPaid: 15_000,
    })).toEqual([{ method: "QRIS", amount: 15_000 }]);
  });

  it("includes initial and later payments with their actual amounts", () => {
    expect(getHistoryPaymentEntries({
      paymentMethod: "CASH",
      amountPaid: 1_000_000,
      payments: [{ method: "CASH", amount: 300_000 }],
      debtPaymentLogs: [{ paymentMethod: "TRANSFER", amount: 700_000 }],
    })).toEqual([
      { method: "CASH", amount: 300_000 },
      { method: "TRANSFER", amount: 700_000 },
    ]);
  });

  it("deducts recorded installments from the legacy initial payment", () => {
    expect(getHistoryPaymentEntries({
      paymentMethod: "CASH",
      amountPaid: 1_000_000,
      payments: [],
      debtPaymentLogs: [
        { paymentMethod: "TRANSFER", amount: 600_000 },
        { paymentMethod: "QRIS", amount: 100_000 },
      ],
    })).toEqual([
      { method: "CASH", amount: 300_000 },
      { method: "TRANSFER", amount: 600_000 },
      { method: "QRIS", amount: 100_000 },
    ]);
  });

  it("does not count a zero initial payment as a payment method", () => {
    expect(getHistoryPaymentEntries({
      paymentMethod: "CASH",
      amountPaid: 700_000,
      payments: [{ method: "CASH", amount: 0 }],
      debtPaymentLogs: [{ paymentMethod: "TRANSFER", amount: 700_000 }],
    })).toEqual([{ method: "TRANSFER", amount: 700_000 }]);
  });

  it("does not infer an initial method when all legacy payments are recorded as installments", () => {
    expect(getHistoryPaymentEntries({
      paymentMethod: "CASH",
      amountPaid: 0.3,
      payments: [],
      debtPaymentLogs: [
        { paymentMethod: "TRANSFER", amount: 0.1 },
        { paymentMethod: "TRANSFER", amount: 0.2 },
      ],
    })).toEqual([
      { method: "TRANSFER", amount: 0.1 },
      { method: "TRANSFER", amount: 0.2 },
    ]);
  });
});
