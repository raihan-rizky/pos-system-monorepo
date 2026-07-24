import { describe, expect, it, vi } from "vitest";

import { InventoryInboundReceiptRepository } from "../InventoryInboundReceiptRepository";

describe("InventoryInboundReceiptRepository lockStockGroup", () => {
  it("locks the group, discovers variants, locks variants in sorted order, then reloads", async () => {
    const order: string[] = [];
    const queryRaw = vi.fn().mockImplementation(
      async (strings: TemplateStringsArray, rowId: string) => {
        order.push(
          `${strings.join(" ").includes("pos_product_stock_groups") ? "group" : "product"}:${rowId}`,
        );
        return [{ id: rowId }];
      },
    );
    const groupHint = {
      id: "group-1",
      storeId: "store-main",
      baseStock: 120,
      products: [
        {
          id: "product-z",
          storeId: "store-main",
          stockGroupId: "group-1",
          unitMultiplierToBase: 10,
          conversionNeedsReview: false,
        },
        {
          id: "product-a",
          storeId: "store-main",
          stockGroupId: "group-1",
          unitMultiplierToBase: 1,
          conversionNeedsReview: false,
        },
      ],
    };
    const findFirst = vi
      .fn()
      .mockImplementationOnce(async () => {
        order.push("read-hint");
        return groupHint;
      })
      .mockImplementationOnce(async () => {
        order.push("read-fresh");
        return groupHint;
      });
    const repository = new InventoryInboundReceiptRepository();

    const result = await repository.lockStockGroup(
      {
        $queryRaw: queryRaw,
        productStockGroup: { findFirst },
      } as never,
      { storeId: "store-main", stockGroupId: "group-1" },
    );

    expect(order).toEqual([
      "group:group-1",
      "read-hint",
      "product:product-a",
      "product:product-z",
      "read-fresh",
    ]);
    expect(result).toEqual({
      id: "group-1",
      storeId: "store-main",
      baseStock: 120,
      variants: groupHint.products,
    });
  });

  it("returns null when active variant membership drifts after variant locks", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: "group-1",
        storeId: "store-main",
        baseStock: 120,
        products: [
          {
            id: "product-a",
            storeId: "store-main",
            stockGroupId: "group-1",
            unitMultiplierToBase: 1,
            conversionNeedsReview: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "group-1",
        storeId: "store-main",
        baseStock: 120,
        products: [
          {
            id: "product-a",
            storeId: "store-main",
            stockGroupId: "group-1",
            unitMultiplierToBase: 1,
            conversionNeedsReview: false,
          },
          {
            id: "product-b",
            storeId: "store-main",
            stockGroupId: "group-1",
            unitMultiplierToBase: 10,
            conversionNeedsReview: false,
          },
        ],
      });
    const repository = new InventoryInboundReceiptRepository();

    const result = await repository.lockStockGroup(
      {
        $queryRaw: vi.fn().mockImplementation(
          async (_strings: TemplateStringsArray, rowId: string) => [
            { id: rowId },
          ],
        ),
        productStockGroup: { findFirst },
      } as never,
      { storeId: "store-main", stockGroupId: "group-1" },
    );

    expect(result).toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("returns null without a reload when one discovered variant lock misses", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "group-1",
      storeId: "store-main",
      baseStock: 120,
      products: [
        {
          id: "product-a",
          storeId: "store-main",
          stockGroupId: "group-1",
          unitMultiplierToBase: 1,
          conversionNeedsReview: false,
        },
      ],
    });
    const repository = new InventoryInboundReceiptRepository();

    const result = await repository.lockStockGroup(
      {
        $queryRaw: vi.fn().mockImplementation(
          async (strings: TemplateStringsArray, rowId: string) =>
            strings.join(" ").includes("pos_product_stock_groups")
              ? [{ id: rowId }]
              : [],
        ),
        productStockGroup: { findFirst },
      } as never,
      { storeId: "store-main", stockGroupId: "group-1" },
    );

    expect(result).toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("does not issue an ORM read when the tenant-scoped raw lock misses", async () => {
    const findFirst = vi.fn();
    const repository = new InventoryInboundReceiptRepository();

    const result = await repository.lockStockGroup(
      {
        $queryRaw: vi.fn().mockResolvedValue([]),
        productStockGroup: { findFirst },
      } as never,
      { storeId: "store-main", stockGroupId: "group-other-tenant" },
    );

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
