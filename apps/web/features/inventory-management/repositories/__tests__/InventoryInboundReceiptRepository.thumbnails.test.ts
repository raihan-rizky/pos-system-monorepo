import { describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({
  db: { inventoryInboundReceipt: { findMany } },
  Prisma: {},
}));

import { InventoryInboundReceiptRepository } from "../InventoryInboundReceiptRepository";

describe("inbound receipt product thumbnails", () => {
  it("loads only the related product image and exposes a flat nullable URL", async () => {
    findMany.mockResolvedValueOnce([
      {
        id: "receipt-1",
        goodsPurchase: { number: "PB-001" },
        lines: [
          {
            id: "line-1",
            product: { imageUrl: "/images/kertas_default.png" },
            costPriceSnapshot: null,
            supplierCostPrice: null,
          },
          {
            id: "line-2",
            product: { imageUrl: null },
            costPriceSnapshot: null,
            supplierCostPrice: null,
          },
        ],
      },
    ]);
    const result =
      await new InventoryInboundReceiptRepository().listInboundReceipts(
        "store-main",
        {
          status: "APPROVED",
          supplierId: "supplier-1",
          goodsPurchaseId: "pb-1",
        },
      );

    expect(result[0].lines[0]).toHaveProperty(
      "imageUrl",
      "/images/kertas_default.png",
    );
    expect(result[0].lines[1]).toHaveProperty("imageUrl", null);
    expect(result[0].lines[0]).not.toHaveProperty("product");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId: "store-main",
          status: "APPROVED",
          supplierId: "supplier-1",
          goodsPurchaseId: "pb-1",
        },
        include: expect.objectContaining({
          lines: expect.objectContaining({
            include: { product: { select: { imageUrl: true } } },
          }),
        }),
      }),
    );
  });
});
