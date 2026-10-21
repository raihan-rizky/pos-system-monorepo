import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPrintingReceiptDocument } from "../domain";
import { planProcessedPrintingReceiptEdit } from "../processed-edit";
import { reviewProcessedPrintingReceipt, saveProcessedPrintingReceipt } from "../server/processed-edit-service";
import { planOutstandingReturns } from "@/features/transactions-stock/helpers/stock-lifecycle";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), stock: vi.fn(), get: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("../server/receipt-store", () => ({
  PrintingReceiptStorageError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  getPrintingReceipt: mocks.get,
}));
vi.mock("@/features/product-stock-groups/stock-mutations", () => ({ applyProductStockDeltas: mocks.stock }));

const document = (price = 100, usage = 2) => ({ ...createEmptyPrintingReceiptDocument(new Date("2026-10-21")), customerId: "customer", customerName: "Pelanggan", lines: [{ id: "line", name: "Cetak", material: "Kertas", quantity: 1, price, stockLink: { productId: "paper", quantity: usage, unit: "lembar" } }] });
const transaction = () => ({ id: "tx", storeId: "store", invoiceNumber: "NT-1", subtotal: 100, discount: 0, tax: 0, taxRate: 0, taxMethod: "STANDARD", total: 100, amountPaid: 40, change: 0, status: "DP", customerId: "customer", invoiceDate: new Date("2026-10-21T00:00:00Z"), paymentMethod: "CASH", stockManagedBySuratJalan: false, stockDeductionSource: "TRANSACTION", items: [{ id: "item", productId: null, printingServiceId: null, productName: "Cetak", material: "Kertas", quantity: 1, unitPrice: 100, discount: 0, subtotal: 100, rawMaterialProductId: "paper", rawMaterialQuantity: 2, rawMaterialUnit: "lembar" }], payments: [{ id: "pay", amount: 40, method: "CASH" }], debtPaymentLogs: [] });

describe("processed receipt financial plan", () => {
  it("preserves discount/tax and cash change while recalculating debt", () => {
    const tx = { ...transaction(), subtotal: 100, discount: 10, tax: 9, taxRate: 10, total: 99, amountPaid: 120, change: 21, status: "COMPLETED" };
    const plan = planProcessedPrintingReceiptEdit(tx, document(150, 3));
    expect(plan.after).toEqual({ subtotal: 150, total: 154, paid: 99, debt: 55, status: "DP" });
    expect(plan.tax).toBe(14);
    expect(plan.materials).toEqual([{ productId: "paper", before: 2, after: 3, unit: "lembar" }]);
  });
  it("requires separate refunds below actual net collected payment", () => {
    expect(() => planProcessedPrintingReceiptEdit(transaction(), document(39))).toThrow(/pengembalian dana/i);
  });
  it("keeps pending approval provisional and refuses void/refund", () => {
    expect(planProcessedPrintingReceiptEdit({ ...transaction(), status: "PENDING_APPROVAL" }, document(150)).after).toMatchObject({ status: "PENDING_APPROVAL", debt: 0 });
    for (const status of ["VOIDED", "REFUNDED", "DRAFT"]) expect(() => planProcessedPrintingReceiptEdit({ ...transaction(), status }, document())).toThrow();
  });
});

