import { describe, expect, it } from "vitest";
import {
  CUSTOMER_TYPES,
  isSpecialCategoryPricing,
  priceProductForCustomerType,
  type CategoryPricingRule,
  type PriceableProduct,
} from "../pricing-rules";
import {
  buildPosCartPriceUpdate,
  buildPriceChangePayload,
} from "@/features/product-price-change/helpers/price-change-form";

const product: PriceableProduct = {
  categoryId: "pens",
  brandId: "snowman",
  unit: "pcs",
  price: 10000,
  costPrice: 7000,
  baseCostPrice: 7000,
  baseCostUnit: "pcs",
};

const memberTypes = [
  { customerType: "AGEN", field: "hargaAgen", ruleId: "harga-agen" },
  { customerType: "PEMERINTAH", field: "hargaDinas", ruleId: "harga-dinas" },
] as const;

const rule: CategoryPricingRule = {
  id: "pens-discount",
  categoryId: "pens",
  customerType: "ALL",
  mode: "PERCENT_DISCOUNT",
  value: 10,
  isActive: true,
};

describe.each(memberTypes)("$customerType legacy defaults and overrides", ({ customerType, field, ruleId }) => {
  it.each([undefined, null, 0])("follows every new selling price for a legacy value of %s", (legacyPrice) => {
    for (const price of [10000, 12000, 8000]) {
      const result = priceProductForCustomerType({ ...product, price, [field]: legacyPrice }, customerType, []);
      expect(result).toEqual({ unitPrice: price, appliedPricing: null });
      expect(isSpecialCategoryPricing(result.appliedPricing)).toBe(false);
    }
  });

  it.each([9000, 11000])("preserves the explicit price %s after selling price changes and marks it special", (override) => {
    for (const price of [10000, 12000]) {
      const result = priceProductForCustomerType({ ...product, price, [field]: override }, customerType, []);
      expect(result.unitPrice).toBe(override);
      expect(result.appliedPricing?.ruleId).toBe(ruleId);
      expect(isSpecialCategoryPricing(result.appliedPricing)).toBe(true);
    }
  });

  it("preserves a legacy positive price equal to the original selling price", () => {
    for (const price of [10000, 12000]) {
      const result = priceProductForCustomerType({ ...product, price, [field]: 10000 }, customerType, []);
      expect(result.unitPrice).toBe(10000);
      expect(isSpecialCategoryPricing(result.appliedPricing)).toBe(true);
    }
  });

  it("uses an applicable special rule ahead of the member override", () => {
    const result = priceProductForCustomerType({ ...product, [field]: 8000 }, customerType, [rule]);
    expect(result.unitPrice).toBe(9000);
    expect(result.appliedPricing?.ruleId).toBe(rule.id);
    expect(isSpecialCategoryPricing(result.appliedPricing)).toBe(true);
  });

  it.each([
    { reason: "inactive", change: { isActive: false } },
    { reason: "other category", change: { categoryId: "paper" } },
    { reason: "other unit", change: { unit: "pack" } },
    { reason: "other brand", change: { brandId: "other" } },
    { reason: "other customer", change: { customerType: "INDUSTRI" as const } },
    { reason: "unavailable cost formula", change: { mode: "COST_PLUS_FLAT" as const } },
  ])("falls back correctly when the rule has $reason", ({ change }) => {
    const scopedRule = { ...rule, ...change };
    const noCost = { ...product, baseCostPrice: null };
    const overridden = priceProductForCustomerType({ ...noCost, [field]: 8500 }, customerType, [scopedRule]);
    expect(overridden.unitPrice).toBe(8500);
    expect(overridden.appliedPricing?.ruleId).toBe(ruleId);
    expect(isSpecialCategoryPricing(overridden.appliedPricing)).toBe(true);
    expect(priceProductForCustomerType(noCost, customerType, [scopedRule])).toEqual({ unitPrice: 10000, appliedPricing: null });
  });
});

