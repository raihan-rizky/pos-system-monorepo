import { describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ db: { inventoryInboundReceipt: { findMany } }, Prisma: {} }));
import { InventoryInboundReceiptRepository } from "../InventoryInboundReceiptRepository";

describe("riwayat penerimaan yang dibalik", () => {
  it("mengambil status bundle dan menandai dampak stok yang sudah dibalik", async () => {
    findMany.mockResolvedValueOnce([
      { id: "r1", goodsPurchase: null, stockBundle: { status: "UNDONE" }, lines: [] },
      { id: "r2", goodsPurchase: null, stockBundle: { status: "COMMITTED" }, lines: [] },
      { id: "r3", goodsPurchase: null, stockBundle: null, lines: [] },
    ]);
    const rows = await new InventoryInboundReceiptRepository().listInboundReceipts("store-1", {});
    expect(findMany.mock.calls[0][0].include.stockBundle).toEqual({ select: { status: true } });
    expect(rows.map((row) => row.stockReversed)).toEqual([true, false, false]);
    expect(rows[0]).not.toHaveProperty("stockBundle");
  });
});
