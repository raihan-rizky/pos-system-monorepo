import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, Prisma } from "@pos/db";
import { applyCorrectionStock } from "../shopping-request-correction-stock";
import { deleteShoppingRequestRecord } from "../shopping-request-deletion-repository";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import { POST as undoBatch } from "@/app/api/batch-operations/[id]/undo/route";
import { calculateReceivedPurchaseTotal } from "../received-quantity-repository";
import { loadCorrectionPaymentState } from "../shopping-request-correction-payment-state";
import { loadCorrectionReceiptSources } from "../shopping-request-correction-receipt-sources";
import { findShoppingRequestById, listShoppingRequests } from "../shopping-requests-repository";
import { findGoodsPurchaseById } from "@/features/suppliers/goods-purchases/repositories/goods-purchases-repository";
import { loadShoppingRequestCorrectionEditor } from "../shopping-request-correction-editor";
import { planShoppingRequestCorrection } from "../shopping-request-correction-plan";
import { commitShoppingRequestCorrectionRecord } from "../shopping-request-correction-repository";
import { refreshReceivedPurchaseTotal } from "../refresh-received-purchase-total";
import * as correctionFinance from "../shopping-request-correction-finance";
import type { ShoppingRequestCorrectionInput } from "../../types/shopping-request-correction";
import { previewGroupPricingChange, applyGroupPricingChange } from "@/features/product-stock-groups/group-pricing-service";

vi.mock("@/lib/rbac/guard", () => ({
  requireRole: async () => actor,
  requirePermission: async () => actor,
  handleAuthError: () => null,
}));

const enabled = process.env.POS_SHOPPING_CORRECTION_INTEGRATION === "1";
const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const actor = { id: `owner-${run}`, name: "Pemilik Uji", storeId: `store-${run}` };
const categoryId = `category-${run}`;
let next = 0;

