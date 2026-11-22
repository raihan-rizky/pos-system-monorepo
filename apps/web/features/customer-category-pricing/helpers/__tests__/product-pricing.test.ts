import { describe, expect, it } from "vitest";
import type { Product } from "@/hooks/useProducts";
import { priceCatalogProductForCustomer, priceCatalogVariantForCustomer } from "../product-pricing";

const product = {
  id: "rim", name: "Kertas", unit: "rim", price: 10000,
  costPrice: 9000, baseCostPrice: 700, baseCostUnit: "pcs",
  category: { id: "paper", name: "Kertas" },
  variants: [
    { id: "rim", unit: "rim", price: 10000, costPrice: 9000, baseCostPrice: 700, baseCostUnit: "pcs", brandId: "a" },
    { id: "pcs", unit: "pcs", price: 1000, costPrice: 700, baseCostPrice: 700, baseCostUnit: "pcs", brandId: "a" },
  ],
} as Product;
const rules = [{ id: "special", categoryId: "paper", customerType: "ALL" as const, customerTypes: ["UMUM", "AGEN"] as const, unit: "rim", brandId: "a", mode: "COST_PLUS_FLAT" as const, value: 4000, isActive: true }];

describe("catalog price projection", () => {
  it("prices each variant according to its own subcategory", () => {
    const variant = { ...product.variants![0], catalogSubcategoryId: "print", catalogSubcategory: { id: "print", group: "PERCETAKAN" as const, name: "PRINT", legacyCategoryId: null } };
    const scoped = [{ id: "print-rule", scope: "SUBCATEGORY" as const, categoryId: "print", customerType: "ALL" as const, mode: "PERCENT_DISCOUNT" as const, value: 20, isActive: true }];
    expect(priceCatalogVariantForCustomer(product, variant, "UMUM", scoped, { enabled: false, increment: 500, threshold: 50 }).unitPrice).toBe(8000);
  });
  it("prices each unit using its own scope while retaining the original catalog price", () => {
    const projected = priceCatalogProductForCustomer({ ...product, brandId: "a" }, "UMUM", rules.map(r => ({ ...r, customerTypes: [...r.customerTypes] })));
    expect(projected.displayPrice).toBe(5000);
    expect(projected.priceRounding?.originalPrice).toBe(4700);
    expect(projected.price).toBe(10000);
    expect(projected.variants?.[0].displayPrice).toBe(5000);
    expect(projected.variants?.[1].displayPrice).toBe(1000);
  });
  it("does not use another variant's brand or modal for a chosen variant", () => {
    const priced = priceCatalogVariantForCustomer(product, { ...product.variants![0], brandId: "b" }, "UMUM", rules.map(r => ({ ...r, customerTypes: [...r.customerTypes] })));
    expect(priced.unitPrice).toBe(10000);
    expect(priced.appliedPricing).toBeNull();
  });
  it("uses the selected customer and allows ordering by projected price", () => {
    const priced = priceCatalogProductForCustomer({ ...product, brandId: "a" }, "INDUSTRI", rules.map(r => ({ ...r, customerTypes: [...r.customerTypes] })));
    expect(priced.displayPrice).toBe(10000);
  });
});
