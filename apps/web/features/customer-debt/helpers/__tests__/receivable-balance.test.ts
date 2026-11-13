import { describe, expect, it } from "vitest";
import { calculateReceivableBalance } from "../receivable-balance";

describe("calculateReceivableBalance", () => {
  it("combines unpaid Tempo and manual receivables in cents", () => {
    expect(calculateReceivableBalance({
      transactions: [
        { status: "COMPLETED", paymentMethod: "TEMPO", total: "300000.00", amountPaid: "120000.00" },
        { status: "COMPLETED", paymentMethod: "TEMPO", total: 0.3, amountPaid: 0.1 },
      ],
      manualReceivables: [
        { amount: "200000.00", amountPaid: "45000.00" },
      ],
    })).toBe(335000.2);
  });

  it("excludes DP and completed transactions not paid by Tempo", () => {
    expect(calculateReceivableBalance({
      transactions: [
        { status: "DP", paymentMethod: "TEMPO", total: 250000, amountPaid: 0 },
        { status: "COMPLETED", paymentMethod: "CASH", total: 100000, amountPaid: 0 },
      ],
      manualReceivables: [],
    })).toBe(0);
  });

  it("does not return negative balances for fully paid or overpaid records", () => {
    expect(calculateReceivableBalance({
      transactions: [
        { status: "COMPLETED", paymentMethod: "TEMPO", total: 50000, amountPaid: 60000 },
      ],
      manualReceivables: [
        { amount: 75000, amountPaid: 100000 },
      ],
    })).toBe(0);
  });
});
