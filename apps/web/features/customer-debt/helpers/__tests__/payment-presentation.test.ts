import { describe, expect, it } from "vitest";
import { getPaymentPresentation } from "../payment-presentation";

describe("getPaymentPresentation", () => {
  it("shows unpaid and settled Tempo invoices with the correct remaining balance", () => {
    expect(
      getPaymentPresentation({
        status: "COMPLETED",
        paymentMethod: "TEMPO",
        total: 100_000,
        amountPaid: 0,
      }),
    ).toEqual({ badge: "TEMPO/TAGIHAN", remaining: 100_000, settled: false });

    expect(
      getPaymentPresentation({
        status: "COMPLETED",
        paymentMethod: "TEMPO",
        total: 100_000,
        amountPaid: 100_000,
      }),
    ).toEqual({ badge: "TEMPO/TAGIHAN", remaining: 0, settled: true });
  });

  it("keeps DP labeling and excludes voided and ordinary completed sales", () => {
    expect(
      getPaymentPresentation({
        status: "DP",
        paymentMethod: "CASH",
        total: 100_000,
        amountPaid: 40_000,
      }),
    ).toEqual({ badge: "DP", remaining: 60_000, settled: false });

    expect(
      getPaymentPresentation({
        status: "VOIDED",
        paymentMethod: "TEMPO",
        total: 100_000,
        amountPaid: 0,
      }),
    ).toEqual({ badge: null, remaining: 0, settled: false });

    expect(
      getPaymentPresentation({
        status: "COMPLETED",
        paymentMethod: "CASH",
        total: 100_000,
        amountPaid: 100_000,
      }),
    ).toEqual({ badge: null, remaining: 0, settled: true });
  });

  it("returns a safe zero balance for invalid amounts", () => {
    expect(
      getPaymentPresentation({
        status: "COMPLETED",
        paymentMethod: "TEMPO",
        total: Number.NaN,
        amountPaid: 0,
      }),
    ).toEqual({ badge: "TEMPO/TAGIHAN", remaining: 0, settled: false });
  });
});
