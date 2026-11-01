import { describe, expect, it } from "vitest";

import {
  parseBackdatedPaymentInput,
  parseBackdatedPurchaseInput,
} from "../backdated-purchase-input";

const now = new Date("2026-10-31T17:30:00.000Z");
const purchase = {
  purchaseDate: "2026-10-15",
  dueDate: "2026-11-10",
  reference: "GIRO-123",
  amount: "10000000.00",
  requestId: "purchase-request-1",
  payments: [
    { amount: "4000000", paidAt: "2026-10-20", requestId: "payment-1" },
    { amount: "2000000", paidAt: "2026-10-31", requestId: "payment-2" },
  ],
};

describe("parseBackdatedPurchaseInput", () => {
  it("accepts a previous-month purchase with historical payments and defaults to Giro", () => {
    expect(parseBackdatedPurchaseInput(purchase, now)).toEqual({
      purchaseDate: "2026-10-15",
      dueDate: "2026-11-10",
      paymentMethod: "GIRO",
      reference: "GIRO-123",
      amountCents: 1_000_000_000,
      requestId: "purchase-request-1",
      payments: [
        { amountCents: 400_000_000, paidAt: "2026-10-20", requestId: "payment-1" },
        { amountCents: 200_000_000, paidAt: "2026-10-31", requestId: "payment-2" },
      ],
    });
  });

  it("uses WIB to reject a purchase in the current month", () => {
    expect(() => parseBackdatedPurchaseInput({ ...purchase, purchaseDate: "2026-11-01", payments: [] }, now)).toThrow();
    expect(() => parseBackdatedPurchaseInput({ ...purchase, purchaseDate: "2026-10-31", payments: [] }, now)).not.toThrow();
  });

  it("rejects invalid dates, an early due date, and missing reference", () => {
    for (const input of [
      { ...purchase, purchaseDate: "2026-02-30" },
      { ...purchase, dueDate: "2026-10-14" },
      { ...purchase, reference: "   " },
    ]) expect(() => parseBackdatedPurchaseInput(input, now)).toThrow();
  });

  it("rejects invalid amounts, repeated request identifiers, and overpayment", () => {
    for (const input of [
      { ...purchase, amount: "0" },
      { ...purchase, amount: "1.001" },
      { ...purchase, amount: "99999999999.00" },
      { ...purchase, amount: "5000000" },
      { ...purchase, payments: [purchase.payments[0], purchase.payments[0]] },
    ]) expect(() => parseBackdatedPurchaseInput(input, now)).toThrow();
  });
});

describe("parseBackdatedPaymentInput", () => {
  it("accepts a dated payment and converts decimal amounts to cents exactly", () => {
    expect(parseBackdatedPaymentInput({ amount: "123.45", paidAt: "2026-10-31", requestId: "pay-1" }, "2026-10-15", now))
      .toEqual({ amountCents: 12345, paidAt: "2026-10-31", requestId: "pay-1" });
  });

  it("rejects payments before purchase or after today in WIB", () => {
    for (const paidAt of ["2026-10-14", "2026-11-02", "2026-02-30"]) {
      expect(() => parseBackdatedPaymentInput({ amount: "1", paidAt, requestId: "pay-1" }, "2026-10-15", now)).toThrow();
    }
  });
});
