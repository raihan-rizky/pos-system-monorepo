import { describe, expect, it } from "vitest";
import {
  applyCategoryPricingRule,
  countProductsAtOrBelowFlatDiscount,
  findMatchingCategoryPricingRule,
  priceProductForCustomerType,
  calculateCustomPriceMargin,
  canEditCustomPriceForCustomer,
  resolveCustomPricedLine,
  resolveCheckoutCustomerType,
  type CategoryPricingRule,
} from "../pricing-rules";

const rules: CategoryPricingRule[] = [
  {
    id: "rule-flat",
    categoryId: "cat-paper",
    categoryName: "Kertas",
    customerType: "AGEN",
    mode: "FLAT_DISCOUNT",
    value: 2000,
    isActive: true,
  },
  {
    id: "rule-percent",
    categoryId: "cat-ink",
    categoryName: "Tinta",
    customerType: "PEMERINTAH",
    mode: "PERCENT_DISCOUNT",
    value: 12.5,
    isActive: true,
  },
];

describe("customer category pricing rules", () => {
  it("falls back to UMUM when no customer type is attached", () => {
    expect(resolveCheckoutCustomerType(null)).toBe("UMUM");
    expect(resolveCheckoutCustomerType(undefined)).toBe("UMUM");
    expect(resolveCheckoutCustomerType("AGEN")).toBe("AGEN");
  });

  it("finds only active matching customer type and category rules", () => {
    expect(
      findMatchingCategoryPricingRule(rules, {
        customerType: "AGEN",
        categoryId: "cat-paper",
      })?.id,
    ).toBe("rule-flat");
    expect(
      findMatchingCategoryPricingRule(rules, {
        customerType: "UMUM",
        categoryId: "cat-paper",
      }),
    ).toBeNull();
  });

  it("applies a flat discount rule", () => {
    const priced = priceProductForCustomerType(
      { categoryId: "cat-paper", categoryName: "Kertas", price: 12000 },
      "AGEN",
      rules,
    );

    expect(priced.unitPrice).toBe(10000);
    expect(priced.appliedPricing).toEqual(
      expect.objectContaining({
        ruleId: "rule-flat",
        mode: "FLAT_DISCOUNT",
        originalUnitPrice: 12000,
        appliedUnitPrice: 10000,
      }),
    );
  });

  it("applies a percent discount rule", () => {
    const priced = priceProductForCustomerType(
      { categoryId: "cat-ink", categoryName: "Tinta", price: 100000 },
      "PEMERINTAH",
      rules,
    );

    expect(priced.unitPrice).toBe(87500);
    expect(priced.appliedPricing).toEqual(
      expect.objectContaining({
        ruleId: "rule-percent",
        mode: "PERCENT_DISCOUNT",
        value: 12.5,
      }),
    );
  });

  it("uses product Harga Dinas for PEMERINTAH before category pricing", () => {
    const priced = priceProductForCustomerType(
      {
        categoryId: "cat-ink",
        categoryName: "Tinta",
        price: 100000,
        hargaDinas: 125000,
      },
      "PEMERINTAH",
      rules,
    );

    expect(priced.unitPrice).toBe(125000);
    expect(priced.appliedPricing).toEqual(
      expect.objectContaining({
        ruleId: "harga-dinas",
        customerType: "PEMERINTAH",
        originalUnitPrice: 100000,
        appliedUnitPrice: 125000,
      }),
    );
  });

  it("falls back to category pricing when Harga Dinas is empty", () => {
    const priced = priceProductForCustomerType(
      {
        categoryId: "cat-ink",
        categoryName: "Tinta",
        price: 100000,
        hargaDinas: null,
      },
      "PEMERINTAH",
      rules,
    );

    expect(priced.unitPrice).toBe(87500);
    expect(priced.appliedPricing?.ruleId).toBe("rule-percent");
  });

  it("keeps catalog price when rule does not match", () => {
    expect(
      applyCategoryPricingRule(
        { categoryId: "cat-paper", price: 12000 },
        "INDUSTRI",
        rules[0],
      ),
    ).toEqual({ unitPrice: 12000, appliedPricing: null });
  });

  it("counts active category products that would be zeroed by a flat discount", () => {
    expect(
      countProductsAtOrBelowFlatDiscount(
        [
          { price: 7000 },
          { price: 8000 },
          { price: 9000 },
          { price: 6000, isActive: false },
        ],
        8000,
      ),
    ).toBe(2);
  });

  it("calculates current and custom profit with margin percentages", () => {
    expect(
      calculateCustomPriceMargin({
        costPrice: 7000,
        catalogPrice: 10000,
        customPrice: 9000,
      }),
    ).toEqual({
      hasCostPrice: true,
      isChanged: true,
      isBelowCost: false,
      currentProfit: 3000,
      currentMarginPercent: 30,
      customProfit: 2000,
      customMarginPercent: 22.22,
    });
  });

  it("marks below-HPP custom prices as warning-only margin risk", () => {
    expect(
      calculateCustomPriceMargin({
        costPrice: 7000,
        catalogPrice: 10000,
        customPrice: 6000,
      }),
    ).toEqual(
      expect.objectContaining({
        hasCostPrice: true,
        isChanged: true,
        isBelowCost: true,
        customProfit: -1000,
        customMarginPercent: -16.67,
      }),
    );
  });

  it("does not invent margin when HPP is missing", () => {
    expect(
      calculateCustomPriceMargin({
        costPrice: null,
        catalogPrice: 10000,
        customPrice: 9000,
      }),
    ).toEqual({
      hasCostPrice: false,
      isChanged: true,
      isBelowCost: false,
      currentProfit: null,
      currentMarginPercent: null,
      customProfit: null,
      customMarginPercent: null,
    });
  });

  it("allows custom price editing only for authorized roles and eligible customer types", () => {
    expect(canEditCustomPriceForCustomer("OWNER", "INDUSTRI")).toBe(true);
    expect(canEditCustomPriceForCustomer("ADMIN", "PEMERINTAH")).toBe(true);
    expect(canEditCustomPriceForCustomer("CASHIER", "INDUSTRI")).toBe(true);
    expect(canEditCustomPriceForCustomer("SALES", "INDUSTRI")).toBe(false);
    expect(canEditCustomPriceForCustomer("OWNER", "AGEN")).toBe(false);
  });

  it("keeps authorized transaction-only manual custom price for INDUSTRI and preserves rule context", () => {
    const resolved = resolveCustomPricedLine({
      pricedLine: {
        unitPrice: 9000,
        appliedPricing: {
          ruleId: "rule-industri",
          customerType: "INDUSTRI",
          categoryId: "cat-paper",
          categoryName: "Kertas",
          mode: "PERCENT_DISCOUNT",
          value: 10,
          originalUnitPrice: 10000,
          appliedUnitPrice: 9000,
        },
      },
      submittedPrice: 8500,
      role: "CASHIER",
      customerType: "INDUSTRI",
    });

    expect(resolved.unitPrice).toBe(8500);
    expect(resolved.appliedPricing).toEqual(
      expect.objectContaining({
        ruleId: "rule-industri",
        originalUnitPrice: 10000,
        appliedUnitPrice: 8500,
      }),
    );
    expect(resolved.manualOverrideApplied).toBe(true);
  });

  it("ignores submitted product price when role or customer type is not eligible", () => {
    expect(
      resolveCustomPricedLine({
        pricedLine: { unitPrice: 10000, appliedPricing: null },
        submittedPrice: 8000,
        role: "SALES",
        customerType: "INDUSTRI",
      }),
    ).toEqual({
      unitPrice: 10000,
      appliedPricing: null,
      manualOverrideApplied: false,
    });

    expect(
      resolveCustomPricedLine({
        pricedLine: { unitPrice: 10000, appliedPricing: null },
        submittedPrice: 8000,
        role: "OWNER",
        customerType: "AGEN",
      }),
    ).toEqual({
      unitPrice: 10000,
      appliedPricing: null,
      manualOverrideApplied: false,
    });
  });
});
