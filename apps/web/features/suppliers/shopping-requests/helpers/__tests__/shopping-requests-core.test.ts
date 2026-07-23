import { describe, expect, it } from "vitest";
import {
  buildShoppingRequestNumber,
  defaultApprovedQty,
  getLargeUnitShoppingProducts,
  isLargeUnitShoppingProduct,
  sanitizeShoppingRequestItems,
} from "../shopping-requests-core";
import type { Product } from "@/hooks/useProducts";

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

    expect(sanitized).toEqual([
      { productId: "p1", requestedQty: 8 },
    ]);
  });
});

describe("defaultApprovedQty", () => {
  it("requires Jumlah yang Di-ACC to be filled explicitly", () => {
    expect(defaultApprovedQty(7)).toBeNull();
    expect(defaultApprovedQty(0.5)).toBeNull();
  });
});

describe("isLargeUnitShoppingProduct", () => {
  it("only accepts products whose unit contains more than one base unit", () => {
    expect(isLargeUnitShoppingProduct({ unitMultiplierToBase: 50 })).toBe(true);
    expect(isLargeUnitShoppingProduct({ unitMultiplierToBase: 1.01 })).toBe(true);
    expect(isLargeUnitShoppingProduct({ unitMultiplierToBase: 1 })).toBe(false);
    expect(isLargeUnitShoppingProduct({ unitMultiplierToBase: 0 })).toBe(false);
    expect(isLargeUnitShoppingProduct({ unitMultiplierToBase: undefined })).toBe(false);
    expect(isLargeUnitShoppingProduct({ unitMultiplierToBase: Number.NaN })).toBe(false);
  });
});

describe("getLargeUnitShoppingProducts", () => {
  it("exposes large variants when the grouped product defaults to a base unit", () => {
    const groupedProduct = {
      id: "paper-pcs",
      name: "Kertas A4",
      unit: "pcs",
      unitMultiplierToBase: 1,
      variants: [
        {
          id: "paper-pcs",
          unit: "pcs",
          unitMultiplierToBase: 1,
          price: 1_000,
          costPrice: 800,
          stock: 100,
          sku: "PAPER-PCS",
          hargaDinas: null,
          hargaAgen: null,
        },
        {
          id: "paper-dus",
          unit: "dus",
          unitMultiplierToBase: 50,
          price: 45_000,
          costPrice: 40_000,
          stock: 2,
          sku: "PAPER-DUS",
          hargaDinas: null,
          hargaAgen: null,
        },
      ],
    } as Product;

    expect(getLargeUnitShoppingProducts([groupedProduct])).toEqual([
      expect.objectContaining({
        id: "paper-dus",
        unit: "dus",
        unitMultiplierToBase: 50,
        sku: "PAPER-DUS",
      }),
    ]);
  });
});
