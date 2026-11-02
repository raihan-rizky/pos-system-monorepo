import { describe, expect, it } from "vitest";
import { priceProductForCustomerType, resolveCustomPricedLine, type CategoryPricingRule } from "../pricing-rules";

const product = { categoryId: "paper", price: 10000, unit: "rim", hargaAgen: 7000, hargaDinas: 6000 };
const rule: CategoryPricingRule = { id: "r", categoryId: "paper", customerType: "ALL", mode: "FLAT_DISCOUNT", value: 1000, isActive: true };

describe("pengaturan Harga Khusus", () => {
  it.each([
    { customerType: "AGEN", expected: 7000, ruleId: "harga-agen" },
    { customerType: "PEMERINTAH", expected: 6000, ruleId: "harga-dinas" },
  ] as const)("preserves the $customerType product price when special rules are disabled", ({ customerType, expected, ruleId }) => {
    expect(priceProductForCustomerType(product, customerType, [rule], "SPECIAL", false)).toMatchObject({
      unitPrice: expected,
      appliedPricing: { ruleId },
    });
  });

  it.each([undefined, null, 0])("uses the regular price for missing member price %s when special rules are disabled", (memberPrice) => {
    for (const customerType of ["AGEN", "PEMERINTAH"] as const) {
      expect(priceProductForCustomerType({ ...product, hargaAgen: memberPrice, hargaDinas: memberPrice }, customerType, [rule], "SPECIAL", false)).toEqual({ unitPrice: 10000, appliedPricing: null });
    }
  });

  it("ignores submitted manual special prices when disabled", () => {
    expect(resolveCustomPricedLine({ pricedLine: { unitPrice: 10000, appliedPricing: null }, submittedPrice: 2000, role: "OWNER", customerType: "INDUSTRI", specialPricingEnabled: false })).toMatchObject({ unitPrice: 10000, manualOverrideApplied: false });
  });
});
