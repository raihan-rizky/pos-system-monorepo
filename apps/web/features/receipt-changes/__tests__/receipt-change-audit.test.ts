import { describe, expect, it } from "vitest";
import type { Prisma } from "@pos/db";
import { captureReceiptSnapshot, recordReceiptChange, shouldRecordReceiptChange } from "../server/receipt-change-audit";

const sales = { id: "sales-account", name: "Rani", role: "SALES" };

function fixture(storeId = "store-main") {
  const state = {
    row: {
      id: "tx-1", storeId, invoiceNumber: "INV-001", invoiceDate: new Date("2026-11-04T02:00:00Z"),
      customerId: "customer-1", customerName: "Pelanggan", salespersonId: "salesperson-1", salesName: "Rani",
      note: null, status: "COMPLETED", paymentMethod: "CASH", subtotal: "20000", discount: "0",
      tax: "0", taxRate: null, taxMethod: "EXCLUSIVE", total: "20000", amountPaid: "20000", change: "0",
      items: [{ id: "item-1", productId: "product-1", productName: "Buku", documentName: null,
        quantity: 2, unitPrice: "10000", appliedUnitPrice: "10000", originalUnitPrice: null,
        discount: "0", subtotal: "20000", material: null, size: null, serviceNote: null,
        rawMaterialProductId: null, rawMaterialQuantity: null, rawMaterialUnit: null,
        product: { unit: "pcs" }, printingService: null }],
      payments: [{ id: "payment-1", method: "CASH", amount: "20000" }],
      debtPaymentLogs: [],
      printingReceipt: null as null | { number: string; subcategory: string; document: Record<string, unknown> },
    },
    changes: [] as Array<Record<string, any>>,
    notifications: [] as Array<Record<string, any>>,
    reads: [] as Array<Record<string, any>>,
    rejectNotification: false,
  };
  const owners = [
    { id: "owner-main", role: "OWNER", storeId: "store-main", isActive: true },
    { id: "owner-legacy", role: "OWNER", storeId: null, isActive: true },
    { id: "owner-other", role: "OWNER", storeId: "store-other", isActive: true },
    { id: "owner-inactive", role: "OWNER", storeId, isActive: false },
    { id: "admin", role: "ADMIN", storeId, isActive: true },
  ];
  const tx = {
    transaction: { findFirstOrThrow: async (query: any) => {
      state.reads.push(query);
      if (query.where.id !== state.row.id || query.where.storeId !== state.row.storeId) throw new Error("not found");
      return structuredClone(state.row);
    } },
    transactionReceiptChange: { create: async ({ data }: any) => {
      const entry = { id: `change-${state.changes.length + 1}`, ...structuredClone(data) };
      state.changes.push(entry);
      return { id: entry.id };
    } },
    user: { findMany: async ({ where }: any) => owners.filter(owner =>
      owner.role === where.role && owner.isActive === where.isActive &&
      (where.OR ? where.OR.some((scope: any) => scope.storeId === owner.storeId) : where.storeId === owner.storeId)
    ) },
    notification: { createMany: async ({ data }: any) => {
      if (state.rejectNotification) throw new Error("notification unavailable");
      state.notifications.push(...structuredClone(data));
      return { count: data.length };
    } },
  } as unknown as Prisma.TransactionClient;
  return { state, tx, storeId };
}

