import { describe, expect, it, vi } from "vitest";

import {
  calculateBaseQuantity,
  calculateDisplayStock,
  formatCompoundStock,
} from "../stock-display";
import { normalizeStockGroupKey } from "../stock-grouping";
import { applyProductStockDelta, StockMutationError } from "../stock-mutations";

describe("stock group helpers", () => {
  it("normalizes name/category/material/size into a stable group key", () => {
    expect(
      normalizeStockGroupKey({
        name: "  Kertas   HVS ",
        categoryId: "cat-paper",
        material: "  70 GSM ",
        size: " A4 ",
      }),
    ).toBe("kertas hvs|cat-paper|70 gsm|a4");
  });

  it("converts between base stock and display stock", () => {
    expect(calculateDisplayStock(500, 100)).toBe(5);
    expect(calculateBaseQuantity(2, 100)).toBe(200);
  });

  it("formats fractional grouped stock as whole unit plus base unit remainder", () => {
    expect(
      formatCompoundStock({
        stock: 0.97,
        unit: "dus",
        unitMultiplierToBase: 30,
        stockGroup: { baseUnit: "pcs" },
      }),
    ).toBe("0 dus 29 pcs");
    expect(
      formatCompoundStock({
        stock: 1.97,
        unit: "dus",
        unitMultiplierToBase: 30,
        stockGroup: { baseUnit: "pcs" },
      }),
    ).toBe("1 dus 29 pcs");
  });

  it("keeps ordinary stock display unchanged when conversion metadata is unavailable", () => {
    expect(formatCompoundStock({ stock: 0.97, unit: "dus" })).toBe("0.97 dus");
  });
});

describe("applyProductStockDelta", () => {
  it("mutates stock group baseStock for grouped products", async () => {
    const productFindFirst = vi.fn().mockResolvedValue({
      id: "rim",
      stock: 0,
      stockGroupId: "group-1",
      unitMultiplierToBase: 500,
      stockGroup: { id: "group-1", baseStock: 1000 },
    });
    const productStockGroupUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    const result = await applyProductStockDelta(
      {
        product: { findFirst: productFindFirst },
        productStockGroup: { updateMany: productStockGroupUpdateMany },
      } as any,
      {
        storeId: "store-main",
        productId: "rim",
        delta: -1,
      },
    );

    expect(productStockGroupUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "group-1",
        storeId: "store-main",
        baseStock: { gte: 500 },
      },
      data: { baseStock: { increment: -500 } },
    });
    expect(result).toMatchObject({
      productId: "rim",
      stockGroupId: "group-1",
      beforeStock: 2,
      afterStock: 1,
      baseDelta: -500,
    });
  });

  it("rejects grouped stock decrements that exceed baseStock", async () => {
    const error = await applyProductStockDelta(
      {
        product: {
          findFirst: vi.fn().mockResolvedValue({
            id: "rim",
            stock: 0,
            stockGroupId: "group-1",
            unitMultiplierToBase: 500,
            conversionNeedsReview: false,
            stockGroup: { id: "group-1", baseStock: 100 },
          }),
        },
      } as any,
      {
        storeId: "store-main",
        productId: "rim",
        delta: -1,
      },
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(StockMutationError);
    expect(error.message).toBe("INSUFFICIENT_STOCK");
  });

  it("blocks grouped mutations when conversion needs review", async () => {
    const error = await applyProductStockDelta(
      {
        product: {
          findFirst: vi.fn().mockResolvedValue({
            id: "rim",
            stock: 0,
            stockGroupId: "group-1",
            unitMultiplierToBase: 500,
            conversionNeedsReview: true,
            stockGroup: { id: "group-1", baseStock: 1000 },
          }),
        },
      } as any,
      {
        storeId: "store-main",
        productId: "rim",
        delta: -1,
      },
    ).catch((caught) => caught);

    expect(error).toBeInstanceOf(StockMutationError);
    expect(error.message).toBe("CONVERSION_NEEDS_REVIEW");
  });
});
