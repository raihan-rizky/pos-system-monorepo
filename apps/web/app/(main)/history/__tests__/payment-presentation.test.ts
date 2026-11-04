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
});
