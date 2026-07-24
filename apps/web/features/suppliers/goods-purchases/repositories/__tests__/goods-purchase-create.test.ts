import { beforeEach, describe, expect, it, vi } from "vitest";

const shoppingRequestFindMany = vi.hoisted(() => vi.fn());
const productFindMany = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  db: {
    shoppingRequest: { findMany: shoppingRequestFindMany },
    product: { findMany: productFindMany },
  },
}));

import {
  listEligibleShoppingRequests,
  listLargeUnitProducts,
} from "../goods-purchases-repository";

describe("goods purchase create repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shoppingRequestFindMany.mockResolvedValue([]);
    productFindMany.mockResolvedValue([]);
  });

  it("only lists approved requests without legacy expense or active purchase", async () => {
    await listEligibleShoppingRequests("store-1");

    expect(shoppingRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-1",
          status: "APPROVED",
          expense: null,
          goodsPurchases: {
            none: { activeShoppingRequestKey: { not: null } },
          },
          items: {
            some: {
              decisionStatus: "APPROVED",
              approvedQty: { gt: 0 },
            },
          },
        }),
      }),
    );
  });

  it("returns only active large-unit products from the actor store", async () => {
    productFindMany.mockResolvedValue([
      {
        id: "box-1",
        name: "Kertas Box",
        sku: "BOX-1",
        unit: "box",
        unitMultiplierToBase: 1,
        costPrice: { toString: () => "100000" },
        stockGroupId: null,
        stockGroup: null,
      },
      {
        id: "sheet-1",
        name: "Kertas Lembar",
        sku: "SHEET-1",
        unit: "lembar",
        unitMultiplierToBase: 1,
        costPrice: { toString: () => "1000" },
        stockGroupId: null,
        stockGroup: null,
      },
    ]);

    await expect(listLargeUnitProducts("store-1")).resolves.toEqual([
      expect.objectContaining({ id: "box-1", costPrice: 100000 }),
    ]);
    expect(productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-1",
          isActive: true,
        }),
      }),
    );
  });

  it("keeps scanning product pages until it finds large-unit options", async () => {
    productFindMany
      .mockResolvedValueOnce(
        Array.from({ length: 200 }, (_, index) => ({
          id: `small-${index}`,
          name: `Produk kecil ${index}`,
          sku: `SMALL-${index}`,
          unit: "pcs",
          unitMultiplierToBase: 1,
          costPrice: null,
          stockGroupId: null,
          stockGroup: null,
        })),
      )
      .mockResolvedValueOnce([
        {
          id: "large-201",
          name: "Produk Dus",
          sku: "LARGE-201",
          unit: "dus",
          unitMultiplierToBase: 1,
          costPrice: { toString: () => "250000" },
          stockGroupId: "group-1",
          stockGroup: { displayName: "Produk" },
        },
      ]);

    await expect(listLargeUnitProducts("store-1")).resolves.toEqual([
      expect.objectContaining({ id: "large-201" }),
    ]);
    expect(productFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ skip: 200, take: 200 }),
    );
  });
});
