import { describe, expect, it } from "vitest";
import { priceProductForCustomerType, type CategoryPricingRule, type PriceableProduct } from "../pricing-rules";
import { previewPricingForm, validatePricingForm, type PricingPreviewProduct } from "../pricing-form";
import { pricingRuleSchema, serializePricingRule } from "../rule-persistence";

const rule: CategoryPricingRule = { id: "sequential", categoryId: "paper", unit: "dus", customerType: "ALL", mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT", value: 10, discountPercent: 5, isActive: true };
const product: PriceableProduct = { categoryId: "paper", unit: "dus", price: 16200, costPrice: 12000, baseCostPrice: 1000, baseCostUnit: "pcs" };
const form = { categoryId: "paper", unit: "dus", brandId: "", customerTypes: ["ALL"] as const, mode: rule.mode, value: "10", discountPercent: "5", isActive: true };
const previewProduct: PricingPreviewProduct = { id: "box", name: "Barang", unit: "dus", price: 16200, costPrice: 12000, brandId: null, baseCostPrice: null, baseCostUnit: null };

describe("selected unit modal plus percent then minus percent", () => {
  it("uses selected unit modal and discounts the marked-up result", () => {
    const result = priceProductForCustomerType(product, "UMUM", [rule]);
    expect(result.unitPrice).toBe(12540);
    expect(result.appliedPricing).toMatchObject({ discountPercent: 5 });
  });
  it.each([null, undefined, NaN, -1])("falls back when selected unit modal is unavailable: %s", (costPrice) => {
    expect(priceProductForCustomerType({ ...product, costPrice }, "UMUM", [rule]).appliedPricing).toBeNull();
  });
  it.each([-1, 101, NaN, Infinity])("rejects an invalid second percentage: %s", (discountPercent) => {
    expect(priceProductForCustomerType(product, "UMUM", [{ ...rule, discountPercent }]).appliedPricing).toBeNull();
  });
  it("previews the same price using the selected unit modal without requiring smallest-unit modal", () => {
    expect(previewPricingForm(form, previewProduct))
      .toEqual({ price: 12540, missingBaseCost: false });
  });
  it("requires the second percentage and validates its upper boundary", () => {
    expect(validatePricingForm({ ...form, discountPercent: "" })).toHaveProperty("discountPercent");
    expect(validatePricingForm({ ...form, discountPercent: "101" })).toHaveProperty("discountPercent");
    expect(validatePricingForm({ ...form, discountPercent: "0" })).toEqual({});
  });
  it("accepts and serializes both percentages for persistence", () => {
    const parsed = pricingRuleSchema.safeParse({ ...rule, customerTypes: ["ALL"] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ value: 10, discountPercent: 5 });
    expect(serializePricingRule({ customerType: null, value: "10", discountPercent: "5" })).toMatchObject({ value: 10, discountPercent: 5 });
  });
  it("rejects a missing discount on create instead of saving an incomplete formula", () => {
    expect(pricingRuleSchema.safeParse({ ...rule, discountPercent: undefined }).success).toBe(false);
  });

  it.each([
    { cost: 12000, markup: 0, discount: 0, price: 12000 },
    { cost: 12000, markup: 35, discount: 0, price: 16200 },
    { cost: 12000, markup: 10, discount: 100, price: 0 },
    { cost: 0, markup: 35, discount: 5, price: 0 },
    { cost: 99.99, markup: 12.5, discount: 2.5, price: 109.68 },
    { cost: 12000, markup: 150, discount: 20, price: 24000 },
  ])("agrees across engine and preview for cost $cost +$markup% −$discount%", ({ cost, markup, discount, price }) => {
    const priced = priceProductForCustomerType({ ...product, costPrice: cost }, "UMUM", [
      { ...rule, value: markup, discountPercent: discount },
    ]);
    expect(priced.unitPrice).toBe(price);
    expect(priced.appliedPricing).toMatchObject({ ruleId: "sequential", value: markup, discountPercent: discount });
    expect(previewPricingForm({ ...form, value: String(markup), discountPercent: String(discount) }, { ...previewProduct, costPrice: cost }))
      .toEqual({ price, missingBaseCost: false });
  });

  it.each([-1, NaN, Infinity, -Infinity])("rejects invalid markup %s", (value) => {
    expect(priceProductForCustomerType(product, "UMUM", [{ ...rule, value }]))
      .toMatchObject({ unitPrice: 16200, appliedPricing: null });
  });

  it("falls back when otherwise finite inputs overflow the price calculation", () => {
    expect(priceProductForCustomerType({ ...product, costPrice: 1e308 }, "UMUM", [{ ...rule, value: 1e308 }]))
      .toMatchObject({ unitPrice: 16200, appliedPricing: null });
  });

  it("falls back to the applicable member price when selected-unit modal is missing", () => {
    expect(priceProductForCustomerType({ ...product, costPrice: null, hargaAgen: 14000 }, "AGEN", [rule]))
      .toMatchObject({ unitPrice: 14000, appliedPricing: { ruleId: "harga-agen" } });
  });

  it.each<Partial<CategoryPricingRule>>([
    { isActive: false }, { categoryId: "other" }, { unit: "pcs" },
    { customerType: "AGEN" }, { brandId: "other-brand" },
  ])("does not apply outside the rule scope: %j", (override) => {
    expect(priceProductForCustomerType(product, "UMUM", [{ ...rule, ...override }]))
      .toMatchObject({ unitPrice: 16200, appliedPricing: null });
  });

  it.each([
    { mode: "COST_PLUS_FLAT" as const, value: 4000, price: 5000 },
    { mode: "COST_PLUS_PERCENT" as const, value: 10, price: 1100 },
  ])("keeps $mode based on smallest-unit modal and ignores the second percentage", ({ mode, value, price }) => {
    const priced = priceProductForCustomerType(product, "UMUM", [{ ...rule, mode, value, discountPercent: 100 }]);
    expect(priced.unitPrice).toBe(price);
    expect(priced.appliedPricing).not.toHaveProperty("discountPercent");
  });

  it.each([null, "5", true, -0.01, 100.01, NaN, Infinity])("rejects malformed/out-of-range persisted discount %j", (discountPercent) => {
    expect(pricingRuleSchema.safeParse({ ...rule, discountPercent }).success).toBe(false);
  });

  it.each([0, 100])("accepts persisted discount boundary %s", (discountPercent) => {
    expect(pricingRuleSchema.safeParse({ ...rule, value: 0, discountPercent }).success).toBe(true);
  });
});
