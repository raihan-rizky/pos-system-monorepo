import { describe, expect, it } from "vitest";
import { createPricingTestDatabase } from "@/features/product-stock-groups/__tests__/pricing-test-database";
import { readGroupPricingInput } from "@/features/product-stock-groups/group-pricing-service";
import { expandImportGroupRows, projectImportGroupPricing } from "../import-group-pricing";

describe("coherent import group intent", () => {
  it("derives follower factor against final source in reversed order and rounds source first", async () => {
    const db = createPricingTestDatabase();
    const before = await readGroupPricingInput(db.tx, { storeId: "store-main", groupId: "group-1" });
    const result = projectImportGroupPricing(before, before, [
      { productId: "dus", price: 15.05, costPrice: 10.05 },
      { productId: "rim", price: 3.005, costPrice: 2.005 },
    ]);
    expect(result.projection.members.map(m => [m.productId, m.price, m.costPrice])).toEqual([
      ["dus", "15.05", "10.05"], ["rim", "3.01", "2.01"],
    ]);
    expect(result.projection.config.members.dus.factor).toEqual({ numerator: "1", denominator: "1" });
    expect(result.conflicts).toEqual([]);
  });

  it("reports contradictory HPP with the row identity and calculated value", async () => {
    const db = createPricingTestDatabase();
    const before = await readGroupPricingInput(db.tx, { storeId: "store-main", groupId: "group-1" });
    const result = projectImportGroupPricing(before, before, [
      { productId: "dus", rowNumber: 3, price: 270000, costPrice: 12 },
      { productId: "rim", rowNumber: 2, price: 60000, costPrice: 45000 },
    ]);
    expect(result.projection.members.find(m => m.productId === "dus")).toMatchObject({ price: "270000.00", costPrice: "225000.00" });
    expect(result.conflicts).toEqual([expect.objectContaining({ rowNumber: 3, field: "costPrice", expected: "225000.00" })]);
  });

  it("null/omitted follower HPP means follow source, whereas source null stays unknown", async () => {
    const db = createPricingTestDatabase();
    const before = await readGroupPricingInput(db.tx, { storeId: "store-main", groupId: "group-1" });
    const result = projectImportGroupPricing(before, before, [{ productId: "dus", price: 250000, costPrice: null }]);
    expect(result.projection.members.find(m => m.productId === "dus")?.costPrice).toBe("200000.00");
    expect(result.conflicts).toEqual([]);
    const missing = projectImportGroupPricing(before, before, [{ productId: "rim", price: 50000, costPrice: null }]);
    expect(missing.projection.members.find(m => m.productId === "rim")?.costPrice).toBeNull();
    expect(missing.projection.members.find(m => m.productId === "dus")?.costPrice).toBe("150000.00");
  });

  it("expands a single follower cursor through both old and target groups without unrelated rows", () => {
    const rows = [
      { cursorIndex: 0, keys: ["old:a", "new:b"] },
      { cursorIndex: 1, keys: ["old:c"] },
      { cursorIndex: 500, keys: ["old:a"] },
      { cursorIndex: 999, keys: ["new:b"] },
    ];
    expect(expandImportGroupRows(rows, 500, 1).map(r => r.cursorIndex)).toEqual([0, 500, 999]);
  });
});
