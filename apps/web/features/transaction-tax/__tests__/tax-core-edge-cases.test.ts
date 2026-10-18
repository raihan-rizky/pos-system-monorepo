import { describe, expect, it } from "vitest";
import {
  calculateTaxPaymentState,
  calculateTransactionTax,
  getTransactionTaxMethod,
  getTransactionTaxRate,
} from "../helpers/tax-calculation";

describe("transaction tax arithmetic boundaries", () => {
  // These fixtures catch premature DPP rounding, truncated decimal rates,
  // floating point half-rupiah errors, and tax computed before discount.
  it.each([
    {
      name: "keeps fractional rupiah in the net amount and total",
      subtotal: 150.75, discount: 50.5, taxRate: 12, taxMethod: "STANDARD" as const,
      expected: { netAmount: 100.25, dpp: 100, tax: 12, total: 112.25 },
    },
    {
      name: "rounds down just below half a rupiah at the minimum decimal rate",
      subtotal: 4999.99, discount: 0, taxRate: 0.01, taxMethod: "STANDARD" as const,
      expected: { netAmount: 4999.99, dpp: 5000, tax: 0, total: 4999.99 },
    },
    {
      name: "rounds half a rupiah up at the minimum decimal rate",
      subtotal: 5000, discount: 0, taxRate: 0.01, taxMethod: "STANDARD" as const,
      expected: { netAmount: 5000, dpp: 5000, tax: 1, total: 5001 },
    },
    {
      name: "keeps both decimal places of a rate near the upper limit",
      subtotal: 10000, discount: 0, taxRate: 99.99, taxMethod: "STANDARD" as const,
      expected: { netAmount: 10000, dpp: 10000, tax: 9999, total: 19999 },
    },
    {
      name: "applies the 100 percent rate to the reduced DPP",
      subtotal: 15, discount: 3, taxRate: 100, taxMethod: "DPP_NILAI_LAIN" as const,
      expected: { netAmount: 12, dpp: 11, tax: 11, total: 23 },
    },
    {
      name: "does not tax a fractional reduced DPP below the half-rupiah threshold",
      subtotal: 4.54, discount: 0, taxRate: 12, taxMethod: "DPP_NILAI_LAIN" as const,
      expected: { netAmount: 4.54, dpp: 4, tax: 0, total: 4.54 },
    },
    {
      name: "taxes a fractional reduced DPP above the half-rupiah threshold",
      subtotal: 4.55, discount: 0, taxRate: 12, taxMethod: "DPP_NILAI_LAIN" as const,
      expected: { netAmount: 4.55, dpp: 4, tax: 1, total: 5.55 },
    },
    {
      name: "keeps cent precision for a large invoice",
      subtotal: 10000000000, discount: 0.01, taxRate: 12, taxMethod: "STANDARD" as const,
      expected: { netAmount: 9999999999.99, dpp: 10000000000, tax: 1200000000, total: 11199999999.99 },
    },
  ])("$name", ({ expected, name: _name, ...input }) => {
    expect(calculateTransactionTax(input)).toEqual(expected);
  });

  it.each(["STANDARD", "DPP_NILAI_LAIN"] as const)("clears tax when discount consumes the whole %s invoice", taxMethod => {
    expect(calculateTransactionTax({ subtotal: 12345.67, discount: 12345.67, taxRate: 100, taxMethod }))
      .toEqual({ netAmount: 0, dpp: 0, tax: 0, total: 0 });
  });

  it("keeps the reduced DPP visible on a zero-rated invoice", () => {
    expect(calculateTransactionTax({ subtotal: 130000, discount: 10000, taxRate: 0, taxMethod: "DPP_NILAI_LAIN" }))
      .toEqual({ netAmount: 120000, dpp: 110000, tax: 0, total: 120000 });
  });

  it.each([
    { subtotal: Number.NaN },
    { subtotal: Number.POSITIVE_INFINITY },
    { subtotal: Number.NEGATIVE_INFINITY },
    { subtotal: 100, discount: Number.NaN },
    { subtotal: 100, discount: Number.POSITIVE_INFINITY },
    { subtotal: 100, discount: Number.NEGATIVE_INFINITY },
  ])("rejects non-finite transaction money: %j", input => {
    expect(() => calculateTransactionTax({ ...input, taxRate: 12, taxMethod: "STANDARD" })).toThrow();
  });
});

