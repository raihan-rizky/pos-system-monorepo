import { describe, expect, it, vi } from "vitest";

const findManyMock = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  db: { goodsPurchase: { findMany: findManyMock } },
  Prisma: {},
}));

import { InventoryInboundReceiptRepository } from "../InventoryInboundReceiptRepository";

describe("InventoryInboundReceiptRepository receiving queue", () => {
  it("loads the custom name from the related shopping request", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "gp-1",
        number: "PB-202610-004",
        shoppingRequest: { name: "Restok Kertas Oktober" },
        supplierId: "supplier-1",
        supplierNameSnapshot: "Damai Stationary",
        fulfillmentStatus: "NOT_RECEIVED",
        items: [
          {
            id: "item-1",
            productId: "product-1",
            productNameSnapshot: "Kertas A4",
            skuSnapshot: "KRT-A4",
            unitSnapshot: "rim",
            quantity: 5,
            product: { costPrice: 12500 },
            inboundReceiptLines: [],
          },
        ],
      },
    ]);

    const rows = await new InventoryInboundReceiptRepository().listReceivingQueue(
      "store-main",
      {},
    );

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          shoppingRequest: { select: { name: true } },
        }),
      }),
    );
    expect(rows[0]).toMatchObject({
      goodsPurchaseNumber: "PB-202610-004",
      shoppingRequestName: "Restok Kertas Oktober",
    });
  });
});
