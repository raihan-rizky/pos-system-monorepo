import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  shoppingRequest: { findFirst: vi.fn(), update: vi.fn() },
  goodsPurchase: { findMany: vi.fn(), updateMany: vi.fn() },
  inventoryInboundReceipt: { findMany: vi.fn(), updateMany: vi.fn() },
  product: { findMany: vi.fn(), updateMany: vi.fn() },
  productStockGroup: { findMany: vi.fn(), updateMany: vi.fn() },
  productStockGroupActivity: { findFirst: vi.fn() },
  inventoryLog: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  batchOperation: { create: vi.fn(), updateMany: vi.fn() },
  batchOperationItem: { createMany: vi.fn() },
  shoppingRequestDeletion: { create: vi.fn() },
}));
const transaction = vi.hoisted(() => vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)));
vi.mock("@pos/db", () => ({ db: { $transaction: transaction } }));
vi.mock("@/features/product-stock-groups/stock-group-lock", () => ({
  lockStockMutationRows: vi.fn(async (_tx: unknown, input: any) => ({
    lockedProductIds: [...input.productIds], lockedStockGroupIds: [...input.stockGroupIds],
  })),
}));
import * as repository from "../shopping-request-deletion-repository";
import { lockStockMutationRows } from "@/features/product-stock-groups/stock-group-lock";

const actor = { id: "owner-1", name: "Owner", storeId: "store-1" };
const product = { id: "p-1", name: "Barang A", sku: "A", unit: "pcs", stock: 8, stockGroupId: null, unitMultiplierToBase: 1, conversionNeedsReview: false, costPrice: 1000 };
function receipt() {
  return {
    id: "receipt-1", goodsPurchaseId: "purchase-1", status: "APPROVED", createdAt: new Date("2026-11-01T00:00:00Z"), stockBundleId: "batch-1",
    lines: [{ id: "line-1", productId: "p-1", inventoryLogId: "log-1", receivedQuantity: 4 }],
    stockBundle: { id: "batch-1", type: "INBOUND_RECEIPT", undoOfBatchId: null as string | null, summary: { source: "INBOUND_RECEIPT", receiptId: "receipt-1", goodsPurchaseId: "purchase-1" }, status: "COMMITTED", items: [{ productId: "p-1", inventoryLogId: "log-1" as string | null, afterSnapshot: { unit: "pcs", inboundReceiptImpact: { kind: "CANONICAL", receiptId: "receipt-1", receiptLineId: "line-1" as string | null, stockGroupId: null as string | null, delta: 4, baseDelta: 4 } } }] },
  };
}

