import { expect, it, vi } from "vitest";
import { InventoryInboundReceiptRepository } from "../InventoryInboundReceiptRepository";

const database = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { inventoryInboundReceipt: { findMany: database.findMany } }, Prisma: {} }));

it("keeps retained-price warnings with the stock bundle when receipt history is reloaded", async () => {
  let summary: unknown;
  const tx = {
    batchOperation: {
      create: async ({ data }: { data: { summary: unknown } }) => {
        summary = data.summary;
        return { id: "bundle" };
      },
    },
    batchOperationItem: { createMany: async () => undefined },
  };
  const repository = new InventoryInboundReceiptRepository();
  await repository.createReceiptStockBundle(tx as never, {
    type: "INBOUND_RECEIPT", status: "COMMITTED", storeId: "store", createdBy: "owner",
    approvedByName: "Owner", approvedAt: new Date("2026-11-18T00:00:00Z"),
    title: "Supplier", receiptId: "receipt", goodsPurchaseId: "purchase",
    goodsPurchaseNumber: "PB-TEST-001", supplierId: null, supplierName: "Supplier",
    pricingWarningProductIds: ["pen", "binder"], canonicalImpacts: [], variantImpacts: [],
  });
  expect(summary).toMatchObject({ pricingWarningProductIds: ["pen", "binder"] });

  database.findMany.mockResolvedValueOnce([{
    id: "receipt", goodsPurchase: null, stockBundle: { status: "COMMITTED", summary },
    paymentSchedule: null, lines: [],
  }]);
  const rows = await repository.listInboundReceipts("store", {});
  expect(rows[0]).toMatchObject({ pricingWarningProductIds: ["pen", "binder"] });
});
