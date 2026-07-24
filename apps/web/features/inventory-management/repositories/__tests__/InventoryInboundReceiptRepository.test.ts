import { describe, expect, it, vi } from "vitest";

import { InventoryInboundReceiptRepository } from "../InventoryInboundReceiptRepository";

describe("InventoryInboundReceiptRepository lockStockGroup", () => {
  it("raw-locks the tenant group row before its authoritative ORM reload", async () => {
    const order: string[] = [];
    const queryRaw = vi.fn().mockImplementation(async () => {
      order.push("lock");
      return [{ id: "group-1" }];
    });
    const findFirst = vi.fn().mockImplementation(async () => {
      order.push("read");
      return {
        id: "group-1",
        storeId: "store-main",
        baseStock: 120,
        products: [
          {
            id: "product-1",
            storeId: "store-main",
            stockGroupId: "group-1",
            unitMultiplierToBase: 10,
            conversionNeedsReview: false,
          },
        ],
      };
    });
    const repository = new InventoryInboundReceiptRepository();

    const result = await repository.lockStockGroup(
      {
        $queryRaw: queryRaw,
        productStockGroup: { findFirst },
      } as never,
      { storeId: "store-main", stockGroupId: "group-1" },
    );

    expect(order).toEqual(["lock", "read"]);
    expect(result).toEqual({
      id: "group-1",
      storeId: "store-main",
      baseStock: 120,
      variants: [
        expect.objectContaining({
          id: "product-1",
          stockGroupId: "group-1",
        }),
      ],
    });
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