describe("transaksi penghapusan daftar belanja", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: "sr-1" }]);
    tx.$executeRaw.mockResolvedValue(0);
    tx.shoppingRequest.findFirst.mockResolvedValue({ id: "sr-1", number: "DPB-1", name: "Daftar", status: "APPROVED", stockAppliedAt: null, items: [], deletion: null });
    tx.goodsPurchase.findMany.mockResolvedValue([{ id: "purchase-1", status: "APPROVED" }]);
    tx.inventoryInboundReceipt.findMany.mockResolvedValue([receipt()]);
    tx.product.findMany.mockResolvedValue([product]);
    tx.productStockGroup.findMany.mockResolvedValue([]);
    tx.productStockGroupActivity.findFirst.mockResolvedValue(null);
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    tx.productStockGroup.updateMany.mockResolvedValue({ count: 1 });
    tx.goodsPurchase.updateMany.mockResolvedValue({ count: 1 });
    tx.inventoryInboundReceipt.updateMany.mockResolvedValue({ count: 0 });
    tx.batchOperation.updateMany.mockResolvedValue({ count: 1 });
    tx.batchOperation.create.mockResolvedValue({ id: "undo-1" });
    tx.batchOperationItem.createMany.mockResolvedValue({ count: 1 });
    tx.inventoryLog.create.mockResolvedValue({ id: "out-1" });
    tx.inventoryLog.findMany.mockResolvedValue([{ id: "log-1", productId: "p-1", type: "IN", reason: "RESTOCK", status: "APPROVED", quantity: 4 }]);
    tx.inventoryLog.findFirst.mockResolvedValue(null);
    tx.shoppingRequest.update.mockResolvedValue({ id: "sr-1" });
    tx.shoppingRequestDeletion.create.mockResolvedValue({ id: "audit-1" });
  });

  it("membalik stok penerimaan sekali dan menyimpan sumber dalam audit", async () => {
    const remove = (repository as any).deleteShoppingRequestRecord;
    expect(remove).toBeTypeOf("function");
    await expect(remove("sr-1", "Salah catat", actor)).resolves.toMatchObject({ id: "sr-1", status: "CANCELLED" });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "p-1", storeId: "store-1" }), data: expect.objectContaining({ stock: { decrement: 4 } }) }));
    expect(tx.inventoryLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ productId: "p-1", type: "OUT", quantity: 4 }) }));
    expect(tx.batchOperation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "batch-1", status: { in: ["COMMITTED", "UNDO_BLOCKED"] } }), data: expect.objectContaining({ status: "UNDONE" }) }));
    expect(tx.shoppingRequestDeletion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ shoppingRequestId: "sr-1", actorId: "owner-1", reason: "Salah catat" }) }));
  });

  it("mencatat pembalikan sebagai kebalikan restock, bukan kerugian stok manual", async () => {
    await repository.deleteShoppingRequestRecord("sr-1", "Salah catat", actor);
    expect(tx.inventoryLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "OUT", reason: "RESTOCK", sourceTransactionRef: "shopping-request:sr-1" }),
    }));
  });

  it("membatalkan tanpa mengubah stok jika belum ada penerimaan", async () => {
    const remove = (repository as any).deleteShoppingRequestRecord;
    expect(remove).toBeTypeOf("function");
    tx.inventoryInboundReceipt.findMany.mockResolvedValue([]);
    await remove("sr-1", "Dibatalkan", actor);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.create).not.toHaveBeenCalled();
    expect(tx.goodsPurchase.updateMany).toHaveBeenCalled();
  });

  it("menyimpan status pembelian sebelum dibatalkan untuk keperluan laporan", async () => {
    await repository.deleteShoppingRequestRecord("sr-1", "Salah catat", actor);
    expect(tx.goodsPurchase.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "APPROVED" }),
      data: expect.objectContaining({ status: "CANCELLED", statusBeforeCancellation: "APPROVED" }),
    }));
    expect(tx.goodsPurchase.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PENDING" }),
      data: expect.objectContaining({ status: "CANCELLED", statusBeforeCancellation: "PENDING" }),
    }));
  });

  it("menolak stok tidak cukup sebelum membuat perubahan apa pun", async () => {
    const remove = (repository as any).deleteShoppingRequestRecord;
    expect(remove).toBeTypeOf("function");
    tx.product.findMany.mockResolvedValue([{ ...product, stock: 3 }]);
    await expect(remove("sr-1", "Salah catat", actor)).rejects.toThrow(/stok.*tidak cukup/i);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.shoppingRequestDeletion.create).not.toHaveBeenCalled();
  });

  it("menolak dampak lama yang tidak memiliki sumber yang pasti", async () => {
    const remove = (repository as any).deleteShoppingRequestRecord;
    expect(remove).toBeTypeOf("function");
    tx.shoppingRequest.findFirst.mockResolvedValue({ id: "sr-1", number: "DPB-1", name: "Daftar", status: "APPROVED", stockAppliedAt: new Date(), items: [], deletion: null });
    await expect(remove("sr-1", "Salah catat", actor)).rejects.toThrow(/stok lama|riwayat stok/i);
    expect(tx.shoppingRequestDeletion.create).not.toHaveBeenCalled();
  });

  it("menolak penerimaan positif yang tidak memiliki catatan stok meski bundle tersedia", async () => {
    const incomplete = receipt();
    incomplete.lines.push({ id: "line-missing", inventoryLogId: null, receivedQuantity: 2 } as any);
    tx.inventoryInboundReceipt.findMany.mockResolvedValue([incomplete]);
    await expect(repository.deleteShoppingRequestRecord("sr-1", "Salah catat", actor)).rejects.toThrow(/riwayat stok|dampak stok/i);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("menolak bundle yang bukan penerimaan inbound untuk daftar ini", async () => {
    const mismatched = receipt();
    mismatched.stockBundle.type = "DAILY_STOCK_MATCHING";
    tx.inventoryInboundReceipt.findMany.mockResolvedValue([mismatched]);
    await expect(repository.deleteShoppingRequestRecord("sr-1", "Salah catat", actor)).rejects.toThrow(/riwayat stok|penerimaan/i);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["sumber", { summary: { source: "LAIN", receiptId: "receipt-1", goodsPurchaseId: "purchase-1" } }],
    ["penerimaan", { summary: { source: "INBOUND_RECEIPT", receiptId: "receipt-lain", goodsPurchaseId: "purchase-1" } }],
    ["pembelian", { summary: { source: "INBOUND_RECEIPT", receiptId: "receipt-1", goodsPurchaseId: "purchase-lain" } }],
    ["bundle pembalikan", { undoOfBatchId: "batch-lain" }],
  ])("menolak identitas %s yang tidak sesuai", async (_description, invalid) => {
    const mismatched = receipt();
    Object.assign(mismatched.stockBundle, invalid);
    tx.inventoryInboundReceipt.findMany.mockResolvedValue([mismatched]);
    await expect(repository.deleteShoppingRequestRecord("sr-1", "Salah catat", actor)).rejects.toThrow(/riwayat stok|penerimaan/i);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("mengunci seluruh varian bundle sebelum memeriksa pembalikan grup", async () => {
    const grouped = receipt();
    grouped.stockBundle.items[0].afterSnapshot.inboundReceiptImpact.stockGroupId = "group-1";
    grouped.stockBundle.items.push({
      productId: "p-2", inventoryLogId: null,
      afterSnapshot: { unit: "pcs", inboundReceiptImpact: { kind: "VARIANT", receiptId: "receipt-1", receiptLineId: null, stockGroupId: "group-1", delta: 2, baseDelta: 4 } },
    });
    tx.inventoryInboundReceipt.findMany.mockResolvedValue([grouped]);
    tx.product.findMany.mockResolvedValue([
      { ...product, stockGroupId: "group-1" },
      { ...product, id: "p-2", stockGroupId: "group-1", unitMultiplierToBase: 2 },
    ]);
    tx.productStockGroup.findMany.mockResolvedValue([{ id: "group-1", baseStock: 8, baseUnit: "pcs" }]);
    await expect(repository.previewShoppingRequestDeletionRecord("sr-1", actor.storeId)).resolves.toMatchObject({ movements: [{ stockGroupId: "group-1", baseQuantity: 4 }] });
    expect(lockStockMutationRows).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ productIds: ["p-1", "p-2"] }));
  });

  it("menolak grup dengan perubahan konversi setelah penerimaan", async () => {
    const grouped = receipt();
    grouped.stockBundle.items[0].afterSnapshot.inboundReceiptImpact.stockGroupId = "group-1";
    tx.inventoryInboundReceipt.findMany.mockResolvedValue([grouped]);
    tx.product.findMany.mockResolvedValue([{ ...product, stockGroupId: "group-1" }]);
    tx.productStockGroup.findMany.mockResolvedValue([{ id: "group-1", baseStock: 8, baseUnit: "pcs" }]);
    tx.productStockGroupActivity.findFirst.mockImplementation(async ({ where }) => where.type === "CONVERSION_RATE_CHANGED" ? { id: "change-1" } : null);
    await expect(repository.previewShoppingRequestDeletionRecord("sr-1", actor.storeId)).rejects.toThrow(/konversi.*berubah/i);
  });

  it("menolak grup dengan penyesuaian manual setelah penerimaan", async () => {
    const grouped = receipt();
    grouped.stockBundle.items[0].afterSnapshot.inboundReceiptImpact.stockGroupId = "group-1";
    tx.inventoryInboundReceipt.findMany.mockResolvedValue([grouped]);
    tx.product.findMany.mockResolvedValue([{ ...product, stockGroupId: "group-1" }]);
    tx.productStockGroup.findMany.mockResolvedValue([{ id: "group-1", baseStock: 8, baseUnit: "pcs" }]);
    tx.inventoryLog.findFirst.mockResolvedValue({ id: "regroup-adjustment" });
    await expect(repository.previewShoppingRequestDeletionRecord("sr-1", actor.storeId)).rejects.toThrow(/stok.*berubah|periksa.*manual/i);
    expect(tx.inventoryLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      productId: { in: ["p-1"] }, type: "ADJUSTMENT", reason: "MANUAL_ADJUSTMENT", createdAt: { gte: grouped.createdAt },
    }) }));
  });

  it("mengurangi saldo mendekati jumlah yang dibalik tanpa menghasilkan stok negatif", async () => {
    const fractional = receipt();
    fractional.lines[0].receivedQuantity = 0.1 + 0.2;
    fractional.stockBundle.items[0].afterSnapshot.inboundReceiptImpact.delta = 0.1 + 0.2;
    fractional.stockBundle.items[0].afterSnapshot.inboundReceiptImpact.baseDelta = 0.1 + 0.2;
    tx.inventoryInboundReceipt.findMany.mockResolvedValue([fractional]);
    tx.inventoryLog.findMany.mockResolvedValue([{ id: "log-1", productId: "p-1", type: "IN", reason: "RESTOCK", status: "APPROVED", quantity: 0.1 + 0.2 }]);
    tx.product.findMany.mockResolvedValue([{ ...product, stock: 0.3 }]);
    await repository.deleteShoppingRequestRecord("sr-1", "Salah catat", actor);
    expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ stock: { gte: 0.3 } }), data: { stock: { decrement: 0.3 } },
    }));
    expect(tx.inventoryLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quantity: 0.3, stockBaseDelta: -0.3 }),
    }));
    expect(tx.shoppingRequestDeletion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ details: { reversalLogs: [expect.objectContaining({ quantity: 0.3, baseQuantity: 0.3 })] } }),
    }));
  });

  it("membebaskan nama daftar yang dibatalkan tanpa mengubah nama riwayat", async () => {
    await repository.deleteShoppingRequestRecord("sr-1", "Salah catat", actor);
    expect(tx.shoppingRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "CANCELLED", normalizedName: null }),
    }));
  });

  it("mencatat jumlah pembalikan grup sama dengan pengurangan saat ada selisih pembulatan", async () => {
    const grouped = receipt();
    grouped.lines[0].receivedQuantity = 0.1;
    Object.assign(grouped.stockBundle.items[0].afterSnapshot.inboundReceiptImpact, { stockGroupId: "group-1", delta: 0.1, baseDelta: 0.1 });
    grouped.lines.push({ id: "line-2", productId: "p-2", inventoryLogId: "log-2", receivedQuantity: 0.2 });
    grouped.stockBundle.items.push({ productId: "p-2", inventoryLogId: "log-2", afterSnapshot: { unit: "pcs", inboundReceiptImpact: { kind: "CANONICAL", receiptId: "receipt-1", receiptLineId: "line-2", stockGroupId: "group-1", delta: 0.2, baseDelta: 0.2 } } });
    tx.inventoryInboundReceipt.findMany.mockResolvedValue([grouped]);
    tx.product.findMany.mockResolvedValue([{ ...product, stockGroupId: "group-1" }, { ...product, id: "p-2", stockGroupId: "group-1" }]);
    tx.productStockGroup.findMany.mockResolvedValue([{ id: "group-1", baseStock: 0.3, baseUnit: "pcs" }]);
    tx.inventoryLog.findMany.mockResolvedValue([
      { id: "log-1", productId: "p-1", type: "IN", reason: "RESTOCK", status: "APPROVED", quantity: 0.1 },
      { id: "log-2", productId: "p-2", type: "IN", reason: "RESTOCK", status: "APPROVED", quantity: 0.2 },
    ]);
    await repository.deleteShoppingRequestRecord("sr-1", "Salah catat", actor);
    const totalLogged = tx.inventoryLog.create.mock.calls.reduce((sum, [args]) => sum - args.data.stockBaseDelta, 0);
    expect(totalLogged).toBe(0.3);
    expect(tx.productStockGroup.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { baseStock: { decrement: totalLogged } } }));
  });

  it("tetap membalik stok ketika percobaan undo sebelumnya terblokir sebelum mutasi", async () => {
    const blocked = receipt();
    blocked.stockBundle.status = "UNDO_BLOCKED";
    tx.inventoryInboundReceipt.findMany.mockResolvedValue([blocked]);
    await expect(repository.deleteShoppingRequestRecord("sr-1", "Salah catat", actor)).resolves.toMatchObject({ status: "CANCELLED" });
    expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { stock: { decrement: 4 } } }));
    expect(tx.batchOperation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: ["COMMITTED", "UNDO_BLOCKED"] } }) }));
  });

  it("menolak jumlah dampak bundle yang tidak cocok dengan barang diterima", async () => {
    const incomplete = receipt();
    incomplete.stockBundle.items[0].afterSnapshot.inboundReceiptImpact.delta = 2;
    incomplete.stockBundle.items[0].afterSnapshot.inboundReceiptImpact.baseDelta = 2;
    tx.inventoryInboundReceipt.findMany.mockResolvedValue([incomplete]);
    await expect(repository.deleteShoppingRequestRecord("sr-1", "Salah catat", actor)).rejects.toThrow(/riwayat stok|dampak stok/i);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("menolak sumber log stok yang tidak cocok dengan produk penerimaan", async () => {
    tx.inventoryLog.findMany.mockResolvedValue([{ id: "log-1", productId: "p-lain", type: "IN", reason: "RESTOCK", status: "APPROVED", quantity: 4 }]);
    await expect(repository.deleteShoppingRequestRecord("sr-1", "Salah catat", actor)).rejects.toThrow(/riwayat stok|dampak stok/i);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("menolak penghapusan kedua tanpa membalik stok lagi", async () => {
    const remove = (repository as any).deleteShoppingRequestRecord;
    expect(remove).toBeTypeOf("function");
    tx.shoppingRequest.findFirst.mockResolvedValue({ id: "sr-1", number: "DPB-1", status: "CANCELLED", stockAppliedAt: null, items: [], deletion: { id: "old" } });
    await expect(remove("sr-1", "Ulang", actor)).rejects.toThrow(/sudah.*dibatalkan|sudah.*dihapus/i);
    expect(tx.inventoryLog.create).not.toHaveBeenCalled();
  });
});