describe("riwayat perubahan nota Sales", () => {
  it.each(["COMPLETED", "DP"])("mencatat perubahan Sales pada %s", status => {
    expect(shouldRecordReceiptChange(sales, status)).toBe(true);
  });
  it.each(["DRAFT", "PENDING_APPROVAL", "VOIDED", "REFUNDED", "REJECTED"])("mengabaikan status %s", status => {
    expect(shouldRecordReceiptChange(sales, status)).toBe(false);
  });
  it.each(["OWNER", "ADMIN", "CASHIER", "INVENTORY"])("mengabaikan perubahan akun %s", role => {
    expect(shouldRecordReceiptChange({ ...sales, role }, "COMPLETED")).toBe(false);
  });

  it("menyimpan nilai nota sebelum dan sesudah serta pemberitahuan untuk Owner toko yang aktif", async () => {
    const { state, tx, storeId } = fixture();
    const before = await captureReceiptSnapshot(tx, storeId, "tx-1");
    state.row.items[0].quantity = 1;
    state.row.items[0].unitPrice = "20000";
    state.row.items[0].appliedUnitPrice = "20000";
    await recordReceiptChange(tx, { storeId, transactionId: "tx-1", actor: sales, before });
    expect(state.changes).toEqual([expect.objectContaining({
      actorId: "sales-account", actorName: "Rani", storeId: "store-main", transactionId: "tx-1",
      before: expect.objectContaining({ total: 20000, items: [expect.objectContaining({ quantity: 2, unitPrice: 10000, unit: "pcs" })] }),
      after: expect.objectContaining({ total: 20000, items: [expect.objectContaining({ quantity: 1, unitPrice: 20000 })] }),
    })]);
    expect(state.notifications.map(entry => entry.userId).sort()).toEqual(["owner-legacy", "owner-main"]);
    expect(state.notifications[0]).toMatchObject({
      eventName: "transaction.receipt_changed_by_sales", tag: "change-1",
      url: "/history/receipt-changes/tx-1?change=change-1",
    });
    expect(state.notifications[0].body).toMatch(/Rani.*INV-001.*produk/);
    expect(state.reads.every(query => query.where.storeId === storeId)).toBe(true);
  });

  it("tidak memberi tahu Owner toko lain termasuk Owner tanpa toko untuk cabang lain", async () => {
    const { state, tx, storeId } = fixture("store-other");
    const before = await captureReceiptSnapshot(tx, storeId, "tx-1");
    state.row.customerName = "Nama baru";
    await recordReceiptChange(tx, { storeId, transactionId: "tx-1", actor: sales, before });
    expect(state.notifications.map(entry => entry.userId)).toEqual(["owner-other"]);
  });

  it("mempertahankan setiap penyimpanan dan tautan pemberitahuan ke versi masing-masing", async () => {
    const { state, tx, storeId } = fixture();
    let before = await captureReceiptSnapshot(tx, storeId, "tx-1");
    state.row.customerName = "Nama kedua";
    await recordReceiptChange(tx, { storeId, transactionId: "tx-1", actor: sales, before });
    before = await captureReceiptSnapshot(tx, storeId, "tx-1");
    state.row.customerName = "Nama ketiga";
    await recordReceiptChange(tx, { storeId, transactionId: "tx-1", actor: sales, before });
    expect(state.changes.map(entry => [entry.before.customerName, entry.after.customerName])).toEqual([
      ["Pelanggan", "Nama kedua"], ["Nama kedua", "Nama ketiga"],
    ]);
    expect(state.notifications.map(entry => entry.url)).toEqual([
      "/history/receipt-changes/tx-1?change=change-1", "/history/receipt-changes/tx-1?change=change-1",
      "/history/receipt-changes/tx-1?change=change-2", "/history/receipt-changes/tx-1?change=change-2",
    ]);
  });

  it("tidak membuat versi atau pemberitahuan untuk simpan tanpa perubahan isi", async () => {
    const { state, tx, storeId } = fixture();
    const before = await captureReceiptSnapshot(tx, storeId, "tx-1");
    state.row.items[0].id = "replacement-id";
    await recordReceiptChange(tx, { storeId, transactionId: "tx-1", actor: sales, before });
    expect(state.changes).toEqual([]);
    expect(state.notifications).toEqual([]);
  });

  it("menyimpan perubahan teks Percetakan dan mengabaikan ID baris serta lebar kolom", async () => {
    const { state, tx, storeId } = fixture();
    state.row.printingReceipt = { number: "PC-1", subcategory: "PERCETAKAN", document: { note: "Awal", columnWidths: [10], lines: [{ id: "line-1", name: "Poster" }] } };
    const before = await captureReceiptSnapshot(tx, storeId, "tx-1");
    state.row.printingReceipt.document = { lines: [{ name: "Poster", id: "new-line" }], columnWidths: [20], note: "Awal" };
    await recordReceiptChange(tx, { storeId, transactionId: "tx-1", actor: sales, before });
    expect(state.changes).toEqual([]);
    state.row.printingReceipt.document.note = "Koreksi";
    await recordReceiptChange(tx, { storeId, transactionId: "tx-1", actor: sales, before });
    expect(state.changes[0].before.printingReceipt.document.note).toBe("Awal");
    expect(state.changes[0].after.printingReceipt.document.note).toBe("Koreksi");
    expect(state.notifications[0].body).toContain("dokumen percetakan");
  });

  it("menolak riwayat di helper untuk perubahan bukan Sales walaupun isinya berbeda", async () => {
    const { state, tx, storeId } = fixture();
    const before = await captureReceiptSnapshot(tx, storeId, "tx-1");
    state.row.customerName = "Koreksi Owner";
    await recordReceiptChange(tx, { storeId, transactionId: "tx-1", actor: { ...sales, role: "OWNER" }, before });
    expect(state.changes).toEqual([]);
    expect(state.notifications).toEqual([]);
  });

  it("meneruskan kegagalan pemberitahuan agar transaksi penyimpanan dapat dibatalkan", async () => {
    const { state, tx, storeId } = fixture();
    const before = await captureReceiptSnapshot(tx, storeId, "tx-1");
    state.row.customerName = "Koreksi";
    state.rejectNotification = true;
    await expect(recordReceiptChange(tx, { storeId, transactionId: "tx-1", actor: sales, before })).rejects.toThrow("notification unavailable");
  });
});
