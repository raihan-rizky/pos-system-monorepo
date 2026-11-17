import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPrintingReceiptDocument } from "../domain";
import { planProcessedPrintingReceiptEdit, type ProcessedPaymentMethod, type ProcessedPrintingReceiptInput, type ProcessedPrintingReceiptTransactionInput } from "../processed-edit";
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
const transaction = () => ({ id: "tx", storeId: "store", invoiceNumber: "NT-1", subtotal: 100, discount: 0, tax: 0, taxRate: 0, taxMethod: "STANDARD", total: 100, amountPaid: 40, change: 0, status: "DP", customerId: "customer", invoiceDate: new Date("2026-10-21T00:00:00Z"), paymentMethod: "CASH", salesName: null, salespersonId: null, stockManagedBySuratJalan: false, stockDeductionSource: "TRANSACTION", items: [{ id: "item", productId: null, printingServiceId: null, productName: "Cetak", material: "Kertas", quantity: 1, unitPrice: 100, discount: 0, subtotal: 100, rawMaterialProductId: "paper", rawMaterialQuantity: 2, rawMaterialUnit: "lembar" }], payments: [{ id: "pay", amount: 40, method: "CASH", createdAt: new Date("2026-10-21T10:00:00Z") }], debtPaymentLogs: [] });

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
    state = { receipt: { id: "receipt", storeId: "store", number: "NT-1", revision: 2, transactionId: "tx", document: document() }, transaction: transaction(), debt: 60, stock: 8, salespersons: [{ id: "sales-1", name: "Sales Lama" }, { id: "sales-2", name: "Sales Baru" }], products: [{ id: "paper", name: "Kertas", unit: "lembar", isActive: true, stockGroupId: null, unitMultiplierToBase: null, conversionNeedsReview: false, costPrice: 1 }], journal: [{ productId: "paper", transactionId: "tx", sourceTransactionRef: "tx", stockGroupIdSnapshot: null, unitMultiplierSnapshot: 1, stockBaseDelta: -2, status: "APPROVED" }] };
    state.spent = 0;
    mocks.get.mockImplementation(async () => state.receipt);
    mocks.transaction.mockImplementation(async (fn: any) => {
      const local = structuredClone(state);
      const tx: any = {
        local,
        $queryRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => [{ id: values[0] }],
        $queryRawUnsafe: async (sql: string) => { calls.push(sql); return [{ id: "lock" }]; },
        printingReceipt: { findFirst: async ({ where }: any) => where.storeId === "store" ? structuredClone(local.receipt) : null, updateMany: async ({ data }: any) => { Object.assign(local.receipt, data, { revision: local.receipt.revision + 1 }); return { count: 1 }; } },
        transaction: { findFirst: async () => structuredClone(local.transaction), findFirstOrThrow: async () => ({ ...structuredClone(local.transaction), printingReceipt: structuredClone(local.receipt) }), updateMany: async ({ data }: any) => { Object.assign(local.transaction, data); return { count: 1 }; } },
        transactionPayment: { updateMany: async ({ where, data }: any) => { const row = local.transaction.payments.find((payment: any) => payment.id === where.id); if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 }; }, create: async ({ data }: any) => { const row = { id: "payment-new", ...data }; local.transaction.payments.push(row); return row; } },
        debtPaymentLog: { create: async ({ data }: any) => { const log = { id: "debt-new", createdAt: new Date(), ...data }; local.transaction.debtPaymentLogs.push(log); return log; } },
        salesperson: { findFirst: async ({ where }: any) => where.storeId === "store" ? structuredClone(local.salespersons.find((salesperson: any) => salesperson.id === where.id) ?? null) : null },
        transactionItem: { deleteMany: vi.fn(), createMany: async ({ data }: any) => { local.transaction.items = data; } },
        product: { findMany: async () => local.products },
        customer: { findFirst: async () => ({ id: "customer", totalDebt: local.debt, totalSpent: local.spent }), updateMany: async ({ data }: any) => { local.debt += data.totalDebt.increment ?? -(data.totalDebt.decrement ?? 0); local.spent += data.totalSpent?.increment ?? 0; return { count: 1 }; } },
        inventoryLog: { findMany: async () => local.journal, createMany: async ({ data }: any) => { if (journalFails) throw new Error("journal failed"); local.journal.push(...data); } },
        invoiceDateChangeLog: { create: async ({ data }: any) => { local.dateAudit = data; } },
        transactionReceiptChange: { create: async ({ data }: any) => { local.receiptChange = data; return { id: "receipt-change" }; } },
        user: { findMany: async () => [] },
        notification: { createMany: vi.fn() },
      };
      const result = await fn(tx); state = local; return result;
    });
    mocks.stock.mockImplementation(async (tx: any, { items }: any) => items.map((item: any) => { tx.local.stock += item.delta; return { productId: item.productId, stockGroupId: null, baseDelta: item.delta }; }));
  });
  const transactionEdit = (initialPayments: ProcessedPrintingReceiptTransactionInput["initialPayments"], additionalPayments: ProcessedPrintingReceiptTransactionInput["additionalPayments"] = [], salespersonId: string | null = null): ProcessedPrintingReceiptTransactionInput => ({ initialPayments, additionalPayments, salespersonId });
  const input = (): ProcessedPrintingReceiptInput => {
    const paidBefore = Number(state.transaction.amountPaid) - Number(state.transaction.change) - state.transaction.debtPaymentLogs.reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);
    const initialPayments = state.transaction.payments.length
      ? state.transaction.payments.map(({ id, method, amount }: any) => ({ sourcePaymentId: id, method: method as ProcessedPaymentMethod, amount: Number(amount) }))
      : paidBefore > 0 && state.transaction.paymentMethod !== "TEMPO"
        ? [{ sourcePaymentId: null, method: (state.transaction.paymentMethod ?? "CASH") as ProcessedPaymentMethod, amount: paidBefore }]
        : [];
    return { revision: 2, number: "NT-1", document: document(150, 3), transaction: { initialPayments, additionalPayments: [], salespersonId: state.transaction.salespersonId ?? null } };
  };
  async function save() {
    const review = await reviewProcessedPrintingReceipt("store", "receipt", input());
    return saveProcessedPrintingReceipt("store", "receipt", { ...input(), acknowledged: true, reviewToken: review.reviewToken }, { id: "owner", name: "Owner" }, { canView: true, canEdit: true });
  }
  it("denies a debt correction without an explicit receivable grant and leaves every document unchanged", async () => {
    const before = structuredClone(state);
    const review = await reviewProcessedPrintingReceipt("store", "receipt", input());
    await expect(saveProcessedPrintingReceipt("store", "receipt", { ...input(), acknowledged: true, reviewToken: review.reviewToken }, { id: "sales", role: "SALES" })).rejects.toMatchObject({status:403});
    expect(state).toEqual(before);
    expect(mocks.stock).not.toHaveBeenCalled();
  });
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
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true });
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
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true });
    expect(state.transaction).toMatchObject({ total: 100, amountPaid: 120, change: 20, note: "Catatan baru" });
  });
  it("preserves historical material cost on note-only changes and same-material quantity corrections", async () => {
    state.transaction.items[0].unitCost = 0.2;
    const next = { ...input(), document: { ...document(), note: "Catatan baru" } };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true });
    expect(state.transaction.items[0].unitCost).toBe(0.2);
    const changed = { ...input(), revision: 3, document: document(100, 3) };
    const secondReview = await reviewProcessedPrintingReceipt("store", "receipt", changed);
    await saveProcessedPrintingReceipt("store", "receipt", { ...changed, acknowledged: true, reviewToken: secondReview.reviewToken }, { id: "owner" }, { canView: true, canEdit: true });
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
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true });
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
    await expect(saveProcessedPrintingReceipt("store", "receipt", { ...input(), acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true })).rejects.toMatchObject({ status: 409 });
  });
  it("rejects a changed document, payment history, or stock unit after review", async () => {
    const review = await reviewProcessedPrintingReceipt("store", "receipt", input());
    const commit = { ...input(), acknowledged: true, reviewToken: review.reviewToken };
    await expect(saveProcessedPrintingReceipt("store", "receipt", { ...commit, document: document(160, 3) }, { id: "owner" }, { canView: true, canEdit: true })).rejects.toMatchObject({ status: 409 });
    state.transaction.payments.push({ id: "payment-adjustment", amount: 0, method: "CASH" });
    await expect(saveProcessedPrintingReceipt("store", "receipt", commit, { id: "owner" }, { canView: true, canEdit: true })).rejects.toMatchObject({ status: 409 });
    state.products[0].unit = "rim";
    await expect(saveProcessedPrintingReceipt("store", "receipt", commit, { id: "owner" }, { canView: true, canEdit: true })).rejects.toMatchObject({ status: 409 });
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
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true });
    expect(state.transaction.status).toBe("COMPLETED"); expect(state.debt).toBe(0); expect(state.transaction.payments).toHaveLength(1);
  });
  it("updates split payment methods and preserves amounts and timestamps", async () => {
    const original = [
      { id: "p1", amount: 40, method: "CASH", createdAt: new Date("2026-11-13T10:00:00Z") },
      { id: "p2", amount: 60, method: "TRANSFER", createdAt: new Date("2026-11-13T11:00:00Z") },
    ];
    state.transaction.payments = original;
    state.transaction.debtPaymentLogs = [{ id: "debt-pay", amount: 5, createdAt: new Date("2026-11-13T12:00:00Z") }];
    const debtPayments = structuredClone(state.transaction.debtPaymentLogs);
    const next = { ...input(), transaction: transactionEdit([{ sourcePaymentId: "p1", method: "DEBIT", amount: 40 }, { sourcePaymentId: "p2", method: "QRIS", amount: 60 }]) };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true });
    expect(state.transaction.payments).toEqual([{ ...original[0], method: "DEBIT" }, { ...original[1], method: "QRIS" }]);
    expect(state.transaction.paymentMethod).toBe("QRIS");
    expect(state.transaction.debtPaymentLogs).toEqual(debtPayments);
    expect(review.transaction.initialPayments).toEqual([
      { sourcePaymentId: "p1", amount: 40, beforeMethod: "CASH", method: "DEBIT" },
      { sourcePaymentId: "p2", amount: 60, beforeMethod: "TRANSFER", method: "QRIS" },
    ]);
  });
  it("keeps TEMPO as the summary method when an initial payment method changes", async () => {
    state.transaction.paymentMethod = "TEMPO";
    state.transaction.payments = [{ id: "p1", amount: 20, method: "CASH", createdAt: new Date("2026-11-13T10:00:00Z") }];
    const next = { ...input(), transaction: transactionEdit([{ sourcePaymentId: "p1", method: "TRANSFER", amount: 20 }]) };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true });
    expect(state.transaction.paymentMethod).toBe("TEMPO");
    expect(state.transaction.payments[0]).toMatchObject({ amount: 20, method: "TRANSFER" });
  });
  it("updates a legacy method without creating payment rows", async () => {
    state.transaction.payments = [];
    const next = { ...input(), transaction: transactionEdit([{ sourcePaymentId: null, method: "QRIS", amount: 40 }]) };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true });
    expect(state.transaction.paymentMethod).toBe("QRIS");
    expect(state.transaction.payments).toEqual([]);
  });
  it("updates a same-store salesperson assignment", async () => {
    const next = { ...input(), transaction: transactionEdit([{ sourcePaymentId: "pay", method: "CASH", amount: 40 }], [], "sales-2") };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true });
    expect(state.transaction).toMatchObject({ salespersonId: "sales-2", salesName: "Sales Baru" });
    expect(review.transaction.salesperson).toEqual({ before: { id: null, name: null }, after: { id: "sales-2", name: "Sales Baru" } });
  });
  it("keeps TEMPO when no initial payment rows exist", async () => {
    state.transaction.paymentMethod = "TEMPO";
    state.transaction.payments = [];
    const next = { ...input(), transaction: transactionEdit([]) };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true });
    expect(state.transaction.paymentMethod).toBe("TEMPO");
    expect(state.transaction.payments).toEqual([]);
  });
  it("rejects payment IDs outside the transaction without mutating records", async () => {
    const before = structuredClone(state);
    const next = { ...input(), transaction: transactionEdit([{ sourcePaymentId: "foreign", method: "QRIS", amount: 40 }]) };
    await expect(reviewProcessedPrintingReceipt("store", "receipt", next)).rejects.toMatchObject({ status: 409 });
    expect(state).toEqual(before);
  });
  it("rejects salesperson IDs outside the store without mutating records", async () => {
    const before = structuredClone(state);
    const next = { ...input(), transaction: transactionEdit([{ sourcePaymentId: "pay", method: "CASH", amount: 40 }], [], "other-store-sales") };
    await expect(reviewProcessedPrintingReceipt("store", "receipt", next)).rejects.toThrow("Sales transaksi tidak ditemukan di toko ini.");
    expect(state).toEqual(before);
  });
  it("invalidates a reviewed payment correction if a payment changes before commit", async () => {
    const next = { ...input(), transaction: transactionEdit([{ sourcePaymentId: "pay", method: "QRIS", amount: 40 }]) };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    state.transaction.payments[0].method = "DEBIT";
    const beforeCommit = structuredClone(state);
    await expect(saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true })).rejects.toMatchObject({ status: 409 });
    expect(state).toEqual(beforeCommit);
  });
  it("invalidates a reviewed salesperson correction if the salesperson changes before commit", async () => {
    const next = { ...input(), transaction: transactionEdit([{ sourcePaymentId: "pay", method: "CASH", amount: 40 }], [], "sales-2") };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    state.transaction.salespersonId = "sales-1";
    const beforeCommit = structuredClone(state);
    await expect(saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true })).rejects.toMatchObject({ status: 409 });
    expect(state).toEqual(beforeCommit);
  });
  it("invalidates a reviewed salesperson correction if the selected salesperson is renamed", async () => {
    const next = { ...input(), transaction: transactionEdit([{ sourcePaymentId: "pay", method: "CASH", amount: 40 }], [], "sales-2") };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    state.salespersons[1].name = "Nama Sales Baru";
    const beforeCommit = structuredClone(state);
    await expect(saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true })).rejects.toMatchObject({ status: 409 });
    expect(state).toEqual(beforeCommit);
  });
  it("records payment and salesperson edits in the existing receipt audit", async () => {
    state.transaction.salespersonId = "sales-1";
    state.transaction.salesName = "Sales Lama";
    const next = { ...input(), transaction: transactionEdit([{ sourcePaymentId: "pay", method: "QRIS", amount: 40 }], [], "sales-2") };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "sales-user", name: "Sales", role: "SALES" }, { canView: true, canEdit: true });
    expect(state.receiptChange.before.salespersonId).toBe("sales-1");
    expect(state.receiptChange.after.salespersonId).toBe("sales-2");
    expect(state.receiptChange.before.payments).toEqual([{ method: "CASH", amount: 40 }]);
    expect(state.receiptChange.after.payments).toEqual([{ method: "QRIS", amount: 40 }]);
  });
  it("audits changed invoice dates while retaining the invoice number and WIB clock", async () => {
    const next = { ...input(), document: { ...document(), date: "2026-10-20" } };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner", name: "Owner", role: "OWNER" }, { canView: true, canEdit: true });
    expect(state.transaction.invoiceDate.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(state.dateAudit).toMatchObject({ oldDocumentNumber: "NT-1", newDocumentNumber: "NT-1", actorId: "owner", actorRole: "OWNER" });
  });
  it("requires explicit acknowledgement and preserves customer and invoice identity", async () => {
    await expect(saveProcessedPrintingReceipt("store", "receipt", { ...input(), acknowledged: false, reviewToken: "bad" }, { id: "owner" }, { canView: true, canEdit: true })).rejects.toThrow(/setujui/i);
    await expect(reviewProcessedPrintingReceipt("store", "receipt", { ...input(), number: "NT-2" })).rejects.toThrow(/nomor/i);
    await expect(reviewProcessedPrintingReceipt("store", "receipt", { ...input(), document: { ...document(), customerId: "other" } })).rejects.toThrow(/pelanggan/i);
  });

  it("splits an initial payment without changing its amount or received date", async () => {
    const receivedAt = state.transaction.payments[0].createdAt;
    const next: ProcessedPrintingReceiptInput = {
      ...input(),
      transaction: {
        initialPayments: [
          { sourcePaymentId: "pay", method: "CASH", amount: 25 },
          { sourcePaymentId: "pay", method: "QRIS", amount: 15 },
        ],
        additionalPayments: [],
        salespersonId: null,
      },
    };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true, canCreatePayment: true });

    expect(state.transaction.payments).toHaveLength(2);
    expect(state.transaction.payments.reduce((sum: number, payment: any) => sum + payment.amount, 0)).toBe(40);
    expect(state.transaction.payments.every((payment: any) => payment.createdAt.getTime() === receivedAt.getTime())).toBe(true);
    expect(state.transaction.amountPaid).toBe(40);
    expect(state.transaction.debtPaymentLogs).toHaveLength(0);
  });

  it("records a new partial payment as a dated debt log and updates balances atomically", async () => {
    const receivedAt = state.transaction.payments[0].createdAt;
    const next: ProcessedPrintingReceiptInput = {
      ...input(),
      transaction: {
        initialPayments: [{ sourcePaymentId: "pay", method: "CASH", amount: 40 }],
        additionalPayments: [{ method: "TRANSFER", amount: 25 }],
        salespersonId: null,
      },
    };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true, canCreatePayment: true });

    expect(state.transaction.debtPaymentLogs).toHaveLength(1);
    expect(state.transaction.debtPaymentLogs[0]).toMatchObject({ amount: 25, paymentMethod: "TRANSFER", customerId: "customer", storeId: "store" });
    expect(state.transaction.debtPaymentLogs[0].createdAt.getTime()).toBeGreaterThan(receivedAt.getTime());
    expect(state.transaction.amountPaid).toBe(65);
    expect(state.transaction.status).toBe("DP");
    expect(state.debt).toBe(85);
    expect(state.spent).toBe(25);
  });

  it("completes the transaction when a new payment settles the recalculated total", async () => {
    const next: ProcessedPrintingReceiptInput = {
      ...input(),
      transaction: {
        initialPayments: [{ sourcePaymentId: "pay", method: "CASH", amount: 40 }],
        additionalPayments: [{ method: "QRIS", amount: 110 }],
        salespersonId: null,
      },
    };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    await saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true, canCreatePayment: true });

    expect(state.transaction.status).toBe("COMPLETED");
    expect(state.transaction.amountPaid).toBe(150);
    expect(state.debt).toBe(0);
    expect(state.spent).toBe(110);
  });

  it("rejects a new payment without the receivable payment grant before mutating records", async () => {
    const next: ProcessedPrintingReceiptInput = {
      ...input(),
      transaction: {
        initialPayments: [{ sourcePaymentId: "pay", method: "CASH", amount: 40 }],
        additionalPayments: [{ method: "QRIS", amount: 25 }],
        salespersonId: null,
      },
    };
    const review = await reviewProcessedPrintingReceipt("store", "receipt", next);
    const before = structuredClone(state);

    await expect(saveProcessedPrintingReceipt("store", "receipt", { ...next, acknowledged: true, reviewToken: review.reviewToken }, { id: "owner" }, { canView: true, canEdit: true, canCreatePayment: false })).rejects.toMatchObject({ statusCode: 403 });
    expect(state).toEqual(before);
  });
});

