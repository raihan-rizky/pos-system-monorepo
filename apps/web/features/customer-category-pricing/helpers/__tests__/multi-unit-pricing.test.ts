import { describe, expect, it, vi } from "vitest";
import { applyCategoryPricingRule, findMatchingCategoryPricingRule, type CategoryPricingRule } from "../pricing-rules";
import { hasOverlappingPricingRule, pricingRuleSchema } from "../rule-persistence";

const rule = {
  id: "selected", categoryId: "paper", customerType: "ALL", isActive: true,
  mode: "FLAT_DISCOUNT", value: 500, unit: null, units: ["rim", "box"],
} as CategoryPricingRule & { units: string[] };

describe("pricing rules for multiple units", () => {
  it("matches each selected unit and leaves other units to the all-unit rule", () => {
    const all = { ...rule, id: "all", units: [] };
    for (const unit of [" RIM ", "box"]) {
      expect(findMatchingCategoryPricingRule([all, rule], { categoryId: "paper", customerType: "UMUM", unit })?.id).toBe("selected");
    }
    expect(findMatchingCategoryPricingRule([all, rule], { categoryId: "paper", customerType: "UMUM", unit: "pcs" })?.id).toBe("all");
  });

  it("continues to honor legacy single-unit rules", () => {
    const legacy = { ...rule, units: undefined, unit: "rim" };
    expect(findMatchingCategoryPricingRule([legacy], { categoryId: "paper", customerType: "UMUM", unit: "rim" })?.id).toBe("selected");
    expect(findMatchingCategoryPricingRule([legacy], { categoryId: "paper", customerType: "UMUM", unit: "box" })).toBeNull();
  });

  it("does not directly apply a multi-unit rule to an unselected unit", () => {
    const product = { categoryId: "paper", price: 10000, unit: "pcs" };
    expect(applyCategoryPricingRule(product, "UMUM", rule).appliedPricing).toBeNull();
    expect(applyCategoryPricingRule({ ...product, unit: "rim" }, "UMUM", rule).unitPrice).toBe(9500);
  });

  it("accepts and preserves selected units in the rule payload", () => {
    const parsed = pricingRuleSchema.parse({ categoryId: "paper", customerTypes: ["ALL"], mode: "FLAT_DISCOUNT", value: 500, units: ["rim", "box"] });
    expect(parsed).toHaveProperty("units", ["rim", "box"]);
  });

  it("detects overlaps only when selected units intersect", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "other", customerType: null, customerTypes: [], unit: null, units: ["box", "pcs"] }]);
    const tx = { categoryCustomerPricingRule: { findMany } } as never;
    const scope = { storeId: "store", categoryId: "paper", customerTypes: [], unit: null, brandId: null };
    expect(await hasOverlappingPricingRule(tx, { ...scope, units: ["rim", "box"] } as never)).toBe(true);
    expect(await hasOverlappingPricingRule(tx, { ...scope, units: ["rim"] } as never)).toBe(false);
  });
});