describe("member price isolation", () => {
  it.each(CUSTOMER_TYPES)("selects the correct price for %s without mixing Agen and Dinas", (customerType) => {
    const result = priceProductForCustomerType({ ...product, hargaAgen: 9000, hargaDinas: 11000 }, customerType, []);
    expect(result.unitPrice).toBe(customerType === "AGEN" ? 9000 : customerType === "PEMERINTAH" ? 11000 : 10000);
    expect(isSpecialCategoryPricing(result.appliedPricing)).toBe(customerType === "AGEN" || customerType === "PEMERINTAH");
  });

  it("uses the price of each unit when the automatic group prices change", () => {
    for (const [unit, price] of [["pcs", 1200], ["pack", 12960]] as const) {
      for (const { customerType } of memberTypes) {
        expect(priceProductForCustomerType({ ...product, unit, price }, customerType, [])).toEqual({ unitPrice: price, appliedPricing: null });
      }
    }
  });

  it("does not leak an Agen override to Dinas or a different unit", () => {
    expect(priceProductForCustomerType({ ...product, hargaAgen: 9000 }, "PEMERINTAH", []).unitPrice).toBe(10000);
    expect(priceProductForCustomerType({ ...product, unit: "pack", price: 108000 }, "AGEN", [])).toEqual({ unitPrice: 108000, appliedPricing: null });
  });
});

const priceDraft = {
  productId: "pen", currentPrice: 10000, currentCostPrice: 7000,
  currentHargaAgen: 9000, currentHargaDinas: 11000,
  nextPrice: "10000", nextCostPrice: "7000",
  nextHargaAgen: "9000", nextHargaDinas: "11000", note: "",
};

describe("saving member prices and resets", () => {
  it.each([
    { draft: { nextHargaAgen: "" }, expected: { hargaAgen: null } },
    { draft: { nextHargaDinas: "" }, expected: { hargaDinas: null } },
    { draft: { nextHargaAgen: "", nextHargaDinas: "" }, expected: { hargaAgen: null, hargaDinas: null } },
  ])("resets only the selected overrides: $expected", ({ draft, expected }) => {
    expect(buildPriceChangePayload({ ...priceDraft, ...draft })).toEqual({ id: "pen", ...expected, priceChangeNote: undefined });
  });

  it("saves an explicit price equal to selling price without fixing the other default", () => {
    expect(buildPriceChangePayload({ ...priceDraft, currentHargaAgen: null, currentHargaDinas: null, nextHargaAgen: "10000", nextHargaDinas: "" })).toEqual({ id: "pen", hargaAgen: 10000, priceChangeNote: undefined });
  });

  it("changes selling price without copying it into empty member fields", () => {
    expect(buildPriceChangePayload({ ...priceDraft, currentHargaAgen: null, currentHargaDinas: null, nextPrice: "12000", nextHargaAgen: "", nextHargaDinas: "" })).toEqual({ id: "pen", price: 12000, priceChangeNote: undefined });
  });

  it("normalizes legacy zero prices to following mode without changing selling price", () => {
    expect(buildPriceChangePayload({ ...priceDraft, currentHargaAgen: 0, currentHargaDinas: 0, nextHargaAgen: "", nextHargaDinas: "" })).toEqual({ id: "pen", hargaAgen: null, hargaDinas: null, priceChangeNote: undefined });
  });

  it("does not write a master update when both following prices remain unchanged", () => {
    expect(buildPriceChangePayload({ ...priceDraft, currentHargaAgen: null, currentHargaDinas: null, nextHargaAgen: "", nextHargaDinas: "" })).toBeNull();
  });

  it("keeps a POS transaction-only price separate from member defaults", () => {
    expect(buildPosCartPriceUpdate({ ...priceDraft, currentHargaAgen: null, currentHargaDinas: null, nextHargaAgen: "", nextHargaDinas: "", transactionPrice: "9500" })).toEqual({ masterUpdate: null, transactionPrice: 9500 });
  });

  it("resets a Dinas override without clearing the Agen override or transaction price", () => {
    expect(buildPosCartPriceUpdate({ ...priceDraft, nextHargaDinas: "", transactionPrice: "9500" })).toEqual({ masterUpdate: { id: "pen", hargaDinas: null, priceChangeNote: undefined }, transactionPrice: 9500 });
  });
});
