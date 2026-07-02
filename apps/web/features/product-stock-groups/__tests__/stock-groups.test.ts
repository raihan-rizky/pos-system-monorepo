import { describe, expect, it, vi } from "vitest";

import {
  calculateBaseQuantity,
  calculateDisplayStock,
  formatCompoundStock,
} from "../stock-display";
import {
  createProductStockGroupEnsurer,
  ensureProductStockGroups,
} from "../product-stock-groups-service";
import { normalizeStockGroupKey } from "../stock-grouping";
import {
  applyProductStockDelta,
  applyProductStockDeltas,
  StockMutationError,
} from "../stock-mutations";

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

  it("caches repeated stock group ensures inside one transaction", async () => {
    const group = {
      id: "group-1",
      storeId: "store-main",
      groupKey: "stabilo boss|cat-atk||",
      displayName: "Stabilo Boss",
      baseUnit: "pcs",
      baseStock: 10,
    };
    const findUnique = vi.fn().mockResolvedValue(group);
    const create = vi.fn();
    const ensureStockGroup = createProductStockGroupEnsurer({
      productStockGroup: { findUnique, create },
    } as any);

    const input = {
      storeId: "store-main",
      name: "  Stabilo   Boss ",
      categoryId: "cat-atk",
      material: "",
      size: "",
      displayName: "Stabilo Boss",
      baseUnit: "pcs",
      baseStock: 10,
    };

    await expect(ensureStockGroup(input)).resolves.toEqual({
      group,
      created: false,
    });
    await expect(
      ensureStockGroup({ ...input, name: "Stabilo Boss", baseStock: 99 }),
    ).resolves.toEqual({
      group,
      created: false,
    });

    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("bulk ensures stock groups with one lookup and one createMany call", async () => {
    const existing = {
      id: "group-existing",
      storeId: "store-main",
      groupKey: "amplop|cat-atk||",
      displayName: "Amplop",
      baseUnit: "pack",
      baseStock: 10,
    };
    const findMany = vi.fn().mockResolvedValue([existing]);
    const createMany = vi.fn().mockResolvedValue({ count: 1 });

    const ensured = await ensureProductStockGroups(
      {
        productStockGroup: { findMany, createMany },
      } as any,
      [
        {
          storeId: "store-main",
          name: "Amplop",
          categoryId: "cat-atk",
          material: "",
          size: "",
          displayName: "Amplop",
          baseUnit: "pack",
          baseStock: 10,
        },
        {
          storeId: "store-main",
          name: "Kertas HVS",
          categoryId: "cat-atk",
          material: "70 GSM",
          size: "A4",
          displayName: "Kertas HVS",
          baseUnit: "rim",
          baseStock: 500,
        },
        {
          storeId: "store-main",
          name: "Kertas   HVS",
          categoryId: "cat-atk",
          material: "70 gsm",
          size: "a4",
          displayName: "Kertas HVS duplicate",
          baseUnit: "rim",
          baseStock: 999,
        },
      ],
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: expect.any(String),
          storeId: "store-main",
          groupKey: "kertas hvs|cat-atk|70 gsm|a4",
          displayName: "Kertas HVS",
          baseUnit: "rim",
          baseStock: 500,
        }),
      ],
    });
    expect(ensured.get("store-main|amplop|cat-atk||")).toEqual({
      group: existing,
      created: false,
    });
    expect(ensured.get("store-main|kertas hvs|cat-atk|70 gsm|a4")).toEqual({
      group: expect.objectContaining({
        id: expect.any(String),
        groupKey: "kertas hvs|cat-atk|70 gsm|a4",
      }),
      created: true,
    });
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

describe("applyProductStockDeltas", () => {
  it("omits the stock >= qty guard on batched negative decrements when allowNegative is true", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: "p1" }]);

    await applyProductStockDeltas(
      { $queryRaw: queryRaw } as any,
      {
        storeId: "store-main",
        items: [{ productId: "p1", delta: -2 }],
        allowNegative: true,
      },
    );

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sqlParts = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join(" ");
    expect(sqlParts).not.toContain("p.stock >= v.qty");
  });
});
