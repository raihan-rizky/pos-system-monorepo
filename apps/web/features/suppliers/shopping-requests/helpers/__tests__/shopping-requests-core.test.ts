import { describe, expect, it } from "vitest";
import {
  buildShoppingRequestNumber,
  defaultApprovedQty,
  sanitizeShoppingRequestItems,
} from "../shopping-requests-core";

describe("buildShoppingRequestNumber", () => {
  it("uses DPB-YYYYMM-XXX format with zero-padded sequence", () => {
    expect(buildShoppingRequestNumber(new Date("2026-06-19T10:00:00.000Z"), 1)).toBe(
      "DPB-202606-001",
    );
    expect(buildShoppingRequestNumber(new Date("2026-06-19T10:00:00.000Z"), 12)).toBe(
      "DPB-202606-012",
    );
  });
});

describe("sanitizeShoppingRequestItems", () => {
  it("removes items with non-positive requestedQty and dedupes by productId keeping last", () => {
    const sanitized = sanitizeShoppingRequestItems([
      { productId: "p1", requestedQty: 5 },
      { productId: "p2", requestedQty: 0 },
      { productId: "p3", requestedQty: -1 },
      { productId: "p1", requestedQty: 8 },
    ]);

    expect(sanitized).toEqual([{ productId: "p1", requestedQty: 8 }]);
  });
});

describe("defaultApprovedQty", () => {
  it("returns the requestedQty unchanged", () => {
    expect(defaultApprovedQty(7)).toBe(7);
    expect(defaultApprovedQty(0.5)).toBe(0.5);
  });
});
