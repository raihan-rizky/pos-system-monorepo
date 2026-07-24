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
import { StockMutationConflictError } from "../stock-group-lock";

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
  it("locks the hinted group then product and computes from the post-lock reload", async () => {
    const order: string[] = [];
    const productFindFirst = vi
      .fn()
      .mockImplementationOnce(async () => {
        order.push("hint");
        return {
          id: "pack",
          stock: 0,
          stockGroupId: "group-1",
          unitMultiplierToBase: 10,
          conversionNeedsReview: false,
          stockGroup: { id: "group-1", baseStock: 100 },
        };
      })
      .mockImplementationOnce(async () => {
        order.push("reload");
        return {
          id: "pack",
          stock: 0,
          stockGroupId: "group-1",
          unitMultiplierToBase: 20,
          conversionNeedsReview: false,
          stockGroup: { id: "group-1", baseStock: 140 },
        };
      });
    const queryRaw = vi.fn(
      async (strings: TemplateStringsArray, rowId: string) => {
        order.push(
          `${strings.join(" ").includes("pos_product_stock_groups") ? "group" : "product"}:${rowId}`,
        );
        return [{ id: rowId }];
      },
    );
    const productStockGroupUpdateMany = vi
      .fn()
      .mockImplementation(async () => {
        order.push("write");
        return { count: 1 };
      });

    const result = await applyProductStockDelta(
      {
        $queryRaw: queryRaw,
        product: { findFirst: productFindFirst },
        productStockGroup: { updateMany: productStockGroupUpdateMany },
      } as never,
      {
        storeId: "store-main",
        productId: "pack",
        delta: 2,
      },
    );

    expect(order).toEqual([
      "hint",
      "group:group-1",
      "product:pack",
      "reload",
      "write",
    ]);
    expect(productStockGroupUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "group-1",
        storeId: "store-main",
      },
      data: { baseStock: { increment: 40 } },
    });
    expect(result).toMatchObject({
      beforeStock: 7,
      afterStock: 9,
      baseDelta: 40,
    });
  });

  it("rejects a product whose stock-group membership changed after candidate discovery", async () => {
    const productFindFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: "pack",
        stock: 0,
        stockGroupId: "group-a",
        unitMultiplierToBase: 10,
        conversionNeedsReview: false,
        stockGroup: { id: "group-a", baseStock: 100 },
      })
      .mockResolvedValueOnce({
        id: "pack",
        stock: 0,
        stockGroupId: "group-b",
        unitMultiplierToBase: 10,
        conversionNeedsReview: false,
        stockGroup: { id: "group-b", baseStock: 100 },
      });
    const productStockGroupUpdateMany = vi.fn();

    await expect(
      applyProductStockDelta(
        {
          $queryRaw: vi.fn().mockResolvedValue([{ id: "locked" }]),
          product: { findFirst: productFindFirst },
          productStockGroup: { updateMany: productStockGroupUpdateMany },
        } as never,
        {
          storeId: "store-main",
          productId: "pack",
          delta: 1,
        },
      ),
    ).rejects.toBeInstanceOf(StockMutationConflictError);
    expect(productStockGroupUpdateMany).not.toHaveBeenCalled();
  });

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
        $queryRaw: vi.fn().mockResolvedValue([{ id: "locked" }]),
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
        $queryRaw: vi.fn().mockResolvedValue([{ id: "locked" }]),
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
        $queryRaw: vi.fn().mockResolvedValue([{ id: "locked" }]),
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
  it("locks all hinted groups before products in sorted order and reloads once", async () => {
    const order: string[] = [];
    const products = [
      {
        id: "product-z",
        stock: 0,
        stockGroupId: "group-z",
        unitMultiplierToBase: 1,
        conversionNeedsReview: false,
        stockGroup: { id: "group-z", baseStock: 10 },
      },
      {
        id: "product-a",
        stock: 0,
        stockGroupId: "group-a",
        unitMultiplierToBase: 1,
        conversionNeedsReview: false,
        stockGroup: { id: "group-a", baseStock: 10 },
      },
    ];
    const productFindMany = vi
      .fn()
      .mockImplementationOnce(async () => {
        order.push("hint");
        return products;
      })
      .mockImplementationOnce(async () => {
        order.push("reload");
        return products;
      });
    const queryRaw = vi.fn(
      async (strings: TemplateStringsArray, rowId: string) => {
        order.push(
          `${strings.join(" ").includes("pos_product_stock_groups") ? "group" : "product"}:${rowId}`,
        );
        return [{ id: rowId }];
      },
    );
    const productStockGroupUpdateMany = vi
      .fn()
      .mockResolvedValue({ count: 1 });

    await applyProductStockDeltas(
      {
        $queryRaw: queryRaw,
        product: { findMany: productFindMany },
        productStockGroup: { updateMany: productStockGroupUpdateMany },
      } as never,
      {
        storeId: "store-main",
        items: [
          { productId: "product-z", delta: 1 },
          { productId: "product-a", delta: 1 },
        ],
      },
    );

    expect(order).toEqual([
      "hint",
      "group:group-a",
      "group:group-z",
      "product:product-a",
      "product:product-z",
      "reload",
    ]);
    expect(productStockGroupUpdateMany).toHaveBeenCalledTimes(2);
  });

  it("omits the stock >= qty guard on locked standalone decrements when allowNegative is true", async () => {
    const standalone = {
      id: "p1",
      stock: 1,
      stockGroupId: null,
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
      stockGroup: null,
    };
    const queryRaw = vi.fn().mockResolvedValue([{ id: "p1" }]);
    const productUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    await applyProductStockDeltas(
      {
        $queryRaw: queryRaw,
        product: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([standalone])
            .mockResolvedValueOnce([standalone]),
          updateMany: productUpdateMany,
        },
      } as never,
      {
        storeId: "store-main",
        items: [{ productId: "p1", delta: -2 }],
        allowNegative: true,
      },
    );

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(productUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "p1",
        storeId: "store-main",
      },
      data: { stock: { increment: -2 } },
    });
  });
});