describe.skipIf(!enabled)("penyesuaian stok koreksi di PostgreSQL sementara", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/shopping_correction_test") {
      throw new Error("Pengujian hanya boleh memakai database sementara khusus.");
    }
    await db.store.create({ data: { id: actor.storeId, name: "Toko Uji" } });
    await db.user.create({ data: { id: actor.id, username: actor.id, name: actor.name, role: "OWNER", storeId: actor.storeId } });
    await db.category.create({ data: { id: categoryId, name: `Kategori ${run}` } });
  });
  afterAll(async () => { await db.$disconnect(); });

  async function fixture(stock: number) {
    const key = `${run}-${++next}`;
    const ids = Object.fromEntries(["product", "request", "requestItem", "purchase", "purchaseItem", "receipt", "line", "log", "batch"].map((name) => [name, `${name}-${key}`])) as Record<"product" | "request" | "requestItem" | "purchase" | "purchaseItem" | "receipt" | "line" | "log" | "batch", string>;
    await db.product.create({ data: { id: ids.product, sku: `SKU-${key}`, name: "Kertas", unit: "lembar", stock, price: 2000, costPrice: 1000, categoryId, storeId: actor.storeId } });
    await db.shoppingRequest.create({ data: { id: ids.request, number: `DPB-${key}`, name: `Daftar ${key}`, sequence: next, storeId: actor.storeId, status: "APPROVED" } });
    await db.shoppingRequestItem.create({ data: { id: ids.requestItem, shoppingRequestId: ids.request, productId: ids.product, productName: "Kertas", unit: "lembar", stockOnHand: 0, requestedQty: 10, approvedQty: 10, decisionStatus: "APPROVED" } });
    await db.goodsPurchase.create({ data: { id: ids.purchase, number: `PB-${key}`, sequence: next, storeId: actor.storeId, shoppingRequestId: ids.request, activeShoppingRequestKey: ids.request, supplierNameSnapshot: "Toko", status: "APPROVED", fulfillmentStatus: "RECEIVED", totalAmount: 10000, createdById: actor.id } });
    await db.goodsPurchaseItem.create({ data: { id: ids.purchaseItem, goodsPurchaseId: ids.purchase, shoppingRequestItemId: ids.requestItem, productId: ids.product, productNameSnapshot: "Kertas", skuSnapshot: `SKU-${key}`, unitSnapshot: "lembar", unitMultiplierSnapshot: 1, quantity: 10, latestUnitPrice: 1000, lineTotal: 10000 } });
    await db.inventoryLog.create({ data: { id: ids.log, productId: ids.product, type: "IN", reason: "RESTOCK", quantity: 10, unitCost: 1000, createdBy: actor.id, stockBaseDelta: 10, unitMultiplierSnapshot: 1 } });
    await db.batchOperation.create({ data: { id: ids.batch, type: "INBOUND_RECEIPT", status: "COMMITTED", storeId: actor.storeId, createdBy: actor.id, summary: { source: "INBOUND_RECEIPT", receiptId: ids.receipt, goodsPurchaseId: ids.purchase } } });
    await db.batchOperationItem.create({ data: { batchOperationId: ids.batch, productId: ids.product, sku: `SKU-${key}`, action: "STOCK_IN", inventoryLogId: ids.log, afterSnapshot: { unit: "lembar", inboundReceiptImpact: { kind: "CANONICAL", receiptId: ids.receipt, receiptLineId: ids.line, stockGroupId: null, delta: 10, baseDelta: 10 } } } });
    await db.inventoryInboundReceipt.create({ data: { id: ids.receipt, storeId: actor.storeId, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, stockBundleId: ids.batch, status: "APPROVED", lines: { create: { id: ids.line, productId: ids.product, shoppingRequestItemId: ids.requestItem, goodsPurchaseItemId: ids.purchaseItem, status: "RECEIVED", expectedQuantity: 10, receivedQuantity: 10, productNameSnapshot: "Kertas", skuSnapshot: `SKU-${key}`, expectedQuantitySnapshot: 10, receivedQuantitySnapshot: 10, inventoryLogId: ids.log } } } });
    return ids;
  }

  async function correct(ids: Awaited<ReturnType<typeof fixture>>, oldReceivedQty: number, newReceivedQty: number, key: string) {
    return db.$transaction(async (tx) => {
      const audit = await tx.shoppingRequestCorrection.create({ data: { storeId: actor.storeId, shoppingRequestId: ids.request, actorId: actor.id, reason: "Salah catat", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: {}, preview: {} } });
      return applyCorrectionStock(tx, { storeId: actor.storeId, requestId: ids.request, correctionId: audit.id, actor, reason: "Salah catat", changes: [{ productId: ids.product, shoppingRequestItemId: ids.requestItem, goodsPurchaseItemId: ids.purchaseItem, receiptLineId: ids.line, oldReceivedQty, newReceivedQty }] });
    });
  }

  it("mengurangi stok sesuai selisih dan mempertahankan penerimaan asal", async () => {
    const ids = await fixture(8);
    await correct(ids, 10, 7, "koreksi-1");
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(5);
    expect((await db.inventoryInboundReceiptLine.findUniqueOrThrow({ where: { id: ids.line } })).receivedQuantity).toBe(10);
    const movements = await db.shoppingRequestCorrectionMovement.findMany({ where: { receiptLineId: ids.line } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ oldReceivedQty: 10, newReceivedQty: 7, baseDelta: -3 });
    const log = await db.inventoryLog.findUniqueOrThrow({ where: { id: movements[0].inventoryLogId! } });
    expect(log).toMatchObject({ productId: ids.product, type: "OUT", quantity: 3, stockBaseDelta: -3 });
  });

  it("menolak pengurangan saat stok tidak cukup tanpa menyimpan audit atau pergerakan", async () => {
    const ids = await fixture(2);
    await expect(correct(ids, 10, 7, "stok-kurang")).rejects.toThrow(/stok.*tidak cukup/i);
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(2);
    expect(await db.shoppingRequestCorrection.count({ where: { shoppingRequestId: ids.request } })).toBe(0);
  });

  it("memakai jumlah efektif terakhir untuk koreksi berikutnya", async () => {
    const ids = await fixture(8);
    await correct(ids, 10, 7, "pertama");
    await correct(ids, 7, 9, "kedua");
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(7);
    await expect(correct(ids, 10, 8, "usang")).rejects.toThrow(/berubah|muat ulang/i);
  });

  it("menyiapkan jumlah efektif tiap sumber penerimaan untuk formulir koreksi", async () => {
    const ids = await fixture(20);
    await correct(ids, 10, 7, "sumber-pertama");
    await correct(ids, 7, 9, "sumber-kedua");
    await db.$transaction(async (tx) => {
      const audit = await tx.shoppingRequestCorrection.create({ data: { storeId: actor.storeId, shoppingRequestId: ids.request, actorId: actor.id, reason: "Penerimaan tambahan", idempotencyKey: "sumber-baru", requestFingerprint: "sumber-baru", beforeSnapshot: {}, afterSnapshot: {}, preview: {} } });
      await applyCorrectionStock(tx, { storeId: actor.storeId, requestId: ids.request, correctionId: audit.id, actor, reason: "Penerimaan tambahan", changes: [{ productId: ids.product, shoppingRequestItemId: ids.requestItem, goodsPurchaseItemId: ids.purchaseItem, receiptLineId: null, oldReceivedQty: 0, newReceivedQty: 1 }] });
    });
    const sources = await db.$transaction((tx) => loadCorrectionReceiptSources(tx, { storeId: actor.storeId, purchaseId: ids.purchase }));
    expect(sources).toEqual([{
      requestItemId: ids.requestItem, purchaseItemId: ids.purchaseItem, productId: ids.product,
      receipts: [{ receiptLineId: ids.line, receivedQty: 9 }, { receiptLineId: null, receivedQty: 1 }],
    }]);
    await expect(db.$transaction((tx) => loadCorrectionReceiptSources(tx, { storeId: "toko-lain", purchaseId: ids.purchase }))).rejects.toThrow(/pembelian/i);
  });

  it("menghitung penerimaan rusak tanpa log stok sebagai nol sebelum dikoreksi", async () => {
    const ids = await fixture(20);
    await db.inventoryInboundReceipt.update({ where: { id: ids.receipt }, data: { stockBundleId: null } });
    await db.inventoryInboundReceiptLine.update({ where: { id: ids.line }, data: { status: "DAMAGED", inventoryLogId: null } });

    await correct(ids, 0, 3, "koreksi-barang-rusak");

    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(23);
    const sources = await db.$transaction((tx) => loadCorrectionReceiptSources(tx, { storeId: actor.storeId, purchaseId: ids.purchase }));
    expect(sources[0].receipts).toEqual([{ receiptLineId: ids.line, receivedQty: 3 }]);
  });

  it("mengembalikan hanya stok hasil koreksi ketika daftar penerimaan rusak dihapus", async () => {
    const ids = await fixture(20);
    await db.inventoryInboundReceipt.update({ where: { id: ids.receipt }, data: { stockBundleId: null } });
    await db.inventoryInboundReceiptLine.update({ where: { id: ids.line }, data: { status: "DAMAGED", inventoryLogId: null } });
    await correct(ids, 0, 3, "koreksi-rusak-sebelum-hapus");

    await deleteShoppingRequestRecord(ids.request, "Salah daftar", actor);

    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(20);
  });

  it("mempertahankan sumber penerimaan saat barang ditandai dihapus dan ditambahkan kembali", async () => {
    const ids = await fixture(20);
    await db.$executeRaw`UPDATE "pos_shopping_request_items" SET "removedAt" = CURRENT_TIMESTAMP WHERE "id" = ${ids.requestItem}`;
    await db.$executeRaw`UPDATE "pos_goods_purchase_items" SET "removedAt" = CURRENT_TIMESTAMP WHERE "id" = ${ids.purchaseItem}`;
    const [saved] = await db.$queryRaw<Array<{ shoppingRequestItemId: string | null; goodsPurchaseItemId: string | null }>>`
      SELECT "shoppingRequestItemId", "goodsPurchaseItemId" FROM "pos_inventory_inbound_receipt_lines" WHERE "id" = ${ids.line}`;
    expect(saved).toEqual({ shoppingRequestItemId: ids.requestItem, goodsPurchaseItemId: ids.purchaseItem });
    await db.$executeRaw`UPDATE "pos_shopping_request_items" SET "removedAt" = NULL WHERE "id" = ${ids.requestItem}`;
    await db.$executeRaw`UPDATE "pos_goods_purchase_items" SET "removedAt" = NULL WHERE "id" = ${ids.purchaseItem}`;
    expect(await db.goodsPurchaseItem.count({ where: { goodsPurchaseId: ids.purchase, productId: ids.product } })).toBe(1);
  });

  it("menyembunyikan barang yang dihapus dari rincian dan jumlah barang daftar", async () => {
    const ids = await fixture(20);
    const activeProductId = `active-${ids.product}`;
    const activeItemId = `active-${ids.requestItem}`;
    await db.product.create({ data: { id: activeProductId, sku: `SKU-${activeProductId}`, name: "Barang aktif", unit: "pcs", stock: 0, price: 2000, costPrice: 1000, categoryId, storeId: actor.storeId } });
    await db.shoppingRequestItem.create({ data: { id: activeItemId, shoppingRequestId: ids.request, productId: activeProductId, productName: "Barang aktif", unit: "pcs", stockOnHand: 0, requestedQty: 4, approvedQty: 4, decisionStatus: "APPROVED" } });
    await db.shoppingRequestItem.update({ where: { id: ids.requestItem }, data: { removedAt: new Date() } });
    await db.goodsPurchaseItem.update({ where: { id: ids.purchaseItem }, data: { removedAt: new Date() } });

    const detail = await findShoppingRequestById(ids.request, actor.storeId);
    expect(detail?.items.map((item) => item.id)).toEqual([activeItemId]);
    const [summary] = await listShoppingRequests({ storeId: actor.storeId, ids: [ids.request], skip: 0, take: 10 });
    expect(summary).toMatchObject({ itemCount: 1, totalRequestedQty: 4, totalApprovedQty: 4 });
    expect((await db.inventoryInboundReceiptLine.findUniqueOrThrow({ where: { id: ids.line } })).goodsPurchaseItemId).toBe(ids.purchaseItem);
  });

  it("tidak menawarkan barang yang dihapus pada pembelian dan penerimaan berikutnya", async () => {
    const ids = await fixture(20);
    const productId = `new-${ids.product}`;
    const requestItemId = `new-${ids.requestItem}`;
    const purchaseItemId = `new-${ids.purchaseItem}`;
    await db.product.create({ data: { id: productId, sku: `SKU-${productId}`, name: "Barang baru", unit: "pcs", stock: 0, price: 2000, costPrice: 1000, categoryId, storeId: actor.storeId } });
    await db.shoppingRequestItem.create({ data: { id: requestItemId, shoppingRequestId: ids.request, productId, productName: "Barang baru", unit: "pcs", stockOnHand: 0, requestedQty: 4, approvedQty: 4, decisionStatus: "APPROVED" } });
    await db.goodsPurchaseItem.create({ data: { id: purchaseItemId, goodsPurchaseId: ids.purchase, shoppingRequestItemId: requestItemId, productId, productNameSnapshot: "Barang baru", skuSnapshot: `SKU-${productId}`, unitSnapshot: "pcs", unitMultiplierSnapshot: 1, quantity: 4, latestUnitPrice: 1000, lineTotal: 4000 } });
    await correct(ids, 10, 0, "hapus-barang-lama");
    await db.shoppingRequestItem.update({ where: { id: ids.requestItem }, data: { removedAt: new Date() } });
    await db.goodsPurchaseItem.update({ where: { id: ids.purchaseItem }, data: { removedAt: new Date() } });
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { totalBasis: "RECEIVED", fulfillmentStatus: "NOT_RECEIVED" } });

    expect((await findGoodsPurchaseById(ids.purchase, actor.storeId))?.items.map((item) => item.id)).toEqual([purchaseItemId]);
    const repository = new InventoryInboundReceiptRepository();
    expect((await repository.listReceivingQueue(actor.storeId, { goodsPurchaseId: ids.purchase })).map((item) => item.itemId)).toEqual([purchaseItemId]);
    const forReceipt = await db.$transaction((tx) => repository.findGoodsPurchaseForReceipt(tx, { storeId: actor.storeId, goodsPurchaseId: ids.purchase }));
    expect(forReceipt?.items.map((item) => item.id)).toEqual([purchaseItemId]);
    const fulfillment = await db.$transaction((tx) => repository.listGoodsPurchaseFulfillmentItems(tx, { storeId: actor.storeId, goodsPurchaseId: ids.purchase }));
    expect(fulfillment).toEqual([{ orderedQuantity: 4, approvedReceivedQuantity: 0 }]);
    expect((await repository.getGoodsPurchaseReceivingComparison(actor.storeId, ids.purchase))?.items.map((item) => item.goodsPurchaseItemId)).toEqual([purchaseItemId]);
  });

  it("memuat data edit berdasarkan penerimaan efektif dan mendeteksi perubahan stok", async () => {
    const ids = await fixture(20);
    await correct(ids, 10, 7, "editor-penerimaan");
    const audit = await db.shoppingRequestCorrection.findFirstOrThrow({ where: { shoppingRequestId: ids.request } });
    await db.shoppingRequestCorrection.update({ where: { id: audit.id }, data: { afterSnapshot: { paymentSnapshot: { sources: [], allocations: [] } } } });
    const load = () => db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));

    const editor = await load();
    expect(editor).toMatchObject({ requestId: ids.request, purchaseId: ids.purchase, items: [{ productId: ids.product, orderedQty: 10, receipts: [{ receiptLineId: ids.line, receivedQty: 7 }] }] });
    expect(editor.version).toMatch(/^[a-f0-9]{64}$/);
    await db.product.update({ where: { id: ids.product }, data: { stock: { increment: 1 } } });
    expect((await load()).version).not.toBe(editor.version);
    await expect(db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: "toko-lain", requestId: ids.request }))).rejects.toThrow(/daftar.*tidak/i);
  });

  it("membaca versi terbaru setelah pembaruan pembelian bersamaan selesai", async () => {
    const ids = await fixture(20);
    let release!: () => void;
    let ready!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { ready = resolve; });
    const writer = db.$transaction(async (tx) => {
      await tx.goodsPurchase.update({ where: { id: ids.purchase }, data: { totalAmount: 9000 } });
      ready();
      await hold;
    }, { timeout: 30000 });
    await locked;
    const reader = db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }), { timeout: 30000 });
    try {
      const deadline = Date.now() + 10000;
      let waiting = false;
      while (!waiting && Date.now() < deadline) {
        const [state] = await db.$queryRaw<Array<{ waiting: number }>>`
          SELECT COUNT(*)::int AS waiting FROM pg_stat_activity
          WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%pos_goods_purchases%'`;
        waiting = state.waiting > 0;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
    } finally {
      release();
      await writer;
    }
    const result = await reader;
    const latest = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    expect(result.version).toBe(latest.version);
  }, 30000);

  it("memuat pembayaran Transfer lama yang terhubung melalui daftar belanja", async () => {
    const ids = await fixture(20);
    const expenseId = `legacy-expense-${ids.request}`;
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER" } });
    await db.expense.create({ data: { id: expenseId, storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, applicantName: "Toko", category: "SUPPLIES", amount: 10000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    expect(editor.payment.sources).toEqual([{ paymentId: expenseId, sourceKind: "TRANSFER_EXPENSE", amount: "10000.00", paidAt: "2026-10-01" }]);
  });

  it("meninjau selisih stok dan total dari jumlah diterima, lalu menolak versi usang", async () => {
    const ids = await fixture(20);
    await correct(ids, 10, 7, "preview-awal");
    const audit = await db.shoppingRequestCorrection.findFirstOrThrow({ where: { shoppingRequestId: ids.request } });
    await db.shoppingRequestCorrection.update({ where: { id: audit.id }, data: { afterSnapshot: { paymentSnapshot: { sources: [], allocations: [] } } } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const input = {
      idempotencyKey: "preview-1", expectedVersion: editor.version, reason: "Jumlah dan harga salah", header: editor.header,
      items: [{ ...editor.items[0], unitPrice: "2000.00", receipts: [{ receiptLineId: ids.line, receivedQty: 5 }] }],
      payment: { method: null, dueDate: null, allocations: [], corrections: [] }, catalog: [],
    };
    const plan = await db.$transaction((tx) => planShoppingRequestCorrection(tx, { storeId: actor.storeId, requestId: ids.request, data: input }));
    expect(plan.preview).toMatchObject({ oldTotal: "10000.00", newTotal: "10000.00", paid: "0.00", overpaid: "0.00", stock: [{ productId: ids.product, baseDelta: -2, unit: "lembar" }] });
    await db.product.update({ where: { id: ids.product }, data: { stock: { increment: 1 } } });
    await expect(db.$transaction((tx) => planShoppingRequestCorrection(tx, { storeId: actor.storeId, requestId: ids.request, data: input }))).rejects.toThrow(/berubah|muat ulang/i);
  });

  it("memungkinkan koreksi pembelian sebelum penerimaan pertama tanpa membuat stok atau pengeluaran", async () => {
    const ids = await fixture(20);
    await db.inventoryInboundReceiptLine.deleteMany({ where: { receiptId: ids.receipt } });
    await db.inventoryInboundReceipt.delete({ where: { id: ids.receipt } });
    await db.batchOperationItem.deleteMany({ where: { batchOperationId: ids.batch } });
    await db.batchOperation.delete({ where: { id: ids.batch } });
    await db.inventoryLog.delete({ where: { id: ids.log } });
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { fulfillmentStatus: "NOT_RECEIVED", totalBasis: "ORDERED", paymentMethod: null } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const data = {
      idempotencyKey: "pra-penerimaan", expectedVersion: editor.version, reason: "Koreksi sebelum barang datang", header: editor.header,
      items: [{ ...editor.items[0], orderedQty: 8, unitPrice: "1100.00", receipts: [] }],
      payment: { method: null, dueDate: null, allocations: [], corrections: [] }, catalog: [],
    };
    const result = await db.$transaction((tx) => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data }), { timeout: 30000 });
    expect(result.preview.newTotal).toBe("8800.00");
    expect(await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } })).toMatchObject({ totalAmount: new Prisma.Decimal(8800), totalBasis: "ORDERED", paymentMethod: null });
    expect(await db.expense.count({ where: { goodsPurchaseId: ids.purchase, deletedAt: null } })).toBe(0);
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(20);

    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER" } });
    await db.expense.create({ data: { id: `pre-receipt-expense-${ids.purchase}`, storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 8800, occurredAt: new Date("2026-11-01T00:00:00.000Z") } });
    await db.inventoryLog.create({ data: { id: ids.log, productId: ids.product, type: "IN", reason: "RESTOCK", quantity: 4, unitCost: 1100, createdBy: actor.id, stockBaseDelta: 4, unitMultiplierSnapshot: 1 } });
    await db.batchOperation.create({ data: { id: ids.batch, type: "INBOUND_RECEIPT", status: "COMMITTED", storeId: actor.storeId, createdBy: actor.id, summary: { source: "INBOUND_RECEIPT", receiptId: ids.receipt, goodsPurchaseId: ids.purchase } } });
    await db.batchOperationItem.create({ data: { batchOperationId: ids.batch, productId: ids.product, sku: `SKU-${ids.product}`, action: "STOCK_IN", inventoryLogId: ids.log, afterSnapshot: { unit: "lembar", inboundReceiptImpact: { kind: "CANONICAL", receiptId: ids.receipt, receiptLineId: ids.line, stockGroupId: null, delta: 4, baseDelta: 4 } } } });
    await db.inventoryInboundReceipt.create({ data: { id: ids.receipt, storeId: actor.storeId, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, stockBundleId: ids.batch, status: "APPROVED", lines: { create: { id: ids.line, productId: ids.product, shoppingRequestItemId: ids.requestItem, goodsPurchaseItemId: ids.purchaseItem, status: "RECEIVED", expectedQuantity: 8, receivedQuantity: 4, productNameSnapshot: "Kertas", skuSnapshot: `SKU-${ids.product}`, expectedQuantitySnapshot: 8, receivedQuantitySnapshot: 4, inventoryLogId: ids.log } } } });
    await db.$transaction((tx) => refreshReceivedPurchaseTotal(tx, { storeId: actor.storeId, purchaseId: ids.purchase }));
    const refreshed = await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } });
    expect(refreshed.totalAmount.toFixed(2)).toBe("4400.00");
    expect(refreshed.totalBasis).toBe("RECEIVED");
    expect((await db.expense.findUniqueOrThrow({ where: { id: `pre-receipt-expense-${ids.purchase}` } })).amount.toFixed(2)).toBe("4400.00");
    const paymentState = await db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId: actor.storeId, purchaseId: ids.purchase }));
    expect(paymentState.paid).toBe("8800.00");
  }, 30000);

  it("penerimaan pertama nol setelah koreksi tidak membuat pengeluaran atau pembayaran", async () => {
    const ids = await fixture(20);
    await db.inventoryInboundReceiptLine.deleteMany({ where: { receiptId: ids.receipt } });
    await db.inventoryInboundReceipt.delete({ where: { id: ids.receipt } });
    await db.batchOperationItem.deleteMany({ where: { batchOperationId: ids.batch } });
    await db.batchOperation.delete({ where: { id: ids.batch } });
    await db.inventoryLog.delete({ where: { id: ids.log } });
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { totalBasis: "ORDERED", paymentMethod: null, fulfillmentStatus: "NOT_RECEIVED" } });
    const editor = await db.$transaction(tx => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    await db.$transaction(tx => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data: { idempotencyKey: "zero-first", expectedVersion: editor.version, reason: "Koreksi pesanan", header: editor.header, items: editor.items, payment: { method: null, dueDate: null, allocations: [], corrections: [] }, catalog: [] } }));
    await db.inventoryInboundReceipt.create({ data: { id: ids.receipt, storeId: actor.storeId, goodsPurchaseId: ids.purchase, shoppingRequestId: ids.request, status: "APPROVED", lines: { create: { productId: ids.product, goodsPurchaseItemId: ids.purchaseItem, shoppingRequestItemId: ids.requestItem, status: "RECEIVED", expectedQuantity: 10, receivedQuantity: 0, expectedQuantitySnapshot: 10, receivedQuantitySnapshot: 0, productNameSnapshot: "Kertas", skuSnapshot: ids.product } } } });
    await db.$transaction(tx => refreshReceivedPurchaseTotal(tx, { storeId: actor.storeId, purchaseId: ids.purchase }));
    const purchase = await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } });
    expect(purchase.totalAmount.toFixed(2)).toBe("0.00");
    expect(purchase.totalBasis).toBe("RECEIVED");
    expect(await db.expense.count({ where: { goodsPurchaseId: ids.purchase } })).toBe(0);
  });

  it("mengoreksi jadwal campuran beberapa Giro serta menjaga Transfer ketika penerimaan berkurang", async () => {
    const ids = await fixture(20);
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: null, initialTransferAmount: 3000, initialTransferPaidAt: new Date("2026-11-01") } });
    await db.expense.create({ data: { id: `mixed-${ids.purchase}`, storeId: actor.storeId, recordedById: actor.id, goodsPurchaseId: ids.purchase, shoppingRequestId: ids.request, category: "SUPPLIES", applicantName: "Toko", amount: 10000, occurredAt: new Date("2026-11-01") } });
    await db.supplierPayable.create({ data: { id: `mixed-debt-${ids.purchase}`, storeId: actor.storeId, goodsPurchaseId: ids.purchase, supplierName: "Toko", amount: 7000, debtDate: new Date("2026-11-01"), dueDate: new Date("2026-12-01"), giroHistoryVerifiedAt: new Date(), createdById: actor.id } });
    const schedule = [
      { method: "TRANSFER" as const, amount: "3000.00", dueDate: null, note: "DP" },
      { method: "GIRO" as const, amount: "3000.00", dueDate: "2026-12-01", note: "Awal" },
      { method: "GIRO" as const, amount: "4000.00", dueDate: "2026-12-15", note: "Akhir" },
    ];
    await db.goodsPurchasePayment.createMany({ data: schedule.map(row => ({ ...row, goodsPurchaseId: ids.purchase, dueDate: row.dueDate ? new Date(row.dueDate) : null })) });
    const editor = await db.$transaction(tx => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    expect(editor.payment.sources).toMatchObject([{ amount: "3000.00" }]);
    const corrected = [schedule[0], { ...schedule[1], amount: "2000.00" }, { ...schedule[2], amount: "2000.00", dueDate: "2026-12-20", note: "Diubah" }];
    const result = await db.$transaction(tx => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data: {
      idempotencyKey: "mixed-correction", expectedVersion: editor.version, reason: "Koreksi jadwal", header: editor.header,
      items: [{ ...editor.items[0], receipts: [{ receiptLineId: ids.line, receivedQty: 7 }] }],
      payment: { method: null, dueDate: null, schedule: corrected, allocations: editor.payment.allocations, corrections: [] }, catalog: [],
    } }), { timeout: 30000 });
    expect(result.preview).toMatchObject({ newTotal: "7000.00", paid: "3000.00" });
    expect((await db.supplierPayable.findUniqueOrThrow({ where: { id: `mixed-debt-${ids.purchase}` } })).amount.toFixed(2)).toBe("7000.00");
    expect(await db.goodsPurchasePayment.findMany({ where: { goodsPurchaseId: ids.purchase }, orderBy: [{ dueDate: "asc" }] })).toHaveLength(3);
    await db.$transaction(tx => refreshReceivedPurchaseTotal(tx, { storeId: actor.storeId, purchaseId: ids.purchase }));
    expect((await db.$transaction(tx => loadCorrectionPaymentState(tx, { storeId: actor.storeId, purchaseId: ids.purchase }))).paid).toBe("3000.00");
    const audit = await db.shoppingRequestCorrection.findUniqueOrThrow({ where: { id: result.correctionId } });
    expect(audit.afterSnapshot).toMatchObject({ data: { payment: { schedule: corrected } } });
    const receiptId = `mixed-later-${ids.receipt}`, batchId = `mixed-later-${ids.batch}`, logId = `mixed-later-${ids.log}`;
    await db.inventoryLog.create({ data: { id: logId, productId: ids.product, type: "IN", reason: "RESTOCK", quantity: 2, unitCost: 1000, createdBy: actor.id } });
    await db.batchOperation.create({ data: { id: batchId, type: "INBOUND_RECEIPT", status: "COMMITTED", storeId: actor.storeId, createdBy: actor.id, summary: { source: "INBOUND_RECEIPT", receiptId, goodsPurchaseId: ids.purchase } } });
    await db.inventoryInboundReceipt.create({ data: { id: receiptId, storeId: actor.storeId, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, stockBundleId: batchId, status: "APPROVED", lines: { create: { productId: ids.product, shoppingRequestItemId: ids.requestItem, goodsPurchaseItemId: ids.purchaseItem, status: "RECEIVED", expectedQuantity: 3, receivedQuantity: 2, productNameSnapshot: "Kertas", skuSnapshot: ids.product, expectedQuantitySnapshot: 3, receivedQuantitySnapshot: 2, inventoryLogId: logId } } } });
    await db.$transaction(tx => refreshReceivedPurchaseTotal(tx, { storeId: actor.storeId, purchaseId: ids.purchase }));
    const rows = await db.goodsPurchasePayment.findMany({ where: { goodsPurchaseId: ids.purchase } });
    expect(rows.find(row => row.method === "TRANSFER")!.amount.toFixed(2)).toBe("3000.00");
    expect(rows.find(row => row.note === "Diubah")!.amount.toFixed(2)).toBe("4000.00");
    expect((await db.batchOperation.findUniqueOrThrow({ where: { id: batchId } })).summary).toMatchObject({ paymentScheduleAdjustment: { policy: "LATEST_GIRO_FIRST", before: corrected } });
    expect((await db.$transaction(tx => loadCorrectionPaymentState(tx, { storeId: actor.storeId, purchaseId: ids.purchase }))).paid).toBe("3000.00");
  });

  it("memperingatkan kelebihan pembayaran tanpa mengubah stok atau pengeluaran saat pratinjau", async () => {
    const ids = await fixture(20);
    const expenseId = `preview-expense-${ids.request}`;
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER" } });
    await db.expense.create({ data: { id: expenseId, storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 10000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const input = {
      idempotencyKey: "preview-lebih", expectedVersion: editor.version, reason: "Jumlah salah", header: editor.header,
      items: [{ ...editor.items[0], receipts: [{ receiptLineId: ids.line, receivedQty: 7 }] }],
      payment: { method: "TRANSFER" as const, dueDate: null, allocations: editor.payment.allocations, corrections: [] }, catalog: [],
    };
    const plan = await db.$transaction((tx) => planShoppingRequestCorrection(tx, { storeId: actor.storeId, requestId: ids.request, data: input }));
    expect(plan.preview).toMatchObject({ oldTotal: "10000.00", newTotal: "7000.00", paid: "10000.00", overpaid: "3000.00" });
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(20);
    expect((await db.expense.findUniqueOrThrow({ where: { id: expenseId } })).amount.toFixed(2)).toBe("10000.00");
  });

  it("menjumlah penerimaan pecahan secara desimal sebelum membulatkan harga", async () => {
    const ids = await fixture(20);
    await correct(ids, 10, 0.3, "preview-pecahan");
    const audit = await db.shoppingRequestCorrection.findFirstOrThrow({ where: { shoppingRequestId: ids.request } });
    await db.shoppingRequestCorrection.update({ where: { id: audit.id }, data: { afterSnapshot: { paymentSnapshot: { sources: [], allocations: [] } } } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const input = {
      idempotencyKey: "preview-pecahan-harga", expectedVersion: editor.version, reason: "Koreksi", header: editor.header,
      items: [{ ...editor.items[0], unitPrice: "0.05", receipts: [{ receiptLineId: ids.line, receivedQty: 0.3 }, { receiptLineId: null, receivedQty: 0.6 }] }],
      payment: { method: null, dueDate: null, allocations: [], corrections: [] }, catalog: [],
    };
    const plan = await db.$transaction((tx) => planShoppingRequestCorrection(tx, { storeId: actor.storeId, requestId: ids.request, data: input }));
    expect(plan.preview.newTotal).toBe("0.05");
  });

  it("menyimpan koreksi stok dan keuangan sekali meskipun permintaan diulang", async () => {
    const ids = await fixture(20);
    const expenseId = `commit-expense-${ids.request}`;
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER" } });
    await db.expense.create({ data: { id: expenseId, storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 10000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const input = {
      idempotencyKey: "simpan-sekali", expectedVersion: editor.version, reason: "Jumlah salah", header: editor.header,
      items: [{ ...editor.items[0], receipts: [{ receiptLineId: ids.line, receivedQty: 7 }] }],
      payment: { method: "TRANSFER" as const, dueDate: null, allocations: editor.payment.allocations, corrections: [] }, catalog: [],
    };
    const commit = () => db.$transaction((tx) => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data: input }), { timeout: 30000 });
    const [first, second] = await Promise.all([commit(), commit()]);
    expect(second.correctionId).toBe(first.correctionId);
    expect((await commit()).correctionId).toBe(first.correctionId);
    await expect(db.$transaction((tx) => commitShoppingRequestCorrectionRecord(tx, {
      requestId: ids.request, actor, data: { ...input, reason: "Alasan berbeda" },
    }))).rejects.toThrow(/kunci koreksi/i);
    expect(first.preview).toMatchObject({ newTotal: "7000.00", paid: "10000.00", overpaid: "3000.00" });
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(17);
    expect((await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } })).totalAmount.toFixed(2)).toBe("7000.00");
    expect((await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } })).fulfillmentStatus).toBe("PARTIALLY_RECEIVED");
    expect((await db.expense.findUniqueOrThrow({ where: { id: expenseId } })).amount.toFixed(2)).toBe("7000.00");
    expect((await db.inventoryInboundReceiptLine.findUniqueOrThrow({ where: { id: ids.line } })).receivedQuantity).toBe(10);
    expect(await db.shoppingRequestCorrection.count({ where: { shoppingRequestId: ids.request } })).toBe(1);
    expect(await db.shoppingRequestCorrectionMovement.count({ where: { correctionId: first.correctionId } })).toBe(1);
  });

  it("membatalkan stok dan audit jika penyesuaian keuangan gagal", async () => {
    const ids = await fixture(20);
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER" } });
    await db.expense.create({ data: { storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 10000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const data = {
      idempotencyKey: "gagal-keuangan", expectedVersion: editor.version, reason: "Jumlah salah", header: editor.header,
      items: [{ ...editor.items[0], receipts: [{ receiptLineId: ids.line, receivedQty: 7 }] }],
      payment: { method: "TRANSFER" as const, dueDate: null, allocations: editor.payment.allocations, corrections: [] }, catalog: [],
    };
    const failure = vi.spyOn(correctionFinance, "applyCorrectionFinance").mockRejectedValueOnce(new Error("Keuangan uji gagal"));
    try {
      await expect(db.$transaction((tx) => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data }), { timeout: 30000 }))
        .rejects.toThrow("Keuangan uji gagal");
    } finally {
      failure.mockRestore();
    }
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(20);
    expect((await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } })).totalAmount.toFixed(2)).toBe("10000.00");
    expect(await db.shoppingRequestCorrection.count({ where: { shoppingRequestId: ids.request } })).toBe(0);
  }, 30000);

  it("mengoreksi harga pembelian dan memperingatkan kelebihan tanpa mengubah harga katalog", async () => {
    const ids = await fixture(20);
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER" } });
    await db.expense.create({ data: { storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 10000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const data = {
      idempotencyKey: "harga-beli", expectedVersion: editor.version, reason: "Harga salah", header: editor.header,
      items: [{ ...editor.items[0], unitPrice: "700.00" }],
      payment: { method: "TRANSFER" as const, dueDate: null, allocations: editor.payment.allocations, corrections: [] }, catalog: [],
    };
    const result = await db.$transaction((tx) => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data }), { timeout: 30000 });
    expect(result.preview).toMatchObject({ newTotal: "7000.00", paid: "10000.00", overpaid: "3000.00" });
    const item = await db.goodsPurchaseItem.findUniqueOrThrow({ where: { id: ids.purchaseItem } });
    expect(item.latestUnitPrice.toFixed(2)).toBe("700.00");
    expect(item.lineTotal.toFixed(2)).toBe("7000.00");
    const product = await db.product.findUniqueOrThrow({ where: { id: ids.product } });
    expect(product.stock).toBe(20);
    expect(product.costPrice?.toFixed(2)).toBe("1000.00");
    expect(product.price.toFixed(2)).toBe("2000.00");
    expect(await db.shoppingRequestCorrectionMovement.count({ where: { correctionId: result.correctionId } })).toBe(0);
  }, 30000);

  it("meninjau dan mencatat perubahan HPP serta harga jual katalog yang dipilih", async () => {
    const ids = await fixture(20);
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER" } });
    await db.expense.create({ data: { storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 10000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const data = {
      idempotencyKey: "harga-katalog", expectedVersion: editor.version, reason: "Harga salah", header: editor.header,
      items: [{ ...editor.items[0], unitPrice: "700.00" }],
      payment: { method: "TRANSFER" as const, dueDate: null, allocations: editor.payment.allocations, corrections: [] },
      catalog: [{ productId: ids.product, costPrice: "700.00", salePrice: "1800.00", expectedUpdatedAt: editor.items[0].catalogUpdatedAt }],
    };
    const plan = await db.$transaction((tx) => planShoppingRequestCorrection(tx, { storeId: actor.storeId, requestId: ids.request, data }));
    expect(plan.preview.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "katalog.Kertas.HPP", before: "1000.00", after: "700.00" }),
      expect.objectContaining({ field: "katalog.Kertas.hargaJual", before: "2000.00", after: "1800.00" }),
    ]));
    const result = await db.$transaction((tx) => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data }), { timeout: 30000 });
    expect(result.preview.changes).toEqual(plan.preview.changes);
    const product = await db.product.findUniqueOrThrow({ where: { id: ids.product } });
    expect(product.costPrice?.toFixed(2)).toBe("700.00");
    expect(product.price.toFixed(2)).toBe("1800.00");
    const logs = await db.productPriceLog.findMany({ where: { productId: ids.product }, orderBy: { field: "asc" } });
    expect(logs.map((log) => ({ field: log.field, before: log.oldValue?.toFixed(2), after: log.newValue?.toFixed(2) }))).toEqual([
      { field: "PRICE", before: "2000.00", after: "1800.00" },
      { field: "COST_PRICE", before: "1000.00", after: "700.00" },
    ]);
  }, 30000);

  it("meninjau seluruh dampak katalog grup dan menyinkronkan harga otomatis", async () => {
    const ids = await fixture(20);
    const groupId = `pricing-${ids.product}`;
    const packId = `pack-${ids.product}`;
    await db.productStockGroup.create({ data: { id: groupId, storeId: actor.storeId, groupKey: groupId, displayName: "Kertas", baseUnit: "lembar", baseStock: 20 } });
    await db.product.update({ where: { id: ids.product }, data: { stockGroupId: groupId, unitMultiplierToBase: 1 } });
    await db.product.create({ data: { id: packId, storeId: actor.storeId, categoryId, name: "Kertas pak", sku: packId, unit: "pak", stock: 0, stockGroupId: groupId, unitMultiplierToBase: 10, price: 20000, costPrice: 10000 } });
    const changes = { sourceProductId: ids.product, members: [{ productId: packId, mode: "AUTO" as const }] };
    await db.$transaction(async tx => {
      const p = await previewGroupPricingChange(tx, { storeId: actor.storeId, groupId, changes });
      await applyGroupPricingChange(tx, { storeId: actor.storeId, groupId, changes, expectedVersion: p.version, expectedProjection: p.projectionToken, actor });
    });
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER" } });
    await db.expense.create({ data: { storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 10000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    const editor = await db.$transaction(tx => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const data = {
      idempotencyKey: "katalog-grup", expectedVersion: editor.version, reason: "Harga acuan salah", header: editor.header,
      items: [{ ...editor.items[0], unitPrice: "700.00" }],
      payment: { method: "TRANSFER" as const, dueDate: null, allocations: editor.payment.allocations, corrections: [] },
      catalog: [{ productId: ids.product, costPrice: "700.00", salePrice: "1800.00", expectedUpdatedAt: editor.items[0].catalogUpdatedAt }],
    };
    const plan = await db.$transaction(tx => planShoppingRequestCorrection(tx, { storeId: actor.storeId, requestId: ids.request, data }));
    expect(plan.preview.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "katalog.Kertas pak.HPP", before: "10000.00", after: "7000.00" }),
      expect.objectContaining({ field: "katalog.Kertas pak.hargaJual", before: "20000.00", after: "18000.00" }),
    ]));
    await db.$transaction(tx => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data }), { timeout: 30000 });
    const pack = await db.product.findUniqueOrThrow({ where: { id: packId } });
    expect(pack.costPrice?.toFixed(2)).toBe("7000.00");
    expect(pack.price.toFixed(2)).toBe("18000.00");
    expect(await db.productPriceLog.count({ where: { productId: packId, note: `Koreksi daftar belanja ${ids.request}` } })).toBe(2);
  }, 30000);

  it("memindahkan tanggal laporan dan pemasok saat data usaha dikoreksi", async () => {
    const ids = await fixture(20);
    const supplier = await db.supplier.create({ data: { name: `Pemasok baru ${ids.request}`, type: "DISTRIBUTOR" } });
    await db.shoppingRequest.update({ where: { id: ids.request }, data: { businessDate: new Date("2026-10-01T00:00:00.000Z") } });
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER" } });
    const expense = await db.expense.create({ data: { storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Pemasok lama", category: "SUPPLIES", amount: 10000, occurredAt: new Date("2026-10-01T03:00:00.000Z") } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const data = {
      idempotencyKey: "koreksi-data-usaha", expectedVersion: editor.version, reason: "Tanggal dan pemasok salah",
      header: { ...editor.header, name: "Daftar terkoreksi", number: `KOR-${ids.request}`, businessDate: "2026-10-05", supplierId: supplier.id },
      items: editor.items, payment: { method: "TRANSFER" as const, dueDate: null, allocations: editor.payment.allocations, corrections: [] }, catalog: [],
    };
    const result = await db.$transaction((tx) => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data }), { timeout: 30000 });
    expect(result.preview.affectedDates).toEqual(expect.arrayContaining(["2026-10-01", "2026-10-05"]));
    const savedRequest = await db.shoppingRequest.findUniqueOrThrow({ where: { id: ids.request } });
    const savedPurchase = await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } });
    const savedExpense = await db.expense.findUniqueOrThrow({ where: { id: expense.id } });
    expect(savedRequest).toMatchObject({ name: "Daftar terkoreksi", normalizedName: "daftar terkoreksi", number: `KOR-${ids.request}`, supplierId: supplier.id });
    expect(savedPurchase).toMatchObject({ supplierId: supplier.id, supplierNameSnapshot: supplier.name });
    expect(savedExpense.applicantName).toBe(supplier.name);
    expect(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(savedExpense.occurredAt)).toBe("2026-10-05");
    expect(savedExpense.createdAt).toEqual(expense.createdAt);
  }, 30000);

  it("menyimpan jumlah kebutuhan, pesanan, dan penerimaan secara terpisah", async () => {
    const ids = await fixture(20);
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER" } });
    await db.expense.create({ data: { storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 10000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const data = {
      idempotencyKey: "jumlah-terpisah", expectedVersion: editor.version, reason: "Jumlah salah", header: editor.header,
      items: [{ ...editor.items[0], requestedQty: 12, approvedQty: 9, orderedQty: 8, receipts: [{ receiptLineId: ids.line, receivedQty: 7 }] }],
      payment: { method: "TRANSFER" as const, dueDate: null, allocations: editor.payment.allocations, corrections: [] }, catalog: [],
    };
    const result = await db.$transaction((tx) => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data }), { timeout: 30000 });
    expect(result.preview.newTotal).toBe("7000.00");
    const requestItem = await db.shoppingRequestItem.findUniqueOrThrow({ where: { id: ids.requestItem } });
    expect(requestItem).toMatchObject({ requestedQty: 12, approvedQty: 9 });
    const purchaseItem = await db.goodsPurchaseItem.findUniqueOrThrow({ where: { id: ids.purchaseItem } });
    expect(purchaseItem.quantity).toBe(8);
    expect(purchaseItem.lineTotal.toFixed(2)).toBe("8000.00");
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(17);
    expect((await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } })).fulfillmentStatus).toBe("PARTIALLY_RECEIVED");
  }, 30000);

  it("menghapus barang diterima dengan membalikkan stok tanpa menghapus sumber penerimaan", async () => {
    const ids = await fixture(20);
    const productId = `sisa-${ids.product}`;
    const requestItemId = `sisa-${ids.requestItem}`;
    const purchaseItemId = `sisa-${ids.purchaseItem}`;
    await db.product.create({ data: { id: productId, sku: productId, name: "Barang tersisa", unit: "pcs", stock: 5, price: 2000, costPrice: 1000, categoryId, storeId: actor.storeId } });
    await db.shoppingRequestItem.create({ data: { id: requestItemId, shoppingRequestId: ids.request, productId, productName: "Barang tersisa", unit: "pcs", stockOnHand: 5, requestedQty: 4, approvedQty: 4, decisionStatus: "APPROVED" } });
    await db.goodsPurchaseItem.create({ data: { id: purchaseItemId, goodsPurchaseId: ids.purchase, shoppingRequestItemId: requestItemId, productId, productNameSnapshot: "Barang tersisa", skuSnapshot: productId, unitSnapshot: "pcs", unitMultiplierSnapshot: 1, quantity: 4, latestUnitPrice: 1000, lineTotal: 4000 } });
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER", totalAmount: 14000 } });
    await db.expense.create({ data: { storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 14000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const data = {
      idempotencyKey: "hapus-barang", expectedVersion: editor.version, reason: "Barang salah", header: editor.header,
      items: editor.items.filter((item) => item.productId === productId),
      payment: { method: "TRANSFER" as const, dueDate: null, allocations: editor.payment.allocations, corrections: [] }, catalog: [],
    };
    const result = await db.$transaction((tx) => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data }), { timeout: 30000 });
    expect(result.preview).toMatchObject({ newTotal: "0.00", paid: "14000.00", overpaid: "14000.00" });
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(10);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(5);
    expect((await db.shoppingRequestItem.findUniqueOrThrow({ where: { id: ids.requestItem } })).removedAt).not.toBeNull();
    expect((await db.goodsPurchaseItem.findUniqueOrThrow({ where: { id: ids.purchaseItem } })).removedAt).not.toBeNull();
    expect((await db.inventoryInboundReceiptLine.findUniqueOrThrow({ where: { id: ids.line } })).receivedQuantity).toBe(10);
    expect((await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } })).fulfillmentStatus).toBe("NOT_RECEIVED");
  }, 30000);

  it.each([2, 0])("menambahkan barang dengan jumlah diterima %s yang dipilih pengguna", async (receivedQty) => {
    const ids = await fixture(20);
    const productId = `tambahan-${ids.product}`;
    await db.product.create({ data: { id: productId, sku: productId, name: "Barang tambahan", unit: "pcs", stock: 5, price: 2000, costPrice: 500, categoryId, storeId: actor.storeId } });
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER" } });
    await db.expense.create({ data: { storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 10000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const data = {
      idempotencyKey: "tambah-barang", expectedVersion: editor.version, reason: "Barang terlewat", header: editor.header,
      items: [...editor.items, { clientLineKey: "barang-baru", requestItemId: null, purchaseItemId: null, productId, unit: "pcs", requestedQty: 4, approvedQty: 4, orderedQty: 4, unitPrice: "500.00", receipts: [{ receiptLineId: null, receivedQty }] }],
      payment: { method: "TRANSFER" as const, dueDate: null, allocations: editor.payment.allocations, corrections: [] }, catalog: [],
    };
    const result = await db.$transaction((tx) => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data }), { timeout: 30000 });
    expect(result.preview).toMatchObject({ newTotal: receivedQty ? "11000.00" : "10000.00", paid: "10000.00", overpaid: "0.00" });
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(receivedQty ? 7 : 5);
    const requestItem = await db.shoppingRequestItem.findFirstOrThrow({ where: { shoppingRequestId: ids.request, productId, removedAt: null } });
    const purchaseItem = await db.goodsPurchaseItem.findFirstOrThrow({ where: { goodsPurchaseId: ids.purchase, productId, removedAt: null } });
    expect(purchaseItem.shoppingRequestItemId).toBe(requestItem.id);
    expect(purchaseItem.quantity).toBe(4);
    const sources = await db.$transaction((tx) => loadCorrectionReceiptSources(tx, { storeId: actor.storeId, purchaseId: ids.purchase }));
    expect(sources.find((source) => source.purchaseItemId === purchaseItem.id)?.receipts).toEqual(receivedQty ? [{ receiptLineId: null, receivedQty: 2 }] : []);
    expect(await db.shoppingRequestCorrectionMovement.count({ where: { correctionId: result.correctionId, productId } })).toBe(receivedQty ? 1 : 0);
    expect((await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } })).fulfillmentStatus).toBe("PARTIALLY_RECEIVED");
  }, 30000);

  async function additionFixture() {
    const ids = await fixture(20);
    const productId = `tambahan-${ids.product}`;
    await db.product.create({ data: { id: productId, sku: productId, name: "Barang tambahan", unit: "pcs", stock: 5, price: 2000, costPrice: 500, categoryId, storeId: actor.storeId } });
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER" } });
    await db.expense.create({ data: { storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 10000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    const editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const item = { clientLineKey: "barang-baru", requestItemId: null, purchaseItemId: null, productId, unit: "pcs", requestedQty: 4, approvedQty: 4, orderedQty: 4, unitPrice: "500.00", receipts: [{ receiptLineId: null, receivedQty: 2 }] };
    const data = { idempotencyKey: "tambah-barang", expectedVersion: editor.version, reason: "Barang terlewat", header: editor.header, items: [...editor.items, item], payment: { method: "TRANSFER" as const, dueDate: null, allocations: editor.payment.allocations, corrections: [] }, catalog: [] };
    const commit = (input: ShoppingRequestCorrectionInput = data) => db.$transaction((tx) => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data: input }), { timeout: 30000 });
    return { ids, productId, data, item, commit };
  }

  it("mengganti produk dengan membalik seluruh penerimaan lama tanpa menghapus sumbernya", async () => {
    const { ids, productId, data, item, commit } = await additionFixture();
    await commit({ ...data, items: [item] });
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(10);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(7);
    expect((await db.goodsPurchaseItem.findUniqueOrThrow({ where: { id: ids.purchaseItem } })).removedAt).not.toBeNull();
    expect((await db.inventoryInboundReceiptLine.findUniqueOrThrow({ where: { id: ids.line } })).receivedQuantity).toBe(10);
    expect((await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } })).totalAmount.toFixed(2)).toBe("1000.00");
  }, 30000);

  it("mengaktifkan kembali identitas barang lama sesudah dihapus tanpa menggandakan penerimaan", async () => {
    const { ids, productId, data, item, commit } = await additionFixture();
    await commit();
    const original = await db.goodsPurchaseItem.findFirstOrThrow({ where: { goodsPurchaseId: ids.purchase, productId } });
    let editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    await commit({ ...data, idempotencyKey: "hapus-tambahan", expectedVersion: editor.version, items: editor.items.filter((entry) => entry.productId !== productId) });
    editor = await db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const input = { ...data, idempotencyKey: "aktifkan-tambahan", expectedVersion: editor.version, items: [...editor.items, item] };
    const [first, retry] = await Promise.all([commit(input), commit(input)]);
    expect(first.correctionId).toBe(retry.correctionId);
    const active = await db.goodsPurchaseItem.findFirstOrThrow({ where: { goodsPurchaseId: ids.purchase, productId, removedAt: null } });
    expect(active.id).toBe(original.id);
    expect(active.shoppingRequestItemId).toBe(original.shoppingRequestItemId);
    expect(await db.shoppingRequestItem.count({ where: { shoppingRequestId: ids.request, productId } })).toBe(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(7);
    const sources = await db.$transaction((tx) => loadCorrectionReceiptSources(tx, { storeId: actor.storeId, purchaseId: ids.purchase }));
    expect(sources.find((source) => source.purchaseItemId === original.id)?.receipts).toEqual([{ receiptLineId: null, receivedQty: 2 }]);
  }, 30000);

  it("membatalkan barang baru dan stoknya jika keuangan gagal setelah penambahan", async () => {
    const { ids, productId, commit } = await additionFixture();
    const failure = vi.spyOn(correctionFinance, "applyCorrectionFinance").mockRejectedValueOnce(new Error("Keuangan uji gagal"));
    try { await expect(commit()).rejects.toThrow("Keuangan uji gagal"); } finally { failure.mockRestore(); }
    expect(await db.goodsPurchaseItem.count({ where: { goodsPurchaseId: ids.purchase, productId } })).toBe(0);
    expect(await db.shoppingRequestItem.count({ where: { shoppingRequestId: ids.request, productId } })).toBe(0);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(5);
    expect(await db.shoppingRequestCorrection.count({ where: { shoppingRequestId: ids.request } })).toBe(0);
  }, 30000);

  it("menolak produk baru bersatuan lain tanpa meninggalkan audit atau stok", async () => {
    const { ids, productId, data, item, commit } = await additionFixture();
    await expect(commit({ ...data, items: [...data.items.slice(0, 1), { ...item, unit: "dus" }] })).rejects.toThrow(/perubahan|satuan/i);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(5);
    expect(await db.shoppingRequestCorrection.count({ where: { shoppingRequestId: ids.request } })).toBe(0);
  }, 30000);

  it("menolak penyimpanan bila barang baru berubah setelah pratinjau", async () => {
    const { ids, productId, data, commit } = await additionFixture();
    const reviewed = await db.$transaction(tx => planShoppingRequestCorrection(tx, { storeId: actor.storeId, requestId: ids.request, data }));
    await db.product.update({ where: { id: productId }, data: { stock: { increment: 1 } } });
    await expect(commit({ ...data, expectedPreviewVersion: reviewed.preview.version })).rejects.toThrow(/pratinjau|berubah|tinjau/i);
    expect(await db.shoppingRequestCorrection.count({ where: { shoppingRequestId: ids.request } })).toBe(0);
  }, 30000);

  it("menambah varian grup bersama dari dua daftar bersamaan tanpa stok ganda atau deadlock", async () => {
    const first = await additionFixture();
    const second = await additionFixture();
    const groupId = `group-${first.productId}`;
    await db.productStockGroup.create({ data: { id: groupId, storeId: actor.storeId, groupKey: groupId, displayName: "Grup tambahan", baseUnit: "pcs", baseStock: 100 } });
    await db.product.update({ where: { id: first.productId }, data: { stockGroupId: groupId, unitMultiplierToBase: 10 } });
    await db.product.update({ where: { id: second.productId }, data: { stockGroupId: groupId, unitMultiplierToBase: 1 } });
    const additions = [first.item, { ...second.item, clientLineKey: "barang-baru-kedua" }];
    const results = await Promise.all([
      first.commit({ ...first.data, items: [first.data.items[0], ...additions] }),
      second.commit({ ...second.data, items: [second.data.items[0], ...[...additions].reverse()] }),
    ]);
    expect(results[0].correctionId).not.toBe(results[1].correctionId);
    expect((await db.productStockGroup.findUniqueOrThrow({ where: { id: groupId } })).baseStock).toBe(144);
    const movements = await db.shoppingRequestCorrectionMovement.findMany({ where: { correctionId: { in: results.map((result) => result.correctionId) } } });
    expect(movements.map((entry) => entry.baseDelta).sort((a, b) => a - b)).toEqual([2, 2, 20, 20]);
    expect((await db.product.findUniqueOrThrow({ where: { id: first.productId } })).stock).toBe(5);
  }, 30000);

  it("mengganti satuan melalui varian katalog dengan stok bersih nol meskipun stok sudah terpakai", async () => {
    const ids = await fixture(0);
    const groupId = `replace-unit-${ids.product}`;
    const unitId = `small-unit-${ids.product}`;
    await db.productStockGroup.create({ data: { id: groupId, storeId: actor.storeId, groupKey: groupId, displayName: "Kertas", baseUnit: "lembar", baseStock: 0 } });
    await db.product.update({ where: { id: ids.product }, data: { stockGroupId: groupId, unit: "pak", unitMultiplierToBase: 10 } });
    await db.goodsPurchaseItem.update({ where: { id: ids.purchaseItem }, data: { unitSnapshot: "pak", unitMultiplierSnapshot: 10 } });
    await db.shoppingRequestItem.update({ where: { id: ids.requestItem }, data: { unit: "pak" } });
    await db.inventoryLog.update({ where: { id: ids.log }, data: { stockGroupIdSnapshot: groupId, unitMultiplierSnapshot: 10, stockBaseDelta: 100 } });
    await db.batchOperationItem.updateMany({ where: { batchOperationId: ids.batch }, data: { afterSnapshot: { unit: "pak", inboundReceiptImpact: { kind: "CANONICAL", receiptId: ids.receipt, receiptLineId: ids.line, stockGroupId: groupId, delta: 10, baseDelta: 100 } } } });
    await db.product.create({ data: { id: unitId, storeId: actor.storeId, categoryId, sku: unitId, name: "Kertas lembar", unit: "lembar", stockGroupId: groupId, unitMultiplierToBase: 1, stock: 0, price: 200, costPrice: 100 } });
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { paymentMethod: "TRANSFER" } });
    await db.expense.create({ data: { storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 10000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    const editor = await db.$transaction(tx => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const data = {
      idempotencyKey: "ganti-satuan", expectedVersion: editor.version, reason: "Satuan seharusnya lembar", header: editor.header,
      items: [{ clientLineKey: "satuan-baru", requestItemId: null, purchaseItemId: null, productId: unitId, unit: "lembar", requestedQty: 100, approvedQty: 100, orderedQty: 100, unitPrice: "100.00", receipts: [{ receiptLineId: null, receivedQty: 100 }] }],
      payment: { method: "TRANSFER" as const, dueDate: null, allocations: editor.payment.allocations, corrections: [] }, catalog: [],
    };
    const result = await db.$transaction(tx => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data }), { timeout: 30000 });
    expect(result.preview.newTotal).toBe("10000.00");
    expect((await db.productStockGroup.findUniqueOrThrow({ where: { id: groupId } })).baseStock).toBe(0);
    expect((await db.inventoryInboundReceiptLine.findUniqueOrThrow({ where: { id: ids.line } })).receivedQuantity).toBe(10);
    expect((await db.goodsPurchaseItem.findUniqueOrThrow({ where: { id: ids.purchaseItem } })).removedAt).not.toBeNull();
    expect((await db.shoppingRequestCorrectionMovement.findMany({ where: { correctionId: result.correctionId } })).map(row => row.baseDelta).sort((a,b) => a-b)).toEqual([-100,100]);
    await expect(deleteShoppingRequestRecord(ids.request, "Daftar dibatalkan", actor)).rejects.toThrow(/stok.*tidak cukup/i);
    expect((await db.productStockGroup.findUniqueOrThrow({ where: { id: groupId } })).baseStock).toBe(0);
  }, 30000);

  it("menolak relasi grup produk baru yang berubah selama menunggu kunci stok", async () => {
    const { ids, productId, commit } = await additionFixture();
    const groupId = `group-${productId}`;
    await db.productStockGroup.create({ data: { id: groupId, storeId: actor.storeId, groupKey: groupId, displayName: "Konversi baru", baseUnit: "pcs", baseStock: 100 } });
    let ready!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => { ready = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const writer = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "pos_products" WHERE "id" = ${productId} FOR UPDATE`;
      ready();
      await hold;
      await tx.product.update({ where: { id: productId }, data: { stockGroupId: groupId, unitMultiplierToBase: 10 } });
    }, { timeout: 30000 });
    await locked;
    const result = commit();
    const rejected = expect(result).rejects.toThrow(/grup stok berubah|konversi/i);
    try {
      const deadline = Date.now() + 10000;
      let waiting = false;
      while (!waiting && Date.now() < deadline) {
        const [state] = await db.$queryRaw<Array<{ waiting: number }>>`
          SELECT COUNT(*)::int AS waiting FROM pg_stat_activity
          WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%pos_products%'`;
        waiting = state.waiting > 0;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
    } finally { release(); await writer; }
    await rejected;
    expect((await db.productStockGroup.findUniqueOrThrow({ where: { id: groupId } })).baseStock).toBe(100);
    expect(await db.goodsPurchaseItem.count({ where: { goodsPurchaseId: ids.purchase, productId } })).toBe(0);
    expect(await db.shoppingRequestCorrection.count({ where: { shoppingRequestId: ids.request } })).toBe(0);
  }, 30000);

  it("menghitung status penerimaan dari jumlah efektif setelah koreksi", async () => {
    const ids = await fixture(20);
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { totalBasis: "RECEIVED" } });
    await correct(ids, 10, 7, "koreksi-status");
    const repository = new InventoryInboundReceiptRepository();
    const rows = await db.$transaction((tx) => repository.listGoodsPurchaseFulfillmentItems(tx, { storeId: actor.storeId, goodsPurchaseId: ids.purchase }));
    expect(rows).toEqual([{ orderedQuantity: 10, approvedReceivedQuantity: 7 }]);
  });

  it("menolak menghitung penerimaan yang sumber stoknya sudah dibalik", async () => {
    const ids = await fixture(20);
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { totalBasis: "RECEIVED" } });
    await db.batchOperation.update({ where: { id: ids.batch }, data: { status: "UNDONE" } });
    const repository = new InventoryInboundReceiptRepository();
    await expect(db.$transaction((tx) => repository.listGoodsPurchaseFulfillmentItems(tx, { storeId: actor.storeId, goodsPurchaseId: ids.purchase })))
      .rejects.toThrow(/penerimaan|stok/i);
  });

  it("menghitung total pembelian dari penerimaan terkoreksi dan penerimaan berikutnya", async () => {
    const ids = await fixture(20);
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { totalBasis: "RECEIVED" } });
    await correct(ids, 10, 7, "koreksi-total");
    const calculateNow = () => db.$transaction((tx) => calculateReceivedPurchaseTotal(tx, { storeId: actor.storeId, purchaseId: ids.purchase }));
    expect(await calculateNow()).toEqual({ previousTotal: "10000.00", receivedTotal: "7000.00" });
    const receiptId = `lanjut-${ids.receipt}`;
    const logId = `lanjut-${ids.log}`;
    const batchId = `lanjut-${ids.batch}`;
    await db.inventoryLog.create({ data: { id: logId, productId: ids.product, type: "IN", reason: "RESTOCK", quantity: 3, unitCost: 1000, createdBy: actor.id } });
    await db.batchOperation.create({ data: { id: batchId, type: "INBOUND_RECEIPT", status: "COMMITTED", storeId: actor.storeId, createdBy: actor.id, summary: { source: "INBOUND_RECEIPT", receiptId, goodsPurchaseId: ids.purchase } } });
    await db.inventoryInboundReceipt.create({ data: { id: receiptId, storeId: actor.storeId, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, stockBundleId: batchId, status: "APPROVED", lines: { create: { productId: ids.product, shoppingRequestItemId: ids.requestItem, goodsPurchaseItemId: ids.purchaseItem, status: "RECEIVED", expectedQuantity: 3, receivedQuantity: 3, productNameSnapshot: "Kertas", skuSnapshot: ids.product, expectedQuantitySnapshot: 3, receivedQuantitySnapshot: 3, inventoryLogId: logId } } } });
    expect(await calculateNow()).toEqual({ previousTotal: "10000.00", receivedTotal: "10000.00" });
  });

  it("memperbarui total dan pengeluaran setelah penerimaan lanjutan tanpa mengubah pembayaran asal", async () => {
    const ids = await fixture(20);
    const expenseId = `expense-${ids.purchase}`;
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { totalBasis: "RECEIVED", totalAmount: 7000, paymentMethod: "TRANSFER" } });
    await db.goodsPurchasePayment.create({ data: { id: `schedule-${ids.purchase}`, goodsPurchaseId: ids.purchase, method: "TRANSFER", amount: 7000 } });
    await db.expense.create({ data: { id: expenseId, storeId: actor.storeId, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 7000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    await correct(ids, 10, 7, "koreksi-penerimaan-lanjutan");
    const audit = await db.shoppingRequestCorrection.findFirstOrThrow({ where: { shoppingRequestId: ids.request } });
    const source = { paymentId: expenseId, sourceKind: "TRANSFER_EXPENSE" as const, amount: "10000.00", paidAt: "2026-10-01" };
    const allocation = { paymentId: expenseId, sourceKind: "TRANSFER_EXPENSE" as const, amount: "10000.00", method: "TRANSFER" as const };
    await db.shoppingRequestCorrection.update({ where: { id: audit.id }, data: { afterSnapshot: { paymentSnapshot: { sources: [source], allocations: [allocation] } }, allocations: { create: { ...allocation, sourceAmount: source.amount, paidAt: new Date("2026-10-01T00:00:00.000Z"), details: {} } } } });
    const receiptId = `lanjut-keuangan-${ids.receipt}`;
    const logId = `lanjut-keuangan-${ids.log}`;
    const batchId = `lanjut-keuangan-${ids.batch}`;
    await db.inventoryLog.create({ data: { id: logId, productId: ids.product, type: "IN", reason: "RESTOCK", quantity: 3, unitCost: 1000, createdBy: actor.id } });
    await db.batchOperation.create({ data: { id: batchId, type: "INBOUND_RECEIPT", status: "COMMITTED", storeId: actor.storeId, createdBy: actor.id, summary: { source: "INBOUND_RECEIPT", receiptId, goodsPurchaseId: ids.purchase } } });
    await db.inventoryInboundReceipt.create({ data: { id: receiptId, storeId: actor.storeId, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, stockBundleId: batchId, status: "APPROVED", lines: { create: { productId: ids.product, shoppingRequestItemId: ids.requestItem, goodsPurchaseItemId: ids.purchaseItem, status: "RECEIVED", expectedQuantity: 3, receivedQuantity: 3, productNameSnapshot: "Kertas", skuSnapshot: ids.product, expectedQuantitySnapshot: 3, receivedQuantitySnapshot: 3, inventoryLogId: logId } } } });

    const repository = new InventoryInboundReceiptRepository();
    await db.$transaction((tx) => repository.updateGoodsPurchaseFulfillment(tx, { storeId: actor.storeId, goodsPurchaseId: ids.purchase, fulfillmentStatus: "RECEIVED" }));

    expect((await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } })).totalAmount.toFixed(2)).toBe("10000.00");
    expect((await db.expense.findUniqueOrThrow({ where: { id: expenseId } })).amount.toFixed(2)).toBe("10000.00");
    expect((await db.goodsPurchasePayment.findUniqueOrThrow({ where: { id: `schedule-${ids.purchase}` } })).amount.toFixed(2)).toBe("10000.00");
    expect((await db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId: actor.storeId, purchaseId: ids.purchase }))).paid).toBe("10000.00");
  });

  it("menolak pengeluaran toko lain dan membatalkan pembaruan status serta total", async () => {
    const ids = await fixture(20);
    const otherStore = `lain-${ids.request}`;
    const expenseId = `expense-lain-${ids.purchase}`;
    await db.store.create({ data: { id: otherStore, name: "Toko Lain" } });
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { totalBasis: "RECEIVED", fulfillmentStatus: "PARTIALLY_RECEIVED" } });
    await db.expense.create({ data: { id: expenseId, storeId: otherStore, recordedById: actor.id, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, applicantName: "Toko", category: "SUPPLIES", amount: 10000, occurredAt: new Date("2026-10-01T00:00:00.000Z") } });
    await correct(ids, 10, 7, "koreksi-toko-lain");
    const audit = await db.shoppingRequestCorrection.findFirstOrThrow({ where: { shoppingRequestId: ids.request } });
    await db.shoppingRequestCorrection.update({ where: { id: audit.id }, data: { afterSnapshot: { paymentSnapshot: { sources: [], allocations: [] } } } });

    const repository = new InventoryInboundReceiptRepository();
    await expect(db.$transaction((tx) => repository.updateGoodsPurchaseFulfillment(tx, { storeId: actor.storeId, goodsPurchaseId: ids.purchase, fulfillmentStatus: "RECEIVED" }))).rejects.toThrow(/toko|pengeluaran/i);
    const purchase = await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } });
    expect(purchase.fulfillmentStatus).toBe("PARTIALLY_RECEIVED");
    expect(purchase.totalAmount.toFixed(2)).toBe("10000.00");
    expect((await db.expense.findUniqueOrThrow({ where: { id: expenseId } })).amount.toFixed(2)).toBe("10000.00");
  });

  it("memakai jumlah efektif pada antrean, rincian, dan validasi penerimaan berikutnya", async () => {
    const ids = await fixture(20);
    await db.goodsPurchase.update({ where: { id: ids.purchase }, data: { totalBasis: "RECEIVED", fulfillmentStatus: "PARTIALLY_RECEIVED" } });
    await correct(ids, 10, 7, "koreksi-tersisa");
    const submitted = await db.inventoryInboundReceipt.create({ data: {
      storeId: actor.storeId, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, status: "SUBMITTED",
      lines: { create: { productId: ids.product, shoppingRequestItemId: ids.requestItem, goodsPurchaseItemId: ids.purchaseItem, status: "RECEIVED", reviewStatus: "PENDING", expectedQuantity: 3, receivedQuantity: 3, productNameSnapshot: "Kertas", skuSnapshot: ids.product, expectedQuantitySnapshot: 3, receivedQuantitySnapshot: 3 } },
    } });
    const repository = new InventoryInboundReceiptRepository();
    const [purchase, receipt] = await db.$transaction(async (tx) => Promise.all([
      repository.findGoodsPurchaseForReceipt(tx, { storeId: actor.storeId, goodsPurchaseId: ids.purchase }),
      repository.findReceiptForFinalization(tx, { storeId: actor.storeId, receiptId: submitted.id }),
    ]));
    const queue = await repository.listReceivingQueue(actor.storeId, { goodsPurchaseId: ids.purchase });
    const comparison = await repository.getGoodsPurchaseReceivingComparison(actor.storeId, ids.purchase);
    expect({
      purchase: (purchase?.items[0] as { approvedReceivedQuantity?: number })?.approvedReceivedQuantity,
      receipt: receipt?.lines[0].approvedReceivedExcludingCurrentReceipt,
      queue: queue[0]?.approvedReceivedQuantity,
      comparison: comparison?.items[0].approvedReceivedQuantity,
    }).toEqual({ purchase: 7, receipt: 7, queue: 7, comparison: 7 });
  });

  it("membalik hanya jumlah efektif barang baru setelah koreksi berulang lalu penghapusan", async () => {
    const ids = await fixture(20);
    const productId = `baru-${ids.product}`;
    const requestItemId = `baru-${ids.requestItem}`;
    const purchaseItemId = `baru-${ids.purchaseItem}`;
    await db.product.create({ data: { id: productId, sku: productId, name: "Barang baru", unit: "pcs", stock: 5, price: 2000, costPrice: 1000, categoryId, storeId: actor.storeId } });
    await db.shoppingRequestItem.create({ data: { id: requestItemId, shoppingRequestId: ids.request, productId, productName: "Barang baru", unit: "pcs", stockOnHand: 5, requestedQty: 4, approvedQty: 4, decisionStatus: "APPROVED" } });
    await db.goodsPurchaseItem.create({ data: { id: purchaseItemId, goodsPurchaseId: ids.purchase, shoppingRequestItemId: requestItemId, productId, productNameSnapshot: "Barang baru", skuSnapshot: productId, unitSnapshot: "pcs", unitMultiplierSnapshot: 1, quantity: 4, latestUnitPrice: 1000, lineTotal: 4000 } });
    for (const [key, oldReceivedQty, newReceivedQty] of [["tambah", 0, 2], ["ubah", 2, 4]] as const) {
      await db.$transaction(async (tx) => {
        const audit = await tx.shoppingRequestCorrection.create({ data: { storeId: actor.storeId, shoppingRequestId: ids.request, actorId: actor.id, reason: "Barang baru", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: {}, preview: {} } });
        await applyCorrectionStock(tx, { storeId: actor.storeId, requestId: ids.request, correctionId: audit.id, actor, reason: "Barang baru", changes: [{ productId, shoppingRequestItemId: requestItemId, goodsPurchaseItemId: purchaseItemId, receiptLineId: null, oldReceivedQty, newReceivedQty }] });
      });
    }
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(9);
    await deleteShoppingRequestRecord(ids.request, "Salah daftar", actor);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stock).toBe(5);
  });

  it("membatalkan seluruh transaksi saat sumber historis tidak dapat ditelusuri", async () => {
    const ids = await fixture(20);
    await db.batchOperationItem.updateMany({ where: { batchOperationId: ids.batch }, data: { afterSnapshot: {} } });
    await expect(correct(ids, 10, 7, "sumber-tidak-pasti")).rejects.toThrow(/riwayat|konversi/i);
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(20);
    expect(await db.shoppingRequestCorrection.count({ where: { shoppingRequestId: ids.request } })).toBe(0);
  });

  it("mengoreksi stok grup dalam satuan dasar sekali saja", async () => {
    const ids = await fixture(8);
    const groupId = `group-${ids.product}`;
    await db.productStockGroup.create({ data: { id: groupId, storeId: actor.storeId, groupKey: groupId, displayName: "Kertas", baseUnit: "lembar", baseStock: 80 } });
    await db.product.update({ where: { id: ids.product }, data: { stockGroupId: groupId, unitMultiplierToBase: 10 } });
    await db.goodsPurchaseItem.update({ where: { id: ids.purchaseItem }, data: { unitMultiplierSnapshot: 10 } });
    await db.inventoryLog.update({ where: { id: ids.log }, data: { stockGroupIdSnapshot: groupId, unitMultiplierSnapshot: 10, stockBaseDelta: 100 } });
    await db.batchOperationItem.updateMany({ where: { batchOperationId: ids.batch }, data: { afterSnapshot: { unit: "lembar", inboundReceiptImpact: { kind: "CANONICAL", receiptId: ids.receipt, receiptLineId: ids.line, stockGroupId: groupId, delta: 10, baseDelta: 100 } } } });
    await correct(ids, 10, 7, "grup");
    expect((await db.productStockGroup.findUniqueOrThrow({ where: { id: groupId } })).baseStock).toBe(50);
    const movement = await db.shoppingRequestCorrectionMovement.findFirstOrThrow({ where: { receiptLineId: ids.line } });
    expect(movement).toMatchObject({ stockGroupId: groupId, baseDelta: -30 });
  });

  it("menahan koreksi ketika barang terkait memiliki penerimaan menunggu persetujuan", async () => {
    const ids = await fixture(8);
    await db.inventoryInboundReceipt.create({ data: {
      id: `pending-${ids.receipt}`, storeId: actor.storeId, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, status: "SUBMITTED",
      lines: { create: { productId: ids.product, shoppingRequestItemId: ids.requestItem, goodsPurchaseItemId: ids.purchaseItem, status: "RECEIVED", reviewStatus: "PENDING", expectedQuantity: 1, receivedQuantity: 1, productNameSnapshot: "Kertas", skuSnapshot: ids.product, expectedQuantitySnapshot: 1, receivedQuantitySnapshot: 1 } },
    } });
    await expect(correct(ids, 10, 7, "penerimaan-tertunda")).rejects.toThrow(/menunggu persetujuan/i);
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(8);
  });

  it("menghapus daftar dengan membalikkan hanya jumlah penerimaan yang masih berlaku", async () => {
    const ids = await fixture(20);
    await correct(ids, 10, 7, "sebelum-hapus");
    await deleteShoppingRequestRecord(ids.request, "Salah daftar", actor);
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(10);
    expect((await db.batchOperation.findUniqueOrThrow({ where: { id: ids.batch } })).status).toBe("UNDONE");
  });

  it("menunggu pembatalan sumber yang bersamaan dan menolak penerimaan yang telah dibalik", async () => {
    const ids = await fixture(8);
    let unlock!: () => void;
    let locked!: () => void;
    const hold = new Promise<void>((resolve) => { unlock = resolve; });
    const ready = new Promise<void>((resolve) => { locked = resolve; });
    const undo = db.$transaction(async (tx) => {
      await tx.batchOperation.update({ where: { id: ids.batch }, data: { status: "UNDONE" } });
      locked();
      await hold;
    }, { timeout: 15_000 });
    await ready;
    const correction = correct(ids, 10, 7, "bersamaan").then(
      () => ({ saved: true, message: "" }),
      (error: Error) => ({ saved: false, message: error.message }),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    unlock();
    await undo;
    const result = await correction;
    expect(result.saved).toBe(false);
    expect(result.message).toMatch(/riwayat|penerimaan/i);
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(8);
    expect(await db.shoppingRequestCorrection.count({ where: { shoppingRequestId: ids.request } })).toBe(0);
  });

  it("menolak undo umum yang menunggu koreksi bersamaan selesai", async () => {
    const ids = await fixture(8);
    let release!: () => void;
    let locked!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { locked = resolve; });
    const correction = db.$transaction(async (tx) => {
      const audit = await tx.shoppingRequestCorrection.create({ data: { storeId: actor.storeId, shoppingRequestId: ids.request, actorId: actor.id, reason: "Salah catat", idempotencyKey: "bersamaan-undo", requestFingerprint: "bersamaan-undo", beforeSnapshot: {}, afterSnapshot: {}, preview: {} } });
      await applyCorrectionStock(tx, { storeId: actor.storeId, requestId: ids.request, correctionId: audit.id, actor, reason: "Salah catat", changes: [{ productId: ids.product, shoppingRequestItemId: ids.requestItem, goodsPurchaseItemId: ids.purchaseItem, receiptLineId: ids.line, oldReceivedQty: 10, newReceivedQty: 7 }] });
      locked();
      await hold;
    }, { timeout: 15_000 });
    await ready;
    const undo = undoBatch(new Request(`http://localhost/api/batch-operations/${ids.batch}/undo`, { method: "POST" }), { params: Promise.resolve({ id: ids.batch }) });
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      release();
    }
    await correction;
    const response = await undo;
    expect(response.status).toBe(409);
    expect((await response.json()).message).toMatch(/daftar belanja.*dikoreksi/i);
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(5);
    expect((await db.batchOperation.findUniqueOrThrow({ where: { id: ids.batch } })).status).toBe("COMMITTED");
  });
});
