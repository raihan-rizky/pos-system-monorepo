import { describe, expect, it } from "vitest";
import {
  buildPaymentSubmission,
  canSubmitPayment,
} from "../payment-submission";

describe("Tempo checkout submission", () => {
  it("sends an unpaid Tempo transaction without inventing a cash payment", () => {
    expect(
      buildPaymentSubmission({
        mode: "TEMPO",
        selectedPaymentMethods: ["CASH"],
        amountsPaid: {},
      }),
    ).toEqual({
      paymentMethod: "TEMPO",
      paymentStatus: "COMPLETED",
      amountPaid: 0,
      payments: [],
    });
  });

  it("keeps a partial payment as its actual method while marking the invoice Tempo", () => {
    expect(
      buildPaymentSubmission({
        mode: "TEMPO",
        selectedPaymentMethods: ["CASH", "QRIS"],
        amountsPaid: { CASH: 20000, QRIS: 5000 },
      }),
    ).toEqual({
      paymentMethod: "TEMPO",
      paymentStatus: "COMPLETED",
      amountPaid: 25000,
      payments: [
        { method: "CASH", amount: 20000 },
        { method: "QRIS", amount: 5000 },
      ],
    });
  });

  it("allows a zero or partial first payment only with a selected customer", () => {
    expect(
      canSubmitPayment({
        mode: "TEMPO",
        amountPaid: 0,
        total: 100000,
        hasCustomer: false,
        hasInvalidManualPrice: false,
      }),
    ).toBe(false);
    expect(
      canSubmitPayment({
        mode: "TEMPO",
        amountPaid: 0,
        total: 100000,
        hasCustomer: true,
        hasInvalidManualPrice: false,
      }),
    ).toBe(true);
    expect(
      canSubmitPayment({
        mode: "TEMPO",
        amountPaid: 25000,
        total: 100000,
        hasCustomer: true,
        hasInvalidManualPrice: false,
      }),
    ).toBe(true);
  });

  it("keeps Tempo separate from DP and requires a remaining balance", () => {
    expect(
      buildPaymentSubmission({
        mode: "DP",
        selectedPaymentMethods: ["CASH"],
        amountsPaid: { CASH: 10000 },
      }),
    ).toMatchObject({ paymentMethod: "CASH", paymentStatus: "DP" });
    expect(
      canSubmitPayment({
        mode: "TEMPO",
        amountPaid: 100000,
        total: 100000,
        hasCustomer: true,
        hasInvalidManualPrice: false,
      }),
    ).toBe(false);
  });
});