describe("legacy transaction tax snapshots", () => {
  // Missing metadata must use historical status rules; explicit metadata must
  // survive status changes when a quotation becomes a completed transaction.
  it.each([
    { status: "DRAFT", tax: 13200, expectedMethod: "DPP_NILAI_LAIN", expectedRate: 12 },
    { status: "COMPLETED", tax: 14400, expectedMethod: "STANDARD", expectedRate: 12 },
    { status: "DP", tax: 3000, expectedMethod: "STANDARD", expectedRate: 2.5 },
    { status: "PENDING_APPROVAL", tax: 14400, expectedMethod: "STANDARD", expectedRate: 12 },
  ])("infers the method and rate for legacy $status transactions", ({ expectedMethod, expectedRate, ...fixture }) => {
    const transaction = { ...fixture, subtotal: 130000, discount: 10000, taxRate: null, taxMethod: null };
    expect(getTransactionTaxMethod(transaction)).toBe(expectedMethod);
    expect(getTransactionTaxRate(transaction)).toBe(expectedRate);
  });

  it("does not replace an explicit zero rate with an inferred legacy rate", () => {
    const transaction = { status: "DRAFT", subtotal: 100000, discount: 0, tax: 12000, taxRate: 0, taxMethod: "STANDARD" };
    expect(getTransactionTaxMethod(transaction)).toBe("STANDARD");
    expect(getTransactionTaxRate(transaction)).toBe(0);
  });

  it("reads decimal-backed stored rates without falling back to legacy inference", () => {
    const transaction = { status: "COMPLETED", taxRate: { toString: () => "2.75" }, taxMethod: "DPP_NILAI_LAIN" };
    expect(getTransactionTaxRate(transaction)).toBe(2.75);
    expect(getTransactionTaxMethod(transaction)).toBe("DPP_NILAI_LAIN");
  });

  it.each([
    { subtotal: 0, discount: 0 },
    { subtotal: 100, discount: 100 },
    { subtotal: 100, discount: 200 },
  ])("returns zero instead of an invalid legacy rate for a nonpositive net: %j", money => {
    expect(getTransactionTaxRate({ ...money, status: "DRAFT", tax: 100 })).toBe(0);
  });

  it("preserves a legacy quotation's tax when its resolved snapshot becomes a sale", () => {
    const quotation = { status: "DRAFT", subtotal: 130000, discount: 10000, tax: 13200 };
    const sale = {
      ...quotation,
      status: "COMPLETED",
      taxRate: getTransactionTaxRate(quotation),
      taxMethod: getTransactionTaxMethod(quotation),
    };

    expect(calculateTransactionTax({ ...sale, taxRate: getTransactionTaxRate(sale), taxMethod: getTransactionTaxMethod(sale) }))
      .toEqual({ netAmount: 120000, dpp: 110000, tax: 13200, total: 133200 });
  });
});

describe("tax adjustment payment transitions", () => {
  // These cases catch spending returned change twice and stale payment status
  // after a tax adjustment changes the amount owed.
  it.each([
    {
      name: "marks an exact DP balance as completed",
      status: "DP", paymentMethod: "TRANSFER", amountPaid: 110000, change: 0, total: 110000,
      expected: { status: "COMPLETED", amountPaid: 110000, change: 0, remaining: 0 },
    },
    {
      name: "keeps a partial payment DP when the new total is still higher",
      status: "DP", paymentMethod: "CASH", amountPaid: 50000, change: 0, total: 111000,
      expected: { status: "DP", amountPaid: 50000, change: 0, remaining: 61000 },
    },
    {
      name: "recomputes a refund from money retained after the previous change",
      status: "COMPLETED", paymentMethod: "CASH", amountPaid: 150000, change: 20000, total: 120000,
      expected: { status: "COMPLETED", amountPaid: 130000, change: 10000, remaining: 0 },
    },
    {
      name: "reports the full balance when no payment has been received",
      status: "DP", paymentMethod: "TRANSFER", amountPaid: 0, change: 0, total: 111000,
      expected: { status: "DP", amountPaid: 0, change: 0, remaining: 111000 },
    },
    {
      name: "settles a zero total without creating a negative balance",
      status: "DP", paymentMethod: "CASH", amountPaid: 0, change: 0, total: 0,
      expected: { status: "COMPLETED", amountPaid: 0, change: 0, remaining: 0 },
    },
    {
      name: "keeps a pending approval provisional even when tender exceeds the total",
      status: "PENDING_APPROVAL", paymentMethod: "CASH", amountPaid: 150000, change: 0, total: 111000,
      expected: { status: "PENDING_APPROVAL", amountPaid: 150000, change: 0, remaining: 0 },
    },
    {
      name: "preserves a tempo DP status even when its balance reaches zero",
      status: "DP", paymentMethod: "TEMPO", amountPaid: 111000, change: 0, total: 111000,
      expected: { status: "DP", amountPaid: 111000, change: 0, remaining: 0 },
    },
    {
      name: "retains cent precision when subtracting returned change",
      status: "COMPLETED", paymentMethod: "CASH", amountPaid: 1000.25, change: 0.1, total: 1000.2,
      expected: { status: "DP", amountPaid: 1000.15, change: 0, remaining: 0.05 },
    },
  ])("$name", ({ expected, name: _name, ...input }) => {
    expect(calculateTaxPaymentState(input)).toEqual(expected);
  });
});