describe("processed receipt payment allocations", () => {
  const planPayments = (tx: any, transactionInput: any) => planProcessedPrintingReceiptEdit(tx, document(150), transactionInput);

  it("preserves the original paid total when one payment is split across methods", () => {
    const plan = planPayments(transaction(), {
      initialPayments: [
        { sourcePaymentId: "pay", method: "CASH", amount: 25 },
        { sourcePaymentId: "pay", method: "QRIS", amount: 15 },
      ],
      additionalPayments: [],
      salespersonId: null,
    });

    expect(plan.after).toEqual({ subtotal: 150, total: 150, paid: 40, debt: 110, status: "DP" });
    expect(plan.transaction).not.toBeNull();
    expect(plan.transaction!.initialPayments).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourcePaymentId: "pay", method: "CASH", amount: 25 }),
      expect.objectContaining({ sourcePaymentId: "pay", method: "QRIS", amount: 15 }),
    ]));
  });

  it("adds a partial new payment to paid amount and remaining debt", () => {
    const plan = planPayments(transaction(), {
      initialPayments: [{ sourcePaymentId: "pay", method: "CASH", amount: 40 }],
      additionalPayments: [{ method: "TRANSFER", amount: 25 }],
      salespersonId: null,
    });

    expect(plan.after).toEqual({ subtotal: 150, total: 150, paid: 65, debt: 85, status: "DP" });
    expect(plan.transaction).not.toBeNull();
    expect(plan.transaction!.additionalPayments).toEqual([{ method: "TRANSFER", amount: 25 }]);
  });

  it("marks the receipt completed when additional payments settle the new total", () => {
    const plan = planPayments(transaction(), {
      initialPayments: [{ sourcePaymentId: "pay", method: "CASH", amount: 40 }],
      additionalPayments: [{ method: "QRIS", amount: 110 }],
      salespersonId: null,
    });

    expect(plan.after).toEqual({ subtotal: 150, total: 150, paid: 150, debt: 0, status: "COMPLETED" });
  });

  it("rejects an initial allocation that does not preserve its source amount", () => {
    expect(() => planPayments(transaction(), {
      initialPayments: [{ sourcePaymentId: "pay", method: "CASH", amount: 39 }],
      additionalPayments: [],
      salespersonId: null,
    })).toThrow(/pembagian pembayaran/i);
  });

  it("rejects additional payments above the recalculated debt", () => {
    expect(() => planPayments(transaction(), {
      initialPayments: [{ sourcePaymentId: "pay", method: "CASH", amount: 40 }],
      additionalPayments: [{ method: "QRIS", amount: 111 }],
      salespersonId: null,
    })).toThrow(/melebihi/i);
  });

  it("rejects additional payments while approval is pending", () => {
    expect(() => planPayments({ ...transaction(), status: "PENDING_APPROVAL" }, {
      initialPayments: [{ sourcePaymentId: "pay", method: "CASH", amount: 40 }],
      additionalPayments: [{ method: "QRIS", amount: 1 }],
      salespersonId: null,
    })).toThrow(/persetujuan/i);
  });
});
