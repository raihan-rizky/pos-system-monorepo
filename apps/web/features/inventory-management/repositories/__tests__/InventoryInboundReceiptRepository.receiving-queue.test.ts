import { describe, expect, it, vi } from "vitest";

const findManyMock = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  db: { goodsPurchase: { findMany: findManyMock } },
  Prisma: {},
}));

import { InventoryInboundReceiptRepository } from "../InventoryInboundReceiptRepository";

describe("InventoryInboundReceiptRepository receiving queue", () => {
  it("identifies automatic HPP followers and leaves manual units independent", async () => {
    const pcs = { id: "pcs", storeId: "store-main", stockGroupId: "group", unit: "pcs", unitMultiplierToBase: 1,
      conversionNeedsReview: false, isActive: true, costPrice: 100, price: 150, hargaAgen: null, hargaDinas: null };
    const box = { ...pcs, id: "box", unit: "box", unitMultiplierToBase: 12, costPrice: 1200, price: 1800 };
    const group = { id: "group", storeId: "store-main", baseUnit: "pcs", pricingConfig: null as unknown, products: [pcs, box] };
    const row = { id: "gp-1", number: "PB-1", shoppingRequest: { name: "Restok" }, supplierId: "supplier-1", supplierNameSnapshot: "Supplier",
      fulfillmentStatus: "NOT_RECEIVED", items: [{ id: "item-1", productId: "box", productNameSnapshot: "Barang",
        skuSnapshot: "SKU", unitSnapshot: "box", quantity: 1, product: { ...box, stockGroup: group }, inboundReceiptLines: [] }] };
    findManyMock.mockResolvedValueOnce([row]);
    let result = await new InventoryInboundReceiptRepository().listReceivingQueue("store-main", {});
    expect(result[0].pricingUnits?.find((unit) => unit.productId === "box")?.autoCostSource).toBeUndefined();

    group.pricingConfig = { sourceProductId: "pcs", revision: 1, initializationVersion: 1, members: {
      pcs: { mode: "AUTO", factor: null, review: { price: [], costPrice: [] } },
      box: { mode: "AUTO", factor: null, review: { price: [], costPrice: [] } },
    } };
    findManyMock.mockResolvedValueOnce([row]);
    result = await new InventoryInboundReceiptRepository().listReceivingQueue("store-main", {});
    expect(result[0].pricingUnits?.find((unit) => unit.productId === "box")?.autoCostSource).toEqual({ productId: "pcs", unit: "pcs", unitMultiplierToBase: 1 });
    (group.pricingConfig as { members: Record<string, { mode: string }> }).members.box.mode = "MANUAL";
    findManyMock.mockResolvedValueOnce([row]);
    result = await new InventoryInboundReceiptRepository().listReceivingQueue("store-main", {});
    expect(result[0].pricingUnits?.find((unit) => unit.productId === "box")?.autoCostSource).toBeUndefined();
    delete (group.pricingConfig as { members: Record<string, unknown> }).members.box;
    findManyMock.mockResolvedValueOnce([row]);
    result = await new InventoryInboundReceiptRepository().listReceivingQueue("store-main", {});
    expect(result[0].pricingUnits?.find((unit) => unit.productId === "box")?.autoCostSource).toBeUndefined();
  });

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
