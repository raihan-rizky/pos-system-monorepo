import { describe, expect, it } from "vitest";
import {
  getDebtQuickPaymentAmount,
  getTransactionDebtRemaining,
  isValidDebtPayment,
} from "../debt-payment";

describe("debt-payment", () => {
  it("calculates remaining debt for a DP transaction", () => {
    expect(getTransactionDebtRemaining({ total: 250000, amountPaid: 100000 })).toBe(
      150000,
    );
  });

  it("does not return a negative remaining amount", () => {
    expect(getTransactionDebtRemaining({ total: 100000, amountPaid: 125000 })).toBe(
      0,
    );
  });

  it("calculates quick payment amounts from the remaining debt", () => {
    expect(getDebtQuickPaymentAmount(125000, "half")).toBe(62500);
    expect(getDebtQuickPaymentAmount(125000, "full")).toBe(125000);
  });

  it("validates positive payments that do not exceed the remaining debt", () => {
    expect(isValidDebtPayment({ amount: 1, remaining: 100000 })).toBe(true);
    expect(isValidDebtPayment({ amount: 100000, remaining: 100000 })).toBe(true);
    expect(isValidDebtPayment({ amount: 0, remaining: 100000 })).toBe(false);
    expect(isValidDebtPayment({ amount: 100001, remaining: 100000 })).toBe(false);
  });
});
