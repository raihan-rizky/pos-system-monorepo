import { describe, expect, it, vi } from "vitest";
import * as unvoid from "../transaction-unvoid-service";

const preview = (unvoid as Record<string, any>).previewTransactionUnvoid ?? (async () => undefined);
const restore = (unvoid as Record<string, any>).restoreTransactionUnvoid ?? (async () => undefined);
const input = { storeId: "store-1", transactionId: "tx-1", actor: { id: "owner-1", role: "OWNER", name: "Owner" } };
const snapshot = {
  action: "VOID", previousStatus: "COMPLETED",
  transaction: { id: "tx-1", customerId: null, invoiceNumber: "INV-1", draftNumber: null, total: "100", amountPaid: "100", paymentMethod: "CASH" },
  stockReturns: [{ productId: "prod-1", stockGroupIdSnapshot: null, baseDelta: 2 }],
  stockResults: [{ productId: "prod-1", stockGroupId: null, baseDelta: 2, beforeStock: 1, afterStock: 3 }],
  suratJalan: [{ id: "sj-1", number: "SJ-1", status: "CONFIRMED", cancelledAt: null, updatedAt: "2026-11-20T00:59:00.000Z", items: [] }], financialReversal: null,
  items: [{ id: "item-1", productId: "prod-1", quantity: 2, unitCost: null }], payments: [], debtPaymentLogs: [],
  stockJournal: [{ id: "sale-1", productId: "prod-1", type: "OUT", reason: "SALE", quantity: 2, note: "Penjualan INV-1", transactionId: "tx-1", sourceTransactionRef: "tx-1", suratJalanId: null, stockGroupIdSnapshot: null, unitMultiplierSnapshot: 1, stockBaseDelta: -2, status: "APPROVED" }], legacyStockEvidence: [],
};

