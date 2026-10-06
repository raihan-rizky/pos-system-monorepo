import { describe, expect, it } from "vitest";
import { assertTempoCustomer, isActiveDebt } from "../payment-terms";

describe("payment terms", () => {
  it("counts unpaid Tempo invoices as receivables, separately from DP", () => {
    expect(
      isActiveDebt({
        status: "COMPLETED",
        paymentMethod: "TEMPO",
        total: 100_000,
        amountPaid: 0,
      }),
    ).toBe(true);
    expect(
      isActiveDebt({
        status: "COMPLETED",
        paymentMethod: "TEMPO",
        total: 100_000,
        amountPaid: 25_000,
      }),
    ).toBe(true);
    expect(
      isActiveDebt({
        status: "DP",
        paymentMethod: "CASH",
        total: 100_000,
        amountPaid: 25_000,
      }),
    ).toBe(true);
  });

  it("excludes settled, voided, and unpaid cash transactions from receivables", () => {
    expect(
      isActiveDebt({
        status: "COMPLETED",
        paymentMethod: "TEMPO",
        total: 100_000,
        amountPaid: 100_000,
      }),
    ).toBe(false);
    expect(
      isActiveDebt({
        status: "VOIDED",
        paymentMethod: "TEMPO",
        total: 100_000,
        amountPaid: 0,
      }),
    ).toBe(false);
    expect(
      isActiveDebt({
        status: "COMPLETED",
        paymentMethod: "CASH",
        total: 100_000,
        amountPaid: 0,
      }),
    ).toBe(false);
  });

  it("requires a customer for Tempo while leaving other payment methods unchanged", () => {
    expect(() => assertTempoCustomer("TEMPO", null)).toThrow(
      "Pilih pelanggan untuk transaksi Tempo.",
    );
    expect(() => assertTempoCustomer("TEMPO", "customer-1")).not.toThrow();
    expect(() => assertTempoCustomer("CASH", null)).not.toThrow();
  });
});
