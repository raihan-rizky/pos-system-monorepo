import { describe, it, expect } from "vitest";
import { decrementProductStockInCache } from "../products-cache-update";

describe("decrementProductStockInCache", () => {
  const items = new Map<string, number>([
    ["p1", 2],
    ["p2", 5],
  ]);

  it("returns null/undefined caches unchanged", () => {
    expect(decrementProductStockInCache(undefined, items)).toBeUndefined();
    expect(decrementProductStockInCache(null, items)).toBeNull();
  });

  it("decrements stock when the cache value is a product array", () => {
    const cache = [
      { id: "p1", stock: 10 },
      { id: "p2", stock: 3 },
      { id: "p3", stock: 7 },
    ];

    const result = decrementProductStockInCache(cache, items);

    expect(result).toEqual([
      { id: "p1", stock: 8 },
      { id: "p2", stock: 0 },
      { id: "p3", stock: 7 },
    ]);
  });

  it("decrements stock inside a paginated ProductsResponse object", () => {
    const cache = {
      data: [
        { id: "p1", stock: 10 },
        { id: "p2", stock: 6 },
      ],
      pagination: { total: 2, page: 1, limit: 10, totalPages: 1 },
    };

    const result = decrementProductStockInCache(cache, items);

    expect(result).toEqual({
      data: [
        { id: "p1", stock: 8 },
        { id: "p2", stock: 1 },
      ],
      pagination: { total: 2, page: 1, limit: 10, totalPages: 1 },
    });
  });

  it("returns unrelated shapes (e.g. ProductStats) unchanged", () => {
    const stats = {
      totalProducts: 50,
      lowStock: 3,
      negativeStock: 0,
      inventoryValue: 100_000,
    };

    expect(decrementProductStockInCache(stats, items)).toBe(stats);
  });

  it("does not mutate the original array cache value", () => {
    const cache = [
      { id: "p1", stock: 10 },
      { id: "p2", stock: 6 },
    ];
    const snapshot = JSON.parse(JSON.stringify(cache));

    decrementProductStockInCache(cache, items);

    expect(cache).toEqual(snapshot);
  });

  it("does not mutate the original ProductsResponse cache value", () => {
    const cache = {
      data: [{ id: "p1", stock: 10 }],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
    };
    const snapshot = JSON.parse(JSON.stringify(cache));

    decrementProductStockInCache(cache, items);

    expect(cache).toEqual(snapshot);
  });
});
