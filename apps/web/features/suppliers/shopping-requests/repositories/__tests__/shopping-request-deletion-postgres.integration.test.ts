import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@pos/db";
import { deleteShoppingRequestRecord, previewShoppingRequestDeletionRecord } from "../shopping-request-deletion-repository";
import { createGoodsPurchaseRecord } from "../../../goods-purchases/repositories/goods-purchases-repository";
import { listMergedPurchases } from "../../../backdated-purchases/repositories/backdated-purchase-list";

// Opt in only against the disposable local container created for this fixture.
const enabled = process.env.POS_SHOPPING_DELETION_INTEGRATION === "1";
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const actor = { id: `owner-${runId}`, name: "Pemilik Uji", storeId: `store-${runId}` };
const categoryId = `category-${runId}`;
let sequence = 0;

describe.skipIf(!enabled)("pembatalan daftar di PostgreSQL sementara", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/shopping_deletion_test") {
      throw new Error("Pengujian hanya boleh memakai database sementara khusus.");
    }
    await db.store.create({ data: { id: actor.storeId, name: "Toko Uji" } });
    await db.user.create({ data: { id: actor.id, username: actor.id, name: actor.name, role: "OWNER", storeId: actor.storeId } });
    await db.category.create({ data: { id: categoryId, name: `Kategori ${runId}` } });
  }, 30000);

  afterAll(async () => { await db.$disconnect(); });

  async function fixture(stock = 8) {
    const suffix = `${runId}-${++sequence}`;
    const requestId = `request-${suffix}`;
    const productId = `product-${suffix}`;
    const purchaseId = `purchase-${suffix}`;
    const receiptId = `receipt-${suffix}`;
    const lineId = `line-${suffix}`;
    const logId = `log-${suffix}`;
    const batchId = `batch-${suffix}`;
    await db.product.create({ data: { id: productId, sku: `SKU-${suffix}`, name: "Kertas", unit: "lembar", stock, price: 2000, costPrice: 1000, categoryId, storeId: actor.storeId } });
    await db.shoppingRequest.create({ data: { id: requestId, number: `DPB-${suffix}`, name: `Daftar ${suffix}`, normalizedName: `daftar ${suffix}`, sequence, storeId: actor.storeId, status: "APPROVED" } });
    await db.goodsPurchase.create({ data: { id: purchaseId, number: `PB-${suffix}`, sequence, storeId: actor.storeId, shoppingRequestId: requestId, activeShoppingRequestKey: requestId, supplierNameSnapshot: "Toko", status: "APPROVED", fulfillmentStatus: "PARTIALLY_RECEIVED", totalAmount: 4000, createdById: actor.id } });
    await db.expense.create({ data: { id: `expense-${suffix}`, storeId: actor.storeId, recordedById: actor.id, applicantName: actor.name, category: "SUPPLIES", amount: 4000, occurredAt: new Date(), goodsPurchaseId: purchaseId } });
    await db.inventoryLog.create({ data: { id: logId, productId, type: "IN", reason: "RESTOCK", quantity: 4, unitCost: 1000, createdBy: actor.id } });
    await db.batchOperation.create({ data: { id: batchId, type: "INBOUND_RECEIPT", status: "COMMITTED", storeId: actor.storeId, createdBy: actor.id, summary: { source: "INBOUND_RECEIPT", receiptId, goodsPurchaseId: purchaseId } } });
    await db.batchOperationItem.create({ data: { batchOperationId: batchId, productId, sku: `SKU-${suffix}`, action: "STOCK_IN", inventoryLogId: logId, afterSnapshot: { unit: "lembar", inboundReceiptImpact: { kind: "CANONICAL", receiptId, receiptLineId: lineId, stockGroupId: null, delta: 4, baseDelta: 4 } } } });
    await db.inventoryInboundReceipt.create({ data: { id: receiptId, storeId: actor.storeId, shoppingRequestId: requestId, goodsPurchaseId: purchaseId, stockBundleId: batchId, status: "APPROVED", lines: { create: { id: lineId, productId, status: "PARTIAL", expectedQuantity: 8, receivedQuantity: 4, productNameSnapshot: "Kertas", skuSnapshot: `SKU-${suffix}`, expectedQuantitySnapshot: 8, receivedQuantitySnapshot: 4, inventoryLogId: logId } } } });
    await db.inventoryInboundReceipt.create({ data: { id: `draft-${suffix}`, storeId: actor.storeId, shoppingRequestId: requestId, goodsPurchaseId: purchaseId, status: "DRAFT" } });
    return { requestId, productId, purchaseId, receiptId, batchId, suffix };
  }

  it("membalik penerimaan sebagian dan menyimpan pengeluaran serta harga", async () => {
    const f = await fixture();
    const preview = await previewShoppingRequestDeletionRecord(f.requestId, actor.storeId);
    expect(preview.movements).toMatchObject([{ productId: f.productId, baseQuantity: 4, unit: "lembar" }]);
    await deleteShoppingRequestRecord(f.requestId, "Salah catat", actor);
    const [product, purchase, receipt, draft, batch, expense, audit, logs] = await Promise.all([
      db.product.findUniqueOrThrow({ where: { id: f.productId } }),
      db.goodsPurchase.findUniqueOrThrow({ where: { id: f.purchaseId } }),
      db.inventoryInboundReceipt.findUniqueOrThrow({ where: { id: f.receiptId } }),
      db.inventoryInboundReceipt.findUniqueOrThrow({ where: { id: `draft-${f.suffix}` } }),
      db.batchOperation.findUniqueOrThrow({ where: { id: f.batchId } }),
      db.expense.findUniqueOrThrow({ where: { id: `expense-${f.suffix}` } }),
      db.shoppingRequestDeletion.findUniqueOrThrow({ where: { shoppingRequestId: f.requestId } }),
      db.inventoryLog.findMany({ where: { productId: f.productId, type: "OUT" } }),
    ]);
    expect([product.stock, Number(product.costPrice), Number(product.price)]).toEqual([4, 1000, 2000]);
    expect([purchase.status, receipt.status, draft.status, batch.status]).toEqual(["CANCELLED", "APPROVED", "CANCELLED", "UNDONE"]);
    expect([Number(expense.amount), expense.deletedAt, audit.reason]).toEqual([4000, null, "Salah catat"]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ type: "OUT", reason: "RESTOCK", quantity: 4, stockBaseDelta: -4 });
  }, 30000);

  it("menolak stok kurang tanpa perubahan", async () => {
    const f = await fixture(3);
    await expect(deleteShoppingRequestRecord(f.requestId, "Salah catat", actor)).rejects.toThrow(/stok.*tidak cukup/i);
    expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stock).toBe(3);
    expect(await db.shoppingRequestDeletion.count({ where: { shoppingRequestId: f.requestId } })).toBe(0);
  }, 30000);

  it("mempertahankan filter arsip dan membebaskan nama untuk daftar baru", async () => {
    const f = await fixture();
    const old = await db.shoppingRequest.findUniqueOrThrow({ where: { id: f.requestId } });
    await db.goodsPurchase.update({ where: { id: f.purchaseId }, data: { paymentMethod: "GIRO", paymentDueDate: new Date("2026-11-15T00:00:00Z") } });
    await deleteShoppingRequestRecord(f.requestId, "Salah catat", actor);
    const archived = await listMergedPurchases({
      storeId: actor.storeId, status: "CANCELLED", q: old.name, fulfillmentStatus: "PARTIALLY_RECEIVED",
      paymentMethod: "GIRO", paymentDueDate: "2026-11-15", skip: 0, take: 10,
    });
    expect(archived.requests.map((row) => row.id)).toContain(f.requestId);
    const replacement = await db.shoppingRequest.create({ data: {
      storeId: actor.storeId, name: old.name, normalizedName: old.name.toLowerCase(),
      number: `NEW-${f.suffix}`, sequence: 9999,
    } });
    expect(replacement.name).toBe(old.name);
    expect((await db.shoppingRequest.findUniqueOrThrow({ where: { id: f.requestId } })).name).toBe(old.name);
  }, 30000);

  it("membatalkan seluruh perubahan ketika penulisan audit pembalikan gagal", async () => {
    const f = await fixture();
    await expect(deleteShoppingRequestRecord(f.requestId, "Salah catat", { ...actor, id: "missing-user" })).rejects.toThrow();
    expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stock).toBe(8);
    expect((await db.batchOperation.findUniqueOrThrow({ where: { id: f.batchId } })).status).toBe("COMMITTED");
    expect(await db.inventoryLog.count({ where: { productId: f.productId, type: "OUT" } })).toBe(0);
    expect(await db.shoppingRequestDeletion.count({ where: { shoppingRequestId: f.requestId } })).toBe(0);
  }, 30000);

  it("dua penghapusan bersamaan menghasilkan satu pembalikan", async () => {
    const f = await fixture();
    const outcomes = await Promise.allSettled([
      deleteShoppingRequestRecord(f.requestId, "Pertama", actor),
      deleteShoppingRequestRecord(f.requestId, "Kedua", actor),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: f.productId } })).stock).toBe(4);
    expect(await db.inventoryLog.count({ where: { productId: f.productId, type: "OUT" } })).toBe(1);
    expect(await db.shoppingRequestDeletion.count({ where: { shoppingRequestId: f.requestId } })).toBe(1);
  }, 30000);

  it("tidak membuat pembelian baru ketika daftar dibatalkan bersamaan", async () => {
    const suffix = `${runId}-${++sequence}`;
    const requestId = `race-request-${suffix}`;
    const productId = `race-product-${suffix}`;
    const itemId = `race-item-${suffix}`;
    const supplierId = `supplier-${suffix}`;
    await db.supplier.create({ data: { id: supplierId, name: "Supplier Uji", type: "DISTRIBUTOR" } });
    await db.product.create({ data: { id: productId, sku: `RACE-${suffix}`, name: "Barang Uji", price: 100, stock: 5, categoryId, storeId: actor.storeId } });
    await db.shoppingRequest.create({ data: {
      id: requestId, number: `RACE-${suffix}`, name: `Race ${suffix}`, normalizedName: `race ${suffix}`,
      sequence, storeId: actor.storeId, supplierId, status: "APPROVED",
      items: { create: { id: itemId, productId, productName: "Barang Uji", stockOnHand: 5, requestedQty: 2, approvedQty: 2, decisionStatus: "APPROVED" } },
    } });
    let release!: () => void;
    let locked!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const hasLock = new Promise<void>((resolve) => { locked = resolve; });
    const blocker = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "pos_shopping_requests" WHERE id = ${requestId} FOR UPDATE`;
      locked();
      await released;
    }, { timeout: 20000 });
    await hasLock;
    const deleting = deleteShoppingRequestRecord(requestId, "Salah catat", actor);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const creating = createGoodsPurchaseRecord({ shoppingRequestId: requestId, items: [{ shoppingRequestItemId: itemId, productId, quantity: 2, latestUnitPrice: 100, updateMasterHpp: false }] }, actor, new Date());
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    await blocker;
    const [deleted, created] = await Promise.allSettled([deleting, creating]);
    expect(deleted.status).toBe("fulfilled");
    expect(created.status).toBe("rejected");
    expect(await db.goodsPurchase.count({ where: { shoppingRequestId: requestId } })).toBe(0);
  }, 30000);
});
