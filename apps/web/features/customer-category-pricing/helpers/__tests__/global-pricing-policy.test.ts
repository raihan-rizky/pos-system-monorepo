import { describe, expect, it } from "vitest";
import { priceProductForCustomerType, resolveCustomPricedLine, type CategoryPricingRule } from "../pricing-rules";

const product = { categoryId: "paper", price: 10000, unit: "rim", hargaAgen: 7000, hargaDinas: 6000 };
const rule: CategoryPricingRule = { id: "r", categoryId: "paper", customerType: "ALL", mode: "FLAT_DISCOUNT", value: 1000, isActive: true };

describe("pengaturan Harga Khusus", () => {
  it("uses the regular price when the feature is disabled, including member prices", () => {
    for (const customerType of ["AGEN", "PEMERINTAH"] as const) {
      expect(priceProductForCustomerType(product, customerType, [rule], "SPECIAL", false)).toEqual({ unitPrice: 10000, appliedPricing: null });
    }
  });

  it("ignores submitted manual special prices when disabled", () => {
    expect(resolveCustomPricedLine({ pricedLine: { unitPrice: 10000, appliedPricing: null }, submittedPrice: 2000, role: "OWNER", customerType: "INDUSTRI", specialPricingEnabled: false })).toMatchObject({ unitPrice: 10000, manualOverrideApplied: false });
  });
});
