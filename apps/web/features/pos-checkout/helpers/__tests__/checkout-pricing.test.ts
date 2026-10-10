import { describe, expect, it } from "vitest";
import type { CartItem } from "@/hooks/useCart";
import type { CustomerCategoryPricingRule } from "@/hooks/useCustomerCategoryPricingRules";
import { priceCartItemsForCheckout } from "../checkout-pricing";

const paperRim: CartItem = {
  cartLineId: "PRODUCT:paper-rim",
  lineType: "PRODUCT",
  productId: "paper-rim",
  name: "Kertas A4",
  price: 10000,
  catalogPrice: 10000,
  costPrice: 7000,
  hargaDinas: null,
  hargaAgen: null,
  quantity: 1,
  unit: "Rim",
  stock: 20,
  brandId: "brand-sinar-dunia",
  brandName: "Sinar Dunia",
  categoryId: "cat-paper",
  categoryName: "Kertas",
  appliedPricing: null,
};

const allPaperRimBrandRule: CustomerCategoryPricingRule = {
  id: "rule-all-paper-rim-brand",
  storeId: "store-1",
  categoryId: "cat-paper",
  customerType: "ALL",
  unit: "rim",
  brandId: "brand-sinar-dunia",
  mode: "PERCENT_DISCOUNT",
  value: 10,
  isActive: true,
  createdBy: null,
  updatedBy: null,
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z",
  category: {
    id: "cat-paper",
    name: "Kertas",
    icon: null,
    color: null,
  },
  brand: {
    id: "brand-sinar-dunia",
    name: "Sinar Dunia",
    normalizedName: "sinar dunia",
  },
};