describe("atomic processed receipt correction", () => {
  let state: any;
  let journalFails: boolean;
  let calls: string[];
  beforeEach(() => {
    journalFails = false; calls = [];
    state = { receipt: { id: "receipt", storeId: "store", number: "NT-1", revision: 2, transactionId: "tx", document: document() }, transaction: transaction(), debt: 60, stock: 8, products: [{ id: "paper", name: "Kertas", unit: "lembar", isActive: true, stockGroupId: null, unitMultiplierToBase: null, conversionNeedsReview: false, costPrice: 1 }], journal: [{ productId: "paper", transactionId: "tx", sourceTransactionRef: "tx", stockGroupIdSnapshot: null, unitMultiplierSnapshot: 1, stockBaseDelta: -2, status: "APPROVED" }] };
    mocks.get.mockImplementation(async () => state.receipt);
    mocks.transaction.mockImplementation(async (fn: any) => {
      const local = structuredClone(state);
      const tx: any = {
        local,
        $queryRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => [{ id: values[0] }],
        $queryRawUnsafe: async (sql: string) => { calls.push(sql); return [{ id: "lock" }]; },
        printingReceipt: { findFirst: async ({ where }: any) => where.storeId === "store" ? structuredClone(local.receipt) : null, updateMany: async ({ data }: any) => { Object.assign(local.receipt, data, { revision: local.receipt.revision + 1 }); return { count: 1 }; } },
        transaction: { findFirst: async () => structuredClone(local.transaction), updateMany: async ({ data }: any) => { Object.assign(local.transaction, data); return { count: 1 }; } },
        transactionItem: { deleteMany: vi.fn(), createMany: async ({ data }: any) => { local.transaction.items = data; } },
        product: { findMany: async () => local.products },
        customer: { findFirst: async () => ({ id: "customer", totalDebt: local.debt }), updateMany: async ({ data }: any) => { local.debt += data.totalDebt.increment ?? -(data.totalDebt.decrement ?? 0); return { count: 1 }; } },
        inventoryLog: { findMany: async () => local.journal, createMany: async ({ data }: any) => { if (journalFails) throw new Error("journal failed"); local.journal.push(...data); } },
        invoiceDateChangeLog: { create: async ({ data }: any) => { local.dateAudit = data; } },
      };
      const result = await fn(tx); state = local; return result;
    });
    mocks.stock.mockImplementation(async (tx: any, { items }: any) => items.map((item: any) => { tx.local.stock += item.delta; return { productId: item.productId, stockGroupId: null, baseDelta: item.delta }; }));
  });
  const input = () => ({ revision: 2, number: "NT-1", document: document(150, 3) });
  async function save() {
    const review = await reviewProcessedPrintingReceipt("store", "receipt", input());
    return saveProcessedPrintingReceipt("store", "receipt", { ...input(), acknowledged: true, reviewToken: review.reviewToken }, { id: "owner", name: "Owner" });
  }
  it("atomically updates transaction, debt, stock and durable signed journal without changing payments", async () => {
    const payments = structuredClone(state.transaction.payments);
    await save();
    expect(state.transaction).toMatchObject({ total: 150, amountPaid: 40, status: "DP", discount: 0, taxRate: 0 });
    expect(state.transaction.payments).toEqual(payments);
    expect(state.debt).toBe(110); expect(state.stock).toBe(7);
    expect(state.journal.at(-1)).toMatchObject({ type: "OUT", reason: "USAGE", transactionId: "tx", sourceTransactionRef: "tx", stockBaseDelta: -1 });
    expect(state.receipt.revision).toBe(3);
    expect(calls[0]).toContain("pos_customers"); expect(calls[1]).toContain("pos_transactions"); expect(calls[2]).toContain("pos_printing_receipts");
  });
  it("appends an IN correction that later reversal can net against original usage", async () => {
    const next = { ...input(), document: document(100, 1) };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" });
    expect(state.stock).toBe(9); expect(state.journal.at(-1)).toMatchObject({ type: "IN", stockBaseDelta: 1, unitMultiplierSnapshot: 1 });
    expect(state.journal.reduce((sum: number, row: any) => sum + row.stockBaseDelta, 0)).toBe(-1);
    expect(planOutstandingReturns("DP", state.journal.map((row: any) => ({ ...row, baseDelta: row.stockBaseDelta })), true)).toEqual([{ productId: "paper", stockGroupIdSnapshot: null, baseDelta: 1 }]);
  });
  it("normalizes prior cash change when changing total so customer debt and later payments use net collections", async () => {
    Object.assign(state.transaction, { subtotal: 99, total: 99, amountPaid: 120, change: 21, status: "COMPLETED" });
    state.debt = 0;
    await save();
    expect(state.transaction).toMatchObject({ total: 150, amountPaid: 99, change: 0, status: "DP" });
    expect(state.debt).toBe(51);
  });
  it("preserves cash amount and change when only editing document details", async () => {
    Object.assign(state.transaction, { amountPaid: 120, change: 20, status: "COMPLETED" });
    const next = { ...input(), document: { ...document(), note: "Catatan baru" } };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" });
    expect(state.transaction).toMatchObject({ total: 100, amountPaid: 120, change: 20, note: "Catatan baru" });
  });
  it("preserves historical material cost on note-only changes and same-material quantity corrections", async () => {
    state.transaction.items[0].unitCost = 0.2;
    const next = { ...input(), document: { ...document(), note: "Catatan baru" } };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" });
    expect(state.transaction.items[0].unitCost).toBe(0.2);
    const changed = { ...input(), revision: 3, document: document(100, 3) };
    const secondReview = await reviewProcessedPrintingReceipt("store", "receipt", changed);
    await saveProcessedPrintingReceipt("store", "receipt", { ...changed, acknowledged: true, reviewToken: secondReview.reviewToken }, { id: "owner" });
    expect(state.transaction.items[0].unitCost).toBe(0.2);
    expect(state.transaction.items[0].rawMaterialQuantity).toBe(3);
  });
  it("applies tiny valid display quantities using their full stock-base delta", async () => {
    Object.assign(state.transaction.items[0], { rawMaterialQuantity: 1e-10 });
    state.receipt.document = document(100, 1e-10);
    Object.assign(state.products[0], { stockGroupId: "group", unitMultiplierToBase: 1e12 });
    Object.assign(state.journal[0], { stockGroupIdSnapshot: "group", unitMultiplierSnapshot: 1e12, stockBaseDelta: -100 });
    mocks.stock.mockImplementation(async (_tx: any, { items }: any) => items.map((item: any) => ({ productId: item.productId, stockGroupId: "group", baseDelta: item.delta * 1e12 })));
    const next = { ...input(), document: document(100, 2e-10) };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" });
    expect(state.journal.at(-1)).toMatchObject({ stockBaseDelta: -100, quantity: 1e-10 });
  });
  it("rolls back every mutation if the journal cannot persist", async () => {
    const before = structuredClone(state); journalFails = true;
    await expect(save()).rejects.toThrow("journal failed"); expect(state).toEqual(before);
  });
  it("does not apply stock or customer debt while awaiting approval", async () => {
    state.transaction.status = "PENDING_APPROVAL";
    await save(); expect(state.stock).toBe(8); expect(state.debt).toBe(60); expect(state.journal).toHaveLength(1);
  });
  it("rejects stale receipt, other store and altered or outdated payment review", async () => {
    await expect(reviewProcessedPrintingReceipt("other", "receipt", input())).rejects.toMatchObject({ status: 404 });
    await expect(reviewProcessedPrintingReceipt("store", "receipt", { ...input(), revision: 1 })).rejects.toMatchObject({ status: 409 });
    const review = await reviewProcessedPrintingReceipt("store", "receipt", input());
    state.transaction.amountPaid = 60;
    await expect(saveProcessedPrintingReceipt("store", "receipt", { ...input(), acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" })).rejects.toMatchObject({ status: 409 });
  });
  it("rejects a changed document, payment history, or stock unit after review", async () => {
    const review = await reviewProcessedPrintingReceipt("store", "receipt", input());
    const commit = { ...input(), acknowledged: true, reviewToken: review.reviewToken };
    await expect(saveProcessedPrintingReceipt("store", "receipt", { ...commit, document: document(160, 3) }, { id: "owner" })).rejects.toMatchObject({ status: 409 });
    state.transaction.payments.push({ id: "payment-adjustment", amount: 0, method: "CASH" });
    await expect(saveProcessedPrintingReceipt("store", "receipt", commit, { id: "owner" })).rejects.toMatchObject({ status: 409 });
    state.products[0].unit = "rim";
    await expect(saveProcessedPrintingReceipt("store", "receipt", commit, { id: "owner" })).rejects.toMatchObject({ status: 409 });
  });
  it("rejects missing stock evidence and changed conversion without any mutation", async () => {
    const before = structuredClone(state); state.journal = [];
    await expect(save()).rejects.toMatchObject({ status: 409 }); expect(state.stock).toBe(before.stock);
    state.journal = before.journal; state.products[0].stockGroupId = "group"; state.products[0].unitMultiplierToBase = 10;
    await expect(save()).rejects.toMatchObject({ status: 409 }); expect(state.stock).toBe(before.stock);
  });
  it("accepts equivalent fractional conversion snapshots despite floating point rounding", async () => {
    state.products[0].stockGroupId = "group"; state.products[0].unitMultiplierToBase = 0.1;
    Object.assign(state.journal[0], { stockGroupIdSnapshot: "group", unitMultiplierSnapshot: 0.10000000000000002, stockBaseDelta: -0.2 });
    expect(await reviewProcessedPrintingReceipt("store", "receipt", input())).toHaveProperty("reviewToken");
  });
  it("rolls back the receipt and financial changes when materials are insufficient", async () => {
    const before = structuredClone(state);
    mocks.stock.mockRejectedValueOnce(new Error("INSUFFICIENT_STOCK"));
    await expect(save()).rejects.toThrow(/stok bahan/i); expect(state).toEqual(before);
  });
  it("sets completed status on exact settlement and updates customer debt without additional payments", async () => {
    const next = { ...input(), document: document(40, 2) };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" });
    expect(state.transaction.status).toBe("COMPLETED"); expect(state.debt).toBe(0); expect(state.transaction.payments).toHaveLength(1);
  });
  it("audits changed invoice dates while retaining the invoice number and WIB clock", async () => {
    const next = { ...input(), document: { ...document(), date: "2026-10-20" } };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner", name: "Owner", role: "OWNER" });
    expect(state.transaction.invoiceDate.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(state.dateAudit).toMatchObject({ oldDocumentNumber: "NT-1", newDocumentNumber: "NT-1", actorId: "owner", actorRole: "OWNER" });
  });
  it("requires explicit acknowledgement and preserves customer and invoice identity", async () => {
    await expect(saveProcessedPrintingReceipt("store", "receipt", { ...input(), acknowledged: false, reviewToken: "bad" }, { id: "owner" })).rejects.toThrow(/setujui/i);
    await expect(reviewProcessedPrintingReceipt("store", "receipt", { ...input(), number: "NT-2" })).rejects.toThrow(/nomor/i);
    await expect(reviewProcessedPrintingReceipt("store", "receipt", { ...input(), document: { ...document(), customerId: "other" } })).rejects.toThrow(/pelanggan/i);
  });
});
