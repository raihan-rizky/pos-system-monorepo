import { describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ db: { goodsPurchase: { findFirst } }, Prisma: {} }));
import { InventoryInboundReceiptRepository } from "../InventoryInboundReceiptRepository";

describe("perbandingan penerimaan dengan stok yang dibalik", () => {
  it("membedakan penerimaan yang sudah dan belum dibalik", async () => {
    findFirst.mockResolvedValueOnce({
      id: "gp-1", number: "PB-1", supplierNameSnapshot: "Supplier", fulfillmentStatus: "RECEIVED", items: [],
      inboundReceipts: [
        { id: "r1", createdAt: new Date("2026-11-01"), status: "APPROVED", approvedAt: null, approver: null, stockBundle: { status: "UNDONE" }, lines: [] },
        { id: "r2", createdAt: new Date("2026-11-02"), status: "APPROVED", approvedAt: null, approver: null, stockBundle: { status: "COMMITTED" }, lines: [] },
      ],
    });
    const comparison = await new InventoryInboundReceiptRepository().getGoodsPurchaseReceivingComparison("store-1", "gp-1");
    expect(findFirst.mock.calls[0][0].select.inboundReceipts.select.stockBundle).toEqual({ select: { status: true } });
    expect(comparison?.receipts.map(receipt => receipt.stockReversed)).toEqual([true, false]);
  });
});
