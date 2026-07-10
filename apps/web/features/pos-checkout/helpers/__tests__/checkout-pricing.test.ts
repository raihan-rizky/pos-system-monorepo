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

  it("keeps Harga Agen ahead of scoped Harga Khusus rules", () => {
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
      manualPrices: {},
      role: "CASHIER",
    });

    expect(priced.price).toBe(9500);
    if (priced.lineType !== "PRODUCT") {
      throw new Error("Expected priced cart item to be a product line");
    }
    expect(priced.appliedPricing).toEqual(
      expect.objectContaining({
        ruleId: "harga-agen",
        originalUnitPrice: 10000,
        appliedUnitPrice: 9500,
      }),
    );
  });
});