function database(stock: number) {
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: "tx-1" }]),
    $queryRaw: vi.fn().mockImplementation(async (_strings: TemplateStringsArray, id: string) => [{ id }]),
    transaction: { findFirst: vi.fn().mockResolvedValue({ id: "tx-1", status: "VOIDED", customerId: null, invoiceNumber: "INV-1", draftNumber: null, total: 100, amountPaid: 100, paymentMethod: "CASH", items: snapshot.items, payments: [], debtPaymentLogs: [] }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    transactionLifecycleAudit: { findFirst: vi.fn().mockResolvedValue({ id: "audit-1", action: "VOID", createdAt: new Date("2026-11-20T01:00:00Z"), snapshot }), create: vi.fn().mockResolvedValue({ id: "audit-2" }) },
    product: { findMany: vi.fn().mockResolvedValue([{ id: "prod-1", name: "Kertas", unit: "lembar", stock, stockGroupId: null, unitMultiplierToBase: 1, conversionNeedsReview: false }]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    productStockGroup: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    suratJalan: { findMany: vi.fn().mockResolvedValue([{ id: "sj-1", number: "SJ-1", status: "CANCELLED", cancelledAt: new Date("2026-11-20T01:01:00Z"), updatedAt: new Date("2026-11-20T01:01:00Z"), items: [] }]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    inventoryLog: {
      findMany: vi.fn().mockResolvedValue([...snapshot.stockJournal, { id: "void-return-1", productId: "prod-1", type: "IN", reason: "SALE_RETURN", quantity: 2, status: "APPROVED", stockGroupIdSnapshot: null, unitMultiplierSnapshot: 1, stockBaseDelta: 2, transactionId: "tx-1", sourceTransactionRef: "tx-1", suratJalanId: null, note: "Void transaksi INV-1" }]),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    customer: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

describe("pratinjau pemulihan transaksi", () => {
  it("menolak peran selain owner sebelum membaca data", async () => {
    const db = database(5);
    await expect(preview?.(db, { ...input, actor: { ...input.actor, role: "SALES" } })).rejects.toThrow();
    expect(db.transaction.findFirst).not.toHaveBeenCalled();
  });

  it("menyajikan perubahan yang terbukti tanpa mutasi", async () => {
    const db = database(5);
    const result = await preview?.(db, input);
    expect(result).toMatchObject({
      auditId: "audit-1", previousStatus: "COMPLETED",
      stock: [{ productId: "prod-1", name: "Kertas", amount: 2, unit: "lembar", available: 5 }],
      shipments: [{ id: "sj-1", number: "SJ-1", status: "CONFIRMED" }],
    });
  });

  it("menolak pemulihan ketika stok tidak mencukupi", async () => {
    await expect(preview?.(database(1), input)).rejects.toThrow(/stok/i);
  });

  it("menolak audit yang hilang", async () => {
    const db = database(5);
    db.transactionLifecycleAudit.findFirst.mockResolvedValue(null);
    await expect(preview?.(db, input)).rejects.toThrow(/audit/i);
  });

  it("menolak transaksi yang nilai pembayarannya berubah setelah void", async () => {
    const db = database(5);
    db.transaction.findFirst.mockResolvedValue({ id: "tx-1", status: "VOIDED", customerId: null, invoiceNumber: "INV-1", draftNumber: null, total: 100, amountPaid: 50, paymentMethod: "CASH" });
    await expect(preview(db, input)).rejects.toThrow(/berubah/i);
  });

  it("menolak isi transaksi yang berubah setelah void", async () => {
    const db = database(5);
    const current = await db.transaction.findFirst();
    db.transaction.findFirst.mockResolvedValue({ ...current, items: [{ id: "item-1", quantity: 4 }] });
    await expect(preview(db, input)).rejects.toThrow(/berubah/i);
  });

  it("menolak surat jalan yang diubah lagi setelah void", async () => {
    const db = database(5);
    db.suratJalan.findMany.mockResolvedValue([{ id: "sj-1", number: "SJ-1", status: "CANCELLED", cancelledAt: new Date("2026-11-20T01:01:00Z"), updatedAt: new Date("2026-11-20T01:05:00Z"), items: [] }]);
    await expect(preview(db, input)).rejects.toThrow(/surat jalan/i);
  });

  it("menerima surat jalan void lama saat cap waktu berbeda beberapa milidetik tetapi isinya tetap sama", async () => {
    const db = database(5);
    db.suratJalan.findMany.mockResolvedValue([{ id: "sj-1", number: "SJ-1", status: "CANCELLED", cancelledAt: new Date("2026-11-20T01:01:00.000Z"), updatedAt: new Date("2026-11-20T01:01:00.020Z"), items: [] }]);
    await expect(preview(db, input)).resolves.toMatchObject({ shipments: [{ id: "sj-1", status: "CONFIRMED" }] });
  });

  it("menolak perubahan isi surat jalan meskipun cap waktu pembatalan cocok", async () => {
    const db = database(5);
    db.suratJalan.findMany.mockResolvedValue([{ id: "sj-1", number: "SJ-1", status: "CANCELLED", cancelledAt: new Date("2026-11-20T01:01:00Z"), updatedAt: new Date("2026-11-20T01:01:00Z"), items: [{ id: "changed" }] }]);
    await expect(preview(db, input)).rejects.toThrow(/surat jalan/i);
  });

  it("menolak audit keuangan yang tidak cocok dengan pembayaran transaksi", async () => {
    const db = database(5);
    const current = await db.transaction.findFirst();
    db.transaction.findFirst.mockResolvedValue({ ...current, customerId: "customer-1" });
    db.transactionLifecycleAudit.findFirst.mockResolvedValue({ id: "audit-1", action: "VOID", createdAt: new Date("2026-11-20T01:00:00Z"), snapshot: {
      ...snapshot, transaction: { ...snapshot.transaction, customerId: "customer-1" },
      financialReversal: { amountPaid: 5, debtRemoved: 0 },
    } });
    await expect(preview(db, input)).rejects.toThrow(/audit/i);
  });

  it("menolak mutasi stok terkait transaksi yang muncul setelah void", async () => {
    const db = database(5);
    const rows = await db.inventoryLog.findMany();
    db.inventoryLog.findMany.mockResolvedValue([...rows, { ...rows[0], id: "unexpected", stockBaseDelta: 1 }]);
    await expect(preview(db, input)).rejects.toThrow(/stok/i);
  });

  it("menolak bukti stok lama yang telah dihapus setelah void", async () => {
    const db = database(5);
    db.transactionLifecycleAudit.findFirst.mockResolvedValue({ id: "audit-1", action: "VOID", createdAt: new Date(), snapshot: {
      ...snapshot, legacyStockEvidence: [{ id: "legacy-1", productId: "prod-1", type: "OUT", reason: "SALE", quantity: 2, note: "Penjualan INV-1" }],
    } });
    const rows = await db.inventoryLog.findMany();
    db.inventoryLog.findMany.mockImplementation(async (query: any) => query.where.id ? [] : rows);
    await expect(preview(db, input)).rejects.toThrow(/stok/i);
  });

  it("menerima bukti stok nota lama yang ditautkan saat void", async () => {
    const db = database(5);
    const legacy = { id: "legacy-1", productId: "prod-1", type: "OUT", reason: "SALE", quantity: 2, note: "Penjualan INV-1" };
    const saved = { ...snapshot, stockJournal: [], legacyStockEvidence: [legacy] };
    db.transactionLifecycleAudit.findFirst.mockResolvedValue({ id: "audit-1", action: "VOID", createdAt: new Date(), snapshot: saved });
    const converted = { ...legacy, status: "APPROVED", transactionId: null, sourceTransactionRef: "tx-1", suratJalanId: null, stockGroupIdSnapshot: null, unitMultiplierSnapshot: 1, stockBaseDelta: -2 };
    const existing = await db.inventoryLog.findMany();
    db.inventoryLog.findMany.mockImplementation(async (query: any) => query.where.id ? [converted] : [converted, existing[1]]);
    await expect(preview(db, input)).resolves.toMatchObject({ auditId: "audit-1" });
  });

  it("menghitung kebutuhan gabungan untuk produk dalam kelompok stok yang sama", async () => {
    const db = database(5);
    const originalRows = ["prod-1", "prod-2"].map((productId) => ({ id: `sale-${productId}`, productId, type: "OUT", reason: "SALE", quantity: 3, note: "Penjualan", transactionId: "tx-1", sourceTransactionRef: "tx-1", suratJalanId: null, stockGroupIdSnapshot: "group-1", unitMultiplierSnapshot: 1, stockBaseDelta: -3, status: "APPROVED" }));
    db.transactionLifecycleAudit.findFirst.mockResolvedValue({ id: "audit-1", action: "VOID", createdAt: new Date("2026-11-20T01:00:00Z"), snapshot: {
      ...snapshot,
      stockJournal: originalRows,
      stockReturns: [
        { productId: "prod-1", stockGroupIdSnapshot: "group-1", baseDelta: 3 },
        { productId: "prod-2", stockGroupIdSnapshot: "group-1", baseDelta: 3 },
      ],
      stockResults: [
        { productId: "prod-1", stockGroupId: "group-1", baseDelta: 3, beforeBaseStock: 0, afterBaseStock: 3 },
        { productId: "prod-2", stockGroupId: "group-1", baseDelta: 3, beforeBaseStock: 3, afterBaseStock: 6 },
      ],
    } });
    db.product.findMany.mockResolvedValue([
      { id: "prod-1", name: "Kertas A", unit: "rim", stock: 0, stockGroupId: "group-1", unitMultiplierToBase: 1, conversionNeedsReview: false },
      { id: "prod-2", name: "Kertas B", unit: "rim", stock: 0, stockGroupId: "group-1", unitMultiplierToBase: 1, conversionNeedsReview: false },
    ]);
    db.productStockGroup.findMany.mockResolvedValue([{ id: "group-1", baseStock: 5, baseUnit: "lembar" }]);
    db.inventoryLog.findMany.mockResolvedValue([...originalRows, ...["prod-1", "prod-2"].map((productId) => ({ id: `void-${productId}`, productId, type: "IN", reason: "SALE_RETURN", quantity: 3, status: "APPROVED", stockGroupIdSnapshot: "group-1", unitMultiplierSnapshot: 1, stockBaseDelta: 3, transactionId: "tx-1", sourceTransactionRef: "tx-1", suratJalanId: null, note: "Void transaksi INV-1" }))]);
    await expect(preview(db, input)).rejects.toThrow(/stok/i);
  });

  it("menerapkan pemulihan hanya berdasarkan pratinjau terbaru", async () => {
    const db = database(5);
    const shown = await preview(db, input);
    const result = await restore(db, { ...input, previewToken: shown.previewToken });
    expect(result).toMatchObject({ previousStatus: "COMPLETED" });
    expect(db.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { stock: { decrement: 2 } } }));
    expect(db.suratJalan.updateMany).toHaveBeenCalled();
    expect(db.transaction.updateMany).toHaveBeenCalled();
    expect(db.transactionLifecycleAudit.create).toHaveBeenCalled();
  });

  it("mencatat ulang bahan percetakan dengan alasan, satuan, dan biaya yang benar", async () => {
    const db = database(10);
    const items = [{ id: "item-1", productId: null, rawMaterialProductId: "prod-1", unitCost: "2500" }];
    const source = { id: "old-usage", productId: "prod-1", type: "OUT", reason: "USAGE", quantity: 2, unitCost: "125", note: "Pemakaian", transactionId: "tx-1", sourceTransactionRef: "tx-1", suratJalanId: null, stockGroupIdSnapshot: "group-1", unitMultiplierSnapshot: 4, stockBaseDelta: -8, status: "APPROVED" };
    const receipt = { ...source, id: "void-return-1", type: "IN", reason: "SALE_RETURN", quantity: 8, unitMultiplierSnapshot: 1, stockBaseDelta: 8, note: "Void transaksi INV-1" };
    const saved = { ...snapshot, items, stockJournal: [source], stockReturns: [{ productId: "prod-1", stockGroupIdSnapshot: "group-1", baseDelta: 8 }], stockResults: [{ productId: "prod-1", stockGroupId: "group-1", baseDelta: 8, beforeBaseStock: 0, afterBaseStock: 8 }] };
    db.transactionLifecycleAudit.findFirst.mockResolvedValue({ id: "audit-1", action: "VOID", createdAt: new Date(), snapshot: saved });
    const current = await db.transaction.findFirst();
    db.transaction.findFirst.mockResolvedValue({ ...current, items });
    db.inventoryLog.findMany.mockResolvedValue([source, receipt]);
    db.product.findMany.mockResolvedValue([{ id: "prod-1", name: "Bahan", unit: "pak", stock: 0, stockGroupId: "group-1", unitMultiplierToBase: 4, conversionNeedsReview: false }]);
    db.productStockGroup.findMany.mockResolvedValue([{ id: "group-1", baseStock: 10, baseUnit: "lembar" }]);
    const shown = await preview(db, input);
    await restore(db, { ...input, previewToken: shown.previewToken });
    expect(db.inventoryLog.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ productId: "prod-1", reason: "TRANSACTION_RESTORE", note: expect.stringContaining("pemakaian bahan"), quantity: 2, unitMultiplierSnapshot: 4, unitCost: 125, stockBaseDelta: -8 })] });
  });

  it("menolak konfirmasi ketika stok berubah sesudah pratinjau", async () => {
    const db = database(5);
    const shown = await preview(db, input);
    db.product.findMany.mockResolvedValue([{ id: "prod-1", name: "Kertas", unit: "lembar", stock: 4, stockGroupId: null, unitMultiplierToBase: 1, conversionNeedsReview: false }]);
    await expect(restore(db, { ...input, previewToken: shown.previewToken })).rejects.toThrow(/berubah/i);
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });
});
