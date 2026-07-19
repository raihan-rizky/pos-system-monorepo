import { describe, expect, it } from "vitest";
import {
  buildShoppingRequestNumber,
  defaultShoppingRequestStockMode,
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
      { productId: "p1", requestedQty: 5, stockMode: "PRODUCT_ONLY" },
      { productId: "p2", requestedQty: 0, stockMode: "PRODUCT_ONLY" },
      { productId: "p3", requestedQty: -1, stockMode: "GROUP_STOCK" },
      { productId: "p1", requestedQty: 8, stockMode: "GROUP_STOCK" },
    ]);

    expect(sanitized).toEqual([
      { productId: "p1", requestedQty: 8, stockMode: "GROUP_STOCK" },
    ]);
  });
});

describe("defaultShoppingRequestStockMode", () => {
  it("uses Stok Bersama for grouped products and Stok Produk Ini otherwise", () => {
    expect(defaultShoppingRequestStockMode("group-1")).toBe("GROUP_STOCK");
    expect(defaultShoppingRequestStockMode(null)).toBe("PRODUCT_ONLY");
    expect(defaultShoppingRequestStockMode(undefined)).toBe("PRODUCT_ONLY");
  });
});

describe("defaultApprovedQty", () => {
  it("requires Jumlah yang Di-ACC to be filled explicitly", () => {
    expect(defaultApprovedQty(7)).toBeNull();
    expect(defaultApprovedQty(0.5)).toBeNull();
  });
});
