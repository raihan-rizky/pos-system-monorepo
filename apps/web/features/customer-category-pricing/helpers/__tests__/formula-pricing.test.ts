import { describe, expect, it } from "vitest";
import * as pricing from "../pricing-rules";
import type { CategoryPricingRule, PriceableProduct } from "../pricing-rules";

const product = {
  categoryId: "paper", price: 6000, unit: "rim", hargaAgen: 5000,
  baseCostPrice: 700, baseCostUnit: "pcs",
} as PriceableProduct;
const formula = {
  id: "formula", categoryId: "paper", unit: "rim", customerType: "ALL",
  customerTypes: ["UMUM", "AGEN"], mode: "COST_PLUS_FLAT", value: 4000, isActive: true,
} as unknown as CategoryPricingRule;

describe("smallest-unit cost formulas", () => {
  it("adds 4000 directly to modal 700 for rim, so two rim cost 9400", () => {
    const priced = pricing.priceProductForCustomerType(product, "UMUM", [formula]);
    expect(priced.unitPrice).toBe(4700);
    expect(priced.unitPrice * 2).toBe(9400);
    expect(priced.appliedPricing?.ruleId).toBe("formula");
  });
  it("adds percentage directly to smallest-unit modal", () => {
    expect(pricing.priceProductForCustomerType(product, "UMUM", [
      { ...formula, mode: "COST_PLUS_PERCENT", value: 10 } as CategoryPricingRule,
    ]).unitPrice).toBe(770);
  });
  it("changes with current base modal and applies only to the targeted unit", () => {
    expect(pricing.priceProductForCustomerType({ ...product, baseCostPrice: 800 }, "UMUM", [formula]).unitPrice).toBe(4800);
    expect(pricing.priceProductForCustomerType({ ...product, unit: "pcs" }, "UMUM", [formula]).appliedPricing).toBeNull();
  });
  it.each([null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])("falls back to member price for invalid modal %s", (baseCostPrice) => {
    const priced = pricing.priceProductForCustomerType({ ...product, baseCostPrice }, "AGEN", [formula]);
    expect(priced.unitPrice).toBe(5000);
    expect(priced.appliedPricing?.ruleId).toBe("harga-agen");
  });
  it("does not use a modal without its base unit", () => {
    expect(pricing.priceProductForCustomerType({ ...product, baseCostUnit: null }, "UMUM", [formula]).appliedPricing).toBeNull();
  });
  it("accepts zero modal and zero markup, but rejects a nonfinite rule value", () => {
    expect(pricing.priceProductForCustomerType({ ...product, baseCostPrice: 0 }, "UMUM", [formula]).unitPrice).toBe(4000);
    expect(pricing.priceProductForCustomerType(product, "UMUM", [{ ...formula, value: 0 }]).unitPrice).toBe(700);
    expect(pricing.priceProductForCustomerType(product, "UMUM", [{ ...formula, value: Number.NaN }]).appliedPricing).toBeNull();
  });
});

describe("multiple customer targets", () => {
  it("applies to Umum and Agen only", () => {
    expect(pricing.priceProductForCustomerType(product, "UMUM", [formula]).appliedPricing?.ruleId).toBe("formula");
    expect(pricing.priceProductForCustomerType(product, "AGEN", [formula]).appliedPricing?.ruleId).toBe("formula");
    expect(pricing.priceProductForCustomerType(product, "INDUSTRI", [formula]).appliedPricing).toBeNull();
  });
  it("keeps explicit customer targets ahead of ALL fallback", () => {
    const all = { ...formula, id: "all", customerTypes: ["ALL"], value: 1000 } as CategoryPricingRule;
    expect(pricing.priceProductForCustomerType(product, "AGEN", [all, formula]).unitPrice).toBe(4700);
    expect(pricing.priceProductForCustomerType(product, "INDUSTRI", [all, formula]).unitPrice).toBe(1700);
  });
  it("preserves scalar legacy targeting, while empty database array means ALL", () => {
    const legacy = { ...formula, customerTypes: undefined, customerType: "AGEN" } as CategoryPricingRule;
    expect(pricing.priceProductForCustomerType(product, "UMUM", [legacy]).appliedPricing).toBeNull();
    expect(pricing.priceProductForCustomerType(product, "UMUM", [{ ...legacy, customerTypes: [] }]).unitPrice).toBe(4700);
  });
  it("rejects invalid mixed ALL targets", () => {
    expect(pricing.priceProductForCustomerType(product, "AGEN", [{ ...formula, customerTypes: ["ALL", "AGEN"] } as CategoryPricingRule]).appliedPricing?.ruleId).toBe("harga-agen");
  });
});

describe("special price source and labels", () => {
  it("marks real rules even when amount equals normal, and excludes member metadata", () => {
    const same = pricing.priceProductForCustomerType(product, "UMUM", [{ ...formula, value: 5300 }]);
    const member = pricing.priceProductForCustomerType(product, "AGEN", []);
    expect(pricing.isSpecialCategoryPricing?.(same.appliedPricing)).toBe(true);
    expect(pricing.isSpecialCategoryPricing?.(member.appliedPricing)).toBe(false);
    expect(pricing.isSpecialCategoryPricing?.(null)).toBe(false);
  });
  it("labels formulas clearly", () => {
    expect(pricing.formatPricingRuleLabel(formula)).toContain("Modal + Rp 4.000");
    expect(pricing.formatPricingRuleLabel({ ...formula, mode: "COST_PLUS_PERCENT", value: 10 } as CategoryPricingRule)).toContain("Modal + 10%");
  });
});
