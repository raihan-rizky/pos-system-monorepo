import { describe, expect, it } from "vitest";
import { normalizeServerPricingRules } from "../pricing-rule-loader";

describe("aturan harga server", () => {
  it("keeps category and same-named subcategory identities separate", () => {
    const common = { customerType: null, customerTypes: [], unit: null, units: [], brandId: null, brand: null, mode: "FLAT_DISCOUNT" as const, value: 100, discountPercent: 0, isActive: true, updatedAt: new Date() };
    const rules = normalizeServerPricingRules([
      { ...common, id: "old", categoryId: "old-cat", category: { name: "PRINT" } },
    ], [
      { ...common, id: "new", subcategoryId: "print-id", subcategory: { group: "PERCETAKAN", name: "PRINT" } },
    ]);
    expect(rules).toMatchObject([
      { id: "old", categoryId: "old-cat", scope: "CATEGORY" },
      { id: "new", categoryId: "print-id", categoryName: "PERCETAKAN / PRINT", scope: "SUBCATEGORY" },
    ]);
  });
});
