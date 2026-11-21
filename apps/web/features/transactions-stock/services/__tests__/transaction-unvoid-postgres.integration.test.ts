import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const runtime = vi.hoisted(() => ({ client: null as any, actor: null as any }));
vi.mock("@pos/db", async (load) => {
  const actual = await load<typeof import("@pos/db")>();
  return { ...actual, db: new Proxy({}, { get(_target, key) {
    const value = runtime.client?.[key];
    return typeof value === "function" ? value.bind(runtime.client) : value;
  } }) };
});
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: async () => runtime.actor, handleAuthError: () => null }));
vi.mock("@/features/receipt-changes/server/receipt-change-audit", () => ({ shouldRecordReceiptChange: () => false, captureReceiptSnapshot: vi.fn(), recordReceiptChange: vi.fn() }));
import { PrismaClient } from "@pos/db";
import { PATCH as editItems } from "@/app/api/transactions/[id]/items/route";
import { reverseTransaction } from "../transaction-reversal-service";
import { previewTransactionUnvoid, restoreTransactionUnvoid } from "../transaction-unvoid-service";

const url = process.env.POS_UNVOID_FIXTURE_URL;
const enabled = Boolean(url);
const id = `unvoid-${Date.now()}`;
const actor = { id: `${id}-owner`, name: "Owner Uji", role: "OWNER" as const };
const storeId = `${id}-store`;
let db: PrismaClient;

