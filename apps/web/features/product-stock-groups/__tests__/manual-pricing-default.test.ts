import { describe, expect, it } from "vitest";
import { initializeGroupPricing, projectGroupPricing, type GroupPricingInput } from "../automatic-pricing";
import { createUnitVariantDraft } from "@/lib/product-form/product-unit-variants";

describe("mode harga awal satuan", () => {
  it("starts a new product unit in manual mode", () => {
    expect(createUnitVariantDraft("new").pricingMode).toBe("MANUAL");
  });
  it("preserves existing prices and HPP when an old group is initialized and defaults followers to manual", () => {
    const input: GroupPricingInput = { groupId: "group", storeId: "store", baseUnit: "pcs", members: [
      { id: "pcs", groupId: "group", storeId: "store", unit: "pcs", price: 1000, costPrice: 800, unitMultiplierToBase: 1, isActive: true, conversionNeedsReview: false },
      { id: "box", groupId: "group", storeId: "store", unit: "box", price: 9000, costPrice: 6500, unitMultiplierToBase: 10, isActive: true, conversionNeedsReview: false },
    ] };
    const initial = initializeGroupPricing(input);
    expect(initial.config.members.box.mode).toBe("MANUAL");
    expect(initial.members[1]).toMatchObject({ price: "9000.00", costPrice: "6500.00" });
    input.members[0].price = 2000;
    input.members[0].costPrice = 1200;
    expect(projectGroupPricing({ ...input, config: initial.config }).members[1]).toMatchObject({ price: "9000.00", costPrice: "6500.00" });
  });
});
