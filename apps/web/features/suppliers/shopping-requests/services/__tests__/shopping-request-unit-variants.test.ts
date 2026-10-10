import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({ db: { product: { findFirst, findMany } } }));

import { listShoppingRequestUnitVariants } from "../shopping-request-unit-variants";

describe("listShoppingRequestUnitVariants", () => {
  beforeEach(() => vi.clearAllMocks());
  it("loads only active variants from the product's store and stock group", async () => {
    findFirst.mockResolvedValueOnce({ id: "pcs", stockGroupId: "group-1" });
    findMany.mockResolvedValueOnce([{ id: "dus", unit: "dus", stock: 2, costPrice: { toString: () => "5000" } }]);

    const variants = await listShoppingRequestUnitVariants("pcs", "store-1");

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pcs", storeId: "store-1", isActive: true },
    }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store-1", stockGroupId: "group-1", isActive: true },
    }));
    expect(variants[0]).toMatchObject({ id: "dus", costPrice: 5000 });
  });

  it("returns no alternatives for an ungrouped product", async () => {
    findFirst.mockResolvedValueOnce({ id: "pcs", stockGroupId: null });
    await expect(listShoppingRequestUnitVariants("pcs", "store-1")).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