describe.skipIf(!enabled)("pemulihan transaksi pada PostgreSQL terisolasi", () => {
  beforeAll(async () => {
    const target = new URL(url!);
    if (target.hostname !== "127.0.0.1" || target.port !== "16454" || target.username !== "postgres") throw new Error("Target fixture tidak aman");
    db = new PrismaClient({ datasources: { db: { url } } });
    runtime.client = db;
    runtime.actor = { ...actor, storeId };
    await db.store.create({ data: { id: storeId, name: "Toko Uji" } });
    await db.user.create({ data: { ...actor, username: `${id}-owner`, storeId } });
    await db.category.create({ data: { id: `${id}-cat`, name: `Kategori ${id}` } });
  }, 120000);
  afterAll(async () => { await db?.$disconnect(); });

  async function createSale(suffix: string, legacy = false) {
    const productId = `${id}-${suffix}-product`;
    const transactionId = `${id}-${suffix}-transaction`;
    const invoiceNumber = `INV-${id}-${suffix}`;
    await db.product.create({ data: { id: productId, sku: `${id}-${suffix}`, name: "Kertas Uji", categoryId: `${id}-cat`, storeId, price: 100, costPrice: 40, stock: 8 } });
    await db.transaction.create({ data: { id: transactionId, invoiceNumber, storeId, subtotal: 200, total: 200, amountPaid: 200, paymentMethod: "CASH", status: "COMPLETED", items: { create: { productId, productName: "Kertas Uji", quantity: 2, unitPrice: 100, unitCost: 40, subtotal: 200 } } } });
    await db.inventoryLog.create({ data: { productId, type: "OUT", reason: "SALE", quantity: 2, unitCost: 40, note: `Penjualan ${invoiceNumber}`,
      transactionId: legacy ? null : transactionId, sourceTransactionRef: legacy ? null : transactionId,
      unitMultiplierSnapshot: legacy ? null : 1, stockBaseDelta: legacy ? null : -2 } });
    return { transactionId, productId, input: { storeId, transactionId, actor } };
  }

  it("memulihkan nota lama setelah void menautkan jurnal legacy", async () => {
    const sale = await createSale("legacy", true);
    await db.$transaction((tx) => reverseTransaction(tx, { ...sale.input, action: "VOID" }), { timeout: 30000 });
    expect((await db.product.findUniqueOrThrow({ where: { id: sale.productId } })).stock).toBe(10);
    const shown = await previewTransactionUnvoid(db, sale.input);
    await db.$transaction((tx) => restoreTransactionUnvoid(tx, { ...sale.input, previewToken: shown.previewToken }), { timeout: 30000 });
    expect((await db.product.findUniqueOrThrow({ where: { id: sale.productId } })).stock).toBe(8);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: sale.transactionId } })).status).toBe("COMPLETED");
    await db.$transaction((tx) => reverseTransaction(tx, { ...sale.input, action: "VOID" }), { timeout: 30000 });
    expect((await db.product.findUniqueOrThrow({ where: { id: sale.productId } })).stock).toBe(10);
  }, 120000);

  it("memulihkan surat jalan lama tanpa menyentuh yang sebelumnya dibatalkan", async () => {
    const sale = await createSale("shipment");
    await db.suratJalan.createMany({ data: [
      { id: `${id}-sj-confirmed`, number: `SJ-${id}-1`, transactionId: sale.transactionId, storeId, recipientName: "Penerima Uji", sequence: 1, status: "CONFIRMED" },
      { id: `${id}-sj-cancelled`, number: `SJ-${id}-2`, transactionId: sale.transactionId, storeId, recipientName: "Penerima Uji", sequence: 2, status: "CANCELLED" },
    ] });
    await db.$transaction((tx) => reverseTransaction(tx, { ...sale.input, action: "VOID" }), { timeout: 30000 });
    const doc = await db.suratJalan.findUniqueOrThrow({ where: { id: `${id}-sj-confirmed` } });
    await db.suratJalan.update({ where: { id: doc.id }, data: { updatedAt: new Date(doc.cancelledAt!.getTime() + 20) } });
    const shown = await previewTransactionUnvoid(db, sale.input);
    await db.$transaction((tx) => restoreTransactionUnvoid(tx, { ...sale.input, previewToken: shown.previewToken }), { timeout: 30000 });
    expect((await db.suratJalan.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("CONFIRMED");
    expect((await db.suratJalan.findUniqueOrThrow({ where: { id: `${id}-sj-cancelled` } })).status).toBe("CANCELLED");
  }, 120000);

  it("menerapkan hanya satu dari dua permintaan pemulihan bersamaan", async () => {
    const sale = await createSale("race");
    await db.$transaction((tx) => reverseTransaction(tx, { ...sale.input, action: "VOID" }), { timeout: 30000 });
    const shown = await previewTransactionUnvoid(db, sale.input);
    const results = await Promise.allSettled([1, 2].map(() => db.$transaction((tx) => restoreTransactionUnvoid(tx, { ...sale.input, previewToken: shown.previewToken }), { timeout: 30000 })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: sale.productId } })).stock).toBe(8);
    expect(await db.transactionLifecycleAudit.count({ where: { transactionId: sale.transactionId, action: "UNVOID" } })).toBe(1);
  }, 120000);

  it("mempertahankan satuan bahan tanpa menggandakan jurnal pemakaian", async () => {
    const groupId = `${id}-material-group`;
    const productId = `${id}-material-product`;
    const transactionId = `${id}-printing`;
    await db.productStockGroup.create({ data: { id: groupId, storeId, groupKey: `${id}-material`, displayName: "Bahan Uji", baseUnit: "lembar", baseStock: 12 } });
    await db.product.create({ data: { id: productId, sku: `${id}-material`, name: "Bahan Uji", categoryId: `${id}-cat`, storeId, price: 100, costPrice: 40, unit: "pak", stockGroupId: groupId, unitMultiplierToBase: 4 } });
    await db.transaction.create({ data: { id: transactionId, invoiceNumber: `INV-${id}-printing`, storeId, subtotal: 200, total: 200, amountPaid: 200, paymentMethod: "CASH", status: "COMPLETED", items: { create: { productName: "Cetak Uji", rawMaterialProductId: productId, rawMaterialQuantity: 2, quantity: 1, unitPrice: 200, unitCost: 40, subtotal: 200 } } } });
    await db.inventoryLog.create({ data: { productId, type: "OUT", reason: "USAGE", quantity: 2, unitCost: 15, transactionId, sourceTransactionRef: transactionId, stockGroupIdSnapshot: groupId, unitMultiplierSnapshot: 4, stockBaseDelta: -8 } });
    const input = { storeId, transactionId, actor };
    await db.$transaction((tx) => reverseTransaction(tx, { ...input, action: "VOID" }), { timeout: 30000 });
    const shown = await previewTransactionUnvoid(db, input);
    await db.$transaction((tx) => restoreTransactionUnvoid(tx, { ...input, previewToken: shown.previewToken }), { timeout: 30000 });
    const restored = await db.inventoryLog.findFirstOrThrow({ where: { transactionId, reason: "TRANSACTION_RESTORE" } });
    expect(restored).toMatchObject({ quantity: 2, unitMultiplierSnapshot: 4, stockBaseDelta: -8 });
    expect(Number(restored.unitCost)).toBe(15);
    expect(await db.inventoryLog.count({ where: { transactionId, reason: "USAGE" } })).toBe(1);
    expect((await db.productStockGroup.findUniqueOrThrow({ where: { id: groupId } })).baseStock).toBe(12);
  }, 120000);

  it("tetap dapat mengoreksi jumlah pada nota stok kelompok setelah void dan pemulihan", async () => {
    const groupId = `${id}-edit-group`;
    const productId = `${id}-edit-product`;
    const transactionId = `${id}-edit-transaction`;
    await db.productStockGroup.create({ data: { id: groupId, storeId, groupKey: `${id}-edit`, displayName: "Barang Uji", baseUnit: "pcs", baseStock: 12 } });
    await db.product.create({ data: { id: productId, sku: `${id}-edit`, name: "Barang Uji", categoryId: `${id}-cat`, storeId, price: 100, costPrice: 40, unit: "pak", stockGroupId: groupId, unitMultiplierToBase: 4 } });
    await db.transaction.create({ data: { id: transactionId, invoiceNumber: `INV-${id}-edit`, storeId, subtotal: 200, total: 200, amountPaid: 200, paymentMethod: "CASH", status: "COMPLETED", items: { create: { productId, productName: "Barang Uji", quantity: 2, unitPrice: 100, unitCost: 40, subtotal: 200 } } } });
    await db.inventoryLog.create({ data: { productId, type: "OUT", reason: "SALE", quantity: 2, unitCost: 40, transactionId, sourceTransactionRef: transactionId, stockGroupIdSnapshot: groupId, unitMultiplierSnapshot: 4, stockBaseDelta: -8 } });
    const input = { storeId, transactionId, actor };
    await db.$transaction((tx) => reverseTransaction(tx, { ...input, action: "VOID" }), { timeout: 30000 });
    const shown = await previewTransactionUnvoid(db, input);
    await db.$transaction((tx) => restoreTransactionUnvoid(tx, { ...input, previewToken: shown.previewToken }), { timeout: 30000 });
    const item = await db.transactionItem.findFirstOrThrow({ where: { transactionId } });
    const request = new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ items: [{ sourceItemId: item.id, productId, productName: "Barang Uji", quantity: 1, unitPrice: 100, originalUnitPrice: 100, appliedUnitPrice: 100, subtotal: 100 }] }) });
    const response = await editItems(request, { params: Promise.resolve({ id: transactionId }) });
    expect(response.status).toBe(200);
    expect((await db.productStockGroup.findUniqueOrThrow({ where: { id: groupId } })).baseStock).toBe(16);
    await db.transaction.update({ where: { id: transactionId }, data: { invoiceNumber: `INV-${id}-renamed` } });
    const renamedRequest = new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ items: [{ sourceItemId: item.id, productId, productName: "Barang Uji", quantity: 2, unitPrice: 50, originalUnitPrice: 100, appliedUnitPrice: 50, subtotal: 100 }] }) });
    expect((await editItems(renamedRequest, { params: Promise.resolve({ id: transactionId }) })).status).toBe(200);
    expect((await db.productStockGroup.findUniqueOrThrow({ where: { id: groupId } })).baseStock).toBe(12);
    const voidAudit = await db.transactionLifecycleAudit.findFirstOrThrow({ where: { transactionId, action: "VOID" } });
    const tampered = { ...(voidAudit.snapshot as any), stockReturns: [{ productId, stockGroupIdSnapshot: groupId, baseDelta: 9 }] };
    await db.transactionLifecycleAudit.update({ where: { id: voidAudit.id }, data: { snapshot: tampered } });
    const deniedRequest = new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ items: [{ sourceItemId: item.id, productId, productName: "Barang Uji", quantity: 1, unitPrice: 100, originalUnitPrice: 100, appliedUnitPrice: 100, subtotal: 100 }] }) });
    const denied = await editItems(deniedRequest, { params: Promise.resolve({ id: transactionId }) });
    expect({ status: denied.status, body: await denied.json() }).toMatchObject({ status: 409 });
    expect((await db.productStockGroup.findUniqueOrThrow({ where: { id: groupId } })).baseStock).toBe(12);
  }, 120000);
});
