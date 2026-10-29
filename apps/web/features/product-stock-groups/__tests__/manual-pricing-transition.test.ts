import { describe, expect, it } from "vitest";
import type { GroupPricingInput } from "../automatic-pricing";
import { previewGroupPricingSnapshot } from "../group-pricing-service";

const source = {
  id: "pcs", groupId: "g", storeId: "s", unit: "pcs", price: 1000,
  costPrice: 700, unitMultiplierToBase: 1, isActive: true, conversionNeedsReview: false,
};
const follower = {
  ...source, id: "box", unit: "box", price: 9000, costPrice: 6500, unitMultiplierToBase: 10,
};
const config = {
  sourceProductId: "pcs", revision: 1, initializationVersion: 1 as const,
  members: { pcs: { mode: "AUTO" as const, factor: { numerator: "1", denominator: "1" }, review: { price: [], costPrice: [] } } },
};

function input(members: typeof source[]): GroupPricingInput {
  return { groupId: "g", storeId: "s", baseUnit: "pcs", config: structuredClone(config), members: structuredClone(members) };
}

describe("peralihan harga satuan", () => {
  it("calculates a newly added Auto unit from the source without using its placeholder price", () => {
    const before = input([source]);
    const after = input([source, { ...follower, price: 1 }]);
    const result = previewGroupPricingSnapshot(before, after, { members: [{ productId: "box", mode: "AUTO" }] }).after;
    expect(result.members.find(member => member.productId === "box")).toMatchObject({ price: "10000.00", costPrice: "7000.00" });
    expect(result.config.members.box.factor).toEqual({ numerator: "1", denominator: "1" });
  });

  it("preserves an existing unit's selling price when it has no stored config and is switched to Auto", () => {
    const before = input([source, follower]);
    const result = previewGroupPricingSnapshot(before, before, { members: [{ productId: "box", mode: "AUTO" }] }).after;
    expect(result.members.find(member => member.productId === "box")).toMatchObject({ price: "9000.00", costPrice: "7000.00" });
    expect(result.config.members.box.factor).toEqual({ numerator: "9", denominator: "10" });
  });

  it("keeps a Manual unit's selling price and HPP when its source changes", () => {
    const before = input([source, follower]);
    const result = previewGroupPricingSnapshot(before, before, { members: [{ productId: "pcs", price: 1200, costPrice: 800 }] }).after;
    expect(result.config.members.box.mode).toBe("MANUAL");
    expect(result.members.find(member => member.productId === "box")).toMatchObject({ price: "9000.00", costPrice: "6500.00" });
  });
});
