import { describe, it, expect } from "vitest";
import { buildStockDecrementParams } from "../stock-decrement";

describe("buildStockDecrementParams", () => {
  it("returns empty values for an empty cart", () => {
    expect(buildStockDecrementParams([], "store-1")).toEqual({
      values: [],
      storeId: "store-1",
      expectedRowCount: 0,
    });
  });

  it("returns one tuple per unique productId in first-seen order", () => {
    const result = buildStockDecrementParams(
      [
        { productId: "p1", quantity: 1 },
        { productId: "p2", quantity: 4 },
      ],
      "store-1",
    );

    expect(result.values).toEqual([
      ["p1", 1],
      ["p2", 4],
    ]);
    expect(result.expectedRowCount).toBe(2);
    expect(result.storeId).toBe("store-1");
  });

  it("merges duplicate cart lines for the same productId by summing quantity", () => {
    const result = buildStockDecrementParams(
      [
        { productId: "p1", quantity: 2 },
        { productId: "p2", quantity: 1 },
        { productId: "p1", quantity: 3 },
      ],
      "store-1",
    );

    expect(result.values).toEqual([
      ["p1", 5],
      ["p2", 1],
    ]);
    expect(result.expectedRowCount).toBe(2);
  });

  it("ignores items with non-positive, non-finite, or empty productId", () => {
    const result = buildStockDecrementParams(
      [
        { productId: "", quantity: 5 },
        { productId: "p1", quantity: 0 },
        { productId: "p2", quantity: -3 },
        { productId: "p3", quantity: Number.NaN },
        { productId: "p4", quantity: Number.POSITIVE_INFINITY },
        { productId: "p5", quantity: 2 },
      ],
      "store-1",
    );

    expect(result.values).toEqual([["p5", 2]]);
    expect(result.expectedRowCount).toBe(1);
  });

  it("propagates the provided storeId verbatim", () => {
    expect(
      buildStockDecrementParams(
        [{ productId: "p1", quantity: 1 }],
        "store-other",
      ).storeId,
    ).toBe("store-other");
  });
});