describe("priceCartItemsForCheckout", () => {
  it("keeps rule metadata when a submitted manual price is not allowed", () => {
    const [priced] = priceCartItemsForCheckout({ items: [paperRim], customerType: "UMUM", pricingRules: [allPaperRimBrandRule], manualPrices: { [paperRim.cartLineId]: 6000 }, role: "SALES" });
    if (priced.lineType !== "PRODUCT") throw new Error("Expected product");
    expect(priced.price).toBe(9000);
    expect(priced.appliedPricing?.ruleId).toBe(allPaperRimBrandRule.id);
  });
  it("prices cart unit options with the same customer rules", () => {
    const [priced] = priceCartItemsForCheckout({
      items: [{ ...paperRim, unitOptions: [{ ...paperRim, baseCostPrice: 700, baseCostUnit: "pcs" }] }],
      customerType: "UMUM", pricingRules: [{ ...allPaperRimBrandRule, mode: "COST_PLUS_FLAT", value: 4000 }], manualPrices: {}, role: "SALES",
    });
    if (priced.lineType !== "PRODUCT") throw new Error("Expected product");
    expect(priced.unitOptions?.[0].price).toBe(4700);
    expect(priced.unitOptions?.[0].catalogPrice).toBe(10000);
  });
  it("uses smallest-unit modal directly for a selected rim and multiple customers", () => {
    const [priced] = priceCartItemsForCheckout({
      items: [{ ...paperRim, baseCostPrice: 700, baseCostUnit: "pcs", quantity: 2 }],
      customerType: "AGEN",
      pricingRules: [{ ...allPaperRimBrandRule, customerTypes: ["UMUM", "AGEN"], mode: "COST_PLUS_FLAT", value: 4000 }],
      manualPrices: {},
      role: "SALES",
    });
    expect(priced.price).toBe(4700);
    expect(priced.price * priced.quantity).toBe(9400);
    if (priced.lineType !== "PRODUCT") throw new Error("Expected product");
    expect(priced.appliedPricing?.ruleId).toBe(allPaperRimBrandRule.id);
  });

  it("does not classify a manual transaction price as an automatic special price", () => {
    const [priced] = priceCartItemsForCheckout({
      items: [{ ...paperRim, transactionPrice: 8000 }],
      customerType: "UMUM",
      pricingRules: [allPaperRimBrandRule],
      manualPrices: {},
      role: "SALES",
    });
    expect(priced.price).toBe(8000);
    if (priced.lineType !== "PRODUCT") throw new Error("Expected product");
    expect(priced.appliedPricing).toBeNull();
  });
  it("keeps a cart transaction price ahead of automatic customer pricing", () => {
    const [priced] = priceCartItemsForCheckout({
      items: [
        {
          ...paperRim,
          hargaAgen: 9500,
          transactionPrice: 8000,
        } as CartItem & { transactionPrice: number },
      ],
      customerType: "AGEN",
      pricingRules: [allPaperRimBrandRule],
      pricingPreference: "SPECIAL",
      manualPrices: {},
      role: "SALES",
    });

    expect(priced.price).toBe(8000);
  });

  it("applies ALL Harga Khusus rules scoped to category, unit, and brand", () => {
    const [priced] = priceCartItemsForCheckout({
      items: [paperRim],
      customerType: "UMUM",
      pricingRules: [allPaperRimBrandRule],
      pricingPreference: "SPECIAL",
      manualPrices: {},
      role: "CASHIER",
    });

    expect(priced).toEqual(
      expect.objectContaining({
        price: 9000,
        appliedPricing: expect.objectContaining({
          ruleId: "rule-all-paper-rim-brand",
          customerType: "UMUM",
          unit: "rim",
          brandId: "brand-sinar-dunia",
          brandName: "Sinar Dunia",
          originalUnitPrice: 10000,
          appliedUnitPrice: 9000,
        }),
      }),
    );
  });

  it("uses scoped Harga Khusus ahead of Harga Agen by default", () => {
    const [priced] = priceCartItemsForCheckout({
      items: [
        {
          ...paperRim,
          hargaAgen: 9500,
        },
      ],
      customerType: "AGEN",
      pricingRules: [
        {
          ...allPaperRimBrandRule,
          customerType: "ALL",
          value: 50,
        },
      ],
      pricingPreference: "SPECIAL",
      manualPrices: {},
      role: "CASHIER",
    });

    expect(priced.price).toBe(5000);
    if (priced.lineType !== "PRODUCT") {
      throw new Error("Expected priced cart item to be a product line");
    }
    expect(priced.appliedPricing).toEqual(
      expect.objectContaining({
        ruleId: "rule-all-paper-rim-brand",
        originalUnitPrice: 10000,
        appliedUnitPrice: 5000,
      }),
    );
  });

  it("keeps a matching Harga Khusus rule primary when legacy preference requests Harga Agen", () => {
    const [priced] = priceCartItemsForCheckout({
      items: [
        {
          ...paperRim,
          hargaAgen: 9500,
        },
      ],
      customerType: "AGEN",
      pricingRules: [
        {
          ...allPaperRimBrandRule,
          customerType: "ALL",
          value: 50,
        },
      ],
      pricingPreference: "MEMBER",
      manualPrices: {},
      role: "CASHIER",
    });

    expect(priced.price).toBe(5000);
    if (priced.lineType !== "PRODUCT") {
      throw new Error("Expected priced cart item to be a product line");
    }
    expect(priced.appliedPricing).toEqual(
      expect.objectContaining({
        ruleId: "rule-all-paper-rim-brand",
        originalUnitPrice: 10000,
        appliedUnitPrice: 5000,
      }),
    );
  });

  it("accepts the current checkout contract without a legacy preference", () => {
    const [priced] = priceCartItemsForCheckout({
      items: [paperRim],
      customerType: "UMUM",
      pricingRules: [allPaperRimBrandRule],
      manualPrices: {},
      role: "CASHIER",
    });

    expect(priced.price).toBe(9000);
  });

  it("keeps the member price as fallback when no special rule matches", () => {
    const [priced] = priceCartItemsForCheckout({
      items: [{ ...paperRim, hargaAgen: 9500 }],
      customerType: "AGEN",
      pricingRules: [],
      pricingPreference: "MEMBER",
      manualPrices: {},
      role: "CASHIER",
    });

    expect(priced.price).toBe(9500);
  });
});
