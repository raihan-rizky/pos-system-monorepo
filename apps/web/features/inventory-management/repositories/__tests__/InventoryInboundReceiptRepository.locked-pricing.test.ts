import { describe, expect, it, vi } from "vitest";
import { InventoryInboundReceiptRepository } from "../InventoryInboundReceiptRepository";

vi.mock("@pos/db", () => ({ db: {}, Prisma: {} }));

describe("locked inbound receipt pricing metadata", () => {
  it("loads the complete group for automatic and manual followers when editing a submitted receipt", async () => {
    const pcs = { id: "pcs", storeId: "store", stockGroupId: "group", unit: "pcs", unitMultiplierToBase: 1, conversionNeedsReview: false,
      isActive: true, costPrice: 10, price: 15, hargaAgen: null, hargaDinas: null, imageUrl: null };
    const box = { ...pcs, id: "box", unit: "box", unitMultiplierToBase: 12, costPrice: 120, price: 150 };
    const group = { id: "group", storeId: "store", baseUnit: "pcs", pricingConfig: null as unknown, products: [pcs, box] };
    const receipt = { id: "receipt", storeId: "store", status: "SUBMITTED", goodsPurchaseId: "gp", stockBundleId: null,
      supplierId: null, supplier: null, goodsPurchase: { number: "PB", supplierNameSnapshot: "Supplier" }, lines: [{
        id: "line", productId: "box", status: "RECEIVED", expectedQuantity: 1, receivedQuantity: 1, matchStatus: "MATCHED", reviewStatus: "PENDING",
        approvedById: null, approvedByName: null, approvedAt: null, note: null, costPriceSnapshot: 120, supplierCostPrice: 120, pricingSnapshot: null,
        product: { ...box, stockGroup: group }, goodsPurchaseItem: { id: "gpi", goodsPurchaseId: "gp", productId: "box", quantity: 1, latestUnitPrice: 120, inboundReceiptLines: [] },
      }] };
    const findFirst = vi.fn().mockResolvedValue(receipt);
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: "receipt" }]), inventoryInboundReceipt: { findFirst } };
    const repository = new InventoryInboundReceiptRepository();
    let result = await repository.lockSubmittedReceipt(tx as never, { storeId: "store", receiptId: "receipt" });
    expect(result?.lines[0].pricingUnits.find((unit) => unit.productId === "box")?.autoCostSource).toEqual({ productId: "pcs", unit: "pcs", unitMultiplierToBase: 1 });
    expect(findFirst.mock.calls[0][0].select.lines.select.product.include.stockGroup.select).toMatchObject({ id: true, storeId: true, baseUnit: true, pricingConfig: true });
    group.pricingConfig = { sourceProductId: "pcs", revision: 1, initializationVersion: 1, members: {
      pcs: { mode: "AUTO", factor: null, review: { price: [], costPrice: [] } },
      box: { mode: "MANUAL", factor: null, review: { price: [], costPrice: [] } },
    } };
    result = await repository.lockSubmittedReceipt(tx as never, { storeId: "store", receiptId: "receipt" });
    expect(result?.lines[0].pricingUnits.find((unit) => unit.productId === "box")?.autoCostSource).toBeUndefined();
  });
});
