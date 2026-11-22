import { describe, expect, it } from "vitest";
import { priceProductForCustomerType, type CategoryPricingRule, type PriceableProduct } from "../pricing-rules";

const product: PriceableProduct = { categoryId: "legacy", price: 10000, unit: "pcs" };
const legacy: CategoryPricingRule = { id: "legacy-rule", categoryId: "legacy", customerType: "ALL", mode: "FLAT_DISCOUNT", value: 1000, isActive: true };
const target = { ...legacy, id: "target-rule", categoryId: "atk-print", scope: "SUBCATEGORY", value: 3000 } as CategoryPricingRule;
const sameNameOtherParent = { ...target, id: "other-rule", categoryId: "print-print", value: 5000 } as CategoryPricingRule;

describe("harga subkategori produk", () => {
  it("uses legacy pricing before classification", () => {
    expect(priceProductForCustomerType(product, "UMUM", [legacy, target]).unitPrice).toBe(9000);
  });
  it("prefers the destination id over legacy and a same-named subcategory in another parent", () => {
    expect(priceProductForCustomerType({ ...product, catalogSubcategoryId: "atk-print", catalogSubcategoryLegacyCategoryId: "legacy" }, "UMUM", [legacy, sameNameOtherParent, target]).unitPrice).toBe(7000);
  });
  it("uses the mapped destination legacy category if no scoped rule matches", () => {
    expect(priceProductForCustomerType({ ...product, catalogSubcategoryId: "atk-print", catalogSubcategoryLegacyCategoryId: "legacy" }, "UMUM", [legacy]).unitPrice).toBe(9000);
  });
  it("does not apply the source category after moving to an unmapped destination", () => {
    expect(priceProductForCustomerType({ ...product, catalogSubcategoryId: "print-print", catalogSubcategoryLegacyCategoryId: null }, "UMUM", [legacy]).unitPrice).toBe(10000);
  });
  it("preserves member price priority", () => {
    expect(priceProductForCustomerType({ ...product, hargaAgen: 6500, catalogSubcategoryId: "atk-print", catalogSubcategoryLegacyCategoryId: "legacy" }, "AGEN", [legacy, target]).unitPrice).toBe(6500);
  });
});
