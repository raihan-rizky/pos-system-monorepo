import { describe, expect, it } from "vitest";
import { calculateTransactionTax, calculateTaxPaymentState, getTransactionTaxMethod, getTransactionTaxRate } from "../helpers/tax-calculation";

describe("transaction tax", () => {
  it("keeps a legacy quotation's saved DPP method after approval without inventing a stored rate", () => {
    const sale = { status: "COMPLETED", subtotal: 120000, tax: 13200, taxRate: null, taxMethod: "DPP_NILAI_LAIN" };
    expect(getTransactionTaxMethod(sale)).toBe("DPP_NILAI_LAIN");
    expect(getTransactionTaxRate(sale)).toBe(12);
  });
  it("calculates regular tax after discount", () => {
    expect(calculateTransactionTax({ subtotal: 716000, discount: 10000, taxRate: 12, taxMethod: "STANDARD" }))
      .toEqual({ netAmount: 706000, dpp: 706000, tax: 84720, total: 790720 });
  });
  it("matches the reference invoice without rounding DPP before PPN", () => {
    expect(calculateTransactionTax({ subtotal: 706000, discount: 0, taxRate: 12, taxMethod: "DPP_NILAI_LAIN" }))
      .toEqual({ netAmount: 706000, dpp: 647167, tax: 77660, total: 783660 });
    expect(calculateTransactionTax({ subtotal: 5, taxRate: 10, taxMethod: "DPP_NILAI_LAIN" }).tax).toBe(0);
  });
  it("supports zero and decimal rates and floors the taxable amount at zero", () => {
    expect(calculateTransactionTax({ subtotal: 10000, taxRate: 2.5, taxMethod: "STANDARD" }).tax).toBe(250);
    expect(calculateTransactionTax({ subtotal: 100, taxRate: 0, taxMethod: "STANDARD" }).total).toBe(100);
    expect(calculateTransactionTax({ subtotal: 100, discount: 200, taxRate: 12, taxMethod: "STANDARD" }).total).toBe(0);
  });
  it("rounds decimal percentage half-rupiah amounts without floating point loss", () => {
    expect(calculateTransactionTax({ subtotal: 5000, taxRate: 0.57, taxMethod: "STANDARD" }).tax).toBe(29);
  });
  it.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY, 1.234])("rejects invalid rate %s", taxRate => {
    expect(() => calculateTransactionTax({ subtotal: 100, taxRate, taxMethod: "STANDARD" })).toThrow();
  });
  it("does not reuse change already returned when a paid invoice gains tax", () => {
    expect(calculateTaxPaymentState({ status: "COMPLETED", paymentMethod: "CASH", amountPaid: 100000, change: 10000, total: 99000 }))
      .toEqual({ status: "DP", amountPaid: 90000, change: 0, remaining: 9000 });
  });
  it("preserves the original tender and change when the total is unchanged", () => {
    expect(calculateTaxPaymentState({ status: "COMPLETED", paymentMethod: "CASH", amountPaid: 100000, change: 10000, previousTotal: 90000, total: 90000 }))
      .toEqual({ status: "COMPLETED", amountPaid: 100000, change: 10000, remaining: 0 });
  });
  it("keeps tempo and draft status and settles an overpaid DP", () => {
    expect(calculateTaxPaymentState({ status: "COMPLETED", paymentMethod: "TEMPO", amountPaid: 20000, change: 0, total: 110000 }).status).toBe("COMPLETED");
    expect(calculateTaxPaymentState({ status: "DRAFT", paymentMethod: "CASH", amountPaid: 0, change: 0, total: 110000 }).status).toBe("DRAFT");
    expect(calculateTaxPaymentState({ status: "DP", paymentMethod: "CASH", amountPaid: 100000, change: 0, total: 90000 }))
      .toEqual({ status: "COMPLETED", amountPaid: 100000, change: 10000, remaining: 0 });
  });
});
