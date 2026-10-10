import { describe, expect, it, vi } from "vitest";

const helpers = await import("../base-cost").catch(() => ({
  resolveProductBaseCost: undefined,
  loadProductBaseCosts: undefined,
}));
const rim = { id: "rim", storeId: "store", stockGroupId: "paper", unit: "rim", costPrice: 350000, stockGroup: { baseUnit: "pcs" } };
const pcs = { id: "pcs", storeId: "store", stockGroupId: "paper", unit: " PCS ", costPrice: 700, stockGroup: { baseUnit: "pcs" } };

describe("base-unit modal lookup", () => {
  it("uses the base-unit record directly, not rim cost or a different group's pcs", () => {
    expect(helpers.resolveProductBaseCost?.(rim, [pcs, { ...pcs, id: "other", stockGroupId: "other", costPrice: 900 }])).toEqual({ baseCostPrice: 700, baseCostUnit: "pcs" });
  });
  it("ignores another store and handles missing, ambiguous, or invalid base modal", () => {
    for (const candidates of [[], [{ ...pcs, storeId: "other" }], [pcs, { ...pcs, id: "duplicate" }], [{ ...pcs, costPrice: null }], [{ ...pcs, costPrice: Number.NaN }]]) {
      expect(helpers.resolveProductBaseCost?.(rim, candidates)).toEqual({ baseCostPrice: null, baseCostUnit: "pcs" });
    }
  });
  it("does not fall back to target cost when stock group metadata is missing", () => {
    expect(helpers.resolveProductBaseCost?.({ ...rim, stockGroup: undefined }, [pcs])).toEqual({ baseCostPrice: null, baseCostUnit: null });
  });
  it("uses standalone own cost and unit, preserving zero modal", () => {
    expect(helpers.resolveProductBaseCost?.({ id: "single", storeId: "store", unit: "pcs", costPrice: 0 }, [])).toEqual({ baseCostPrice: 0, baseCostUnit: "pcs" });
  });
  it("loads bases once across all groups, including ones outside the product page", async () => {
    const db = { product: { findMany: vi.fn().mockResolvedValue([pcs]) } };
    const result = await helpers.loadProductBaseCosts?.(db, [rim, { id: "single", storeId: "store", unit: "pcs", costPrice: 800 }]);
    expect(result?.get("rim")).toEqual({ baseCostPrice: 700, baseCostUnit: "pcs" });
    expect(result?.get("single")).toEqual({ baseCostPrice: 800, baseCostUnit: "pcs" });
    expect(db.product.findMany).toHaveBeenCalledTimes(1);
    expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ storeId: "store", stockGroupId: { in: ["paper"] } }] } }));
  });
});
