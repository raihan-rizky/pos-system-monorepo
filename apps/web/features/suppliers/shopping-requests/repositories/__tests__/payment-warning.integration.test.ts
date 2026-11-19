import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const auth = vi.hoisted(() => ({ user: { id: "", storeId: "" } }));
vi.mock("@/lib/rbac/guard", () => ({ requireRole: async () => auth.user, requirePermission: async () => auth.user, handleAuthError: () => null }));
import { db } from "@pos/db";
import { loadShoppingRequestCorrectionEditor } from "../shopping-request-correction-editor";
import { planShoppingRequestCorrection } from "../shopping-request-correction-plan";
import { commitShoppingRequestCorrectionRecord } from "../shopping-request-correction-repository";
import { loadCorrectionPaymentState } from "../shopping-request-correction-payment-state";
import { refreshReceivedPurchaseTotal } from "../refresh-received-purchase-total";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";
import { GET as listGiro } from "@/app/api/finance/giro/route";
import { POST as payGiro } from "@/app/api/finance/supplier-payables/[id]/payments/route";
import { loadRecognizedExpenses } from "@/features/keuangan/services/recognized-finance";
import { getMonthlyFinancialReport } from "@/features/financial-report/services/monthly-report";

const enabled = process.env.POS_PAYMENT_WARNING_INTEGRATION === "1";
const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const actor = { id: `owner-${run}`, name: "Pemilik Uji", storeId: `store-${run}` };
const ids = Object.fromEntries(
  ["category", "product", "request", "requestItem", "purchase", "purchaseItem", "receipt", "line", "log", "batch", "expense", "pending"].map(
    name => [name, `${name}-${run}`],
  ),
) as Record<"category" | "product" | "request" | "requestItem" | "purchase" | "purchaseItem" | "receipt" | "line" | "log" | "batch" | "expense" | "pending", string>;

describe.skipIf(!enabled)("koreksi pembayaran dengan penerimaan tertunda", () => {
  beforeAll(async () => {
    auth.user = { id: actor.id, storeId: actor.storeId };
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55440" || url.pathname !== "/payment_warning_test") {
      throw new Error("Pengujian hanya boleh memakai database sementara khusus.");
    }
    await db.store.create({ data: { id: actor.storeId, name: "Toko Uji" } });
    await db.user.create({ data: { id: actor.id, username: actor.id, name: actor.name, role: "OWNER", storeId: actor.storeId } });
    await db.category.create({ data: { id: ids.category, name: `Kategori ${run}` } });
    await db.product.create({ data: { id: ids.product, sku: `SKU-${run}`, name: "Kertas", unit: "lembar", stock: 20, price: 500000, costPrice: 446807.8, categoryId: ids.category, storeId: actor.storeId } });
    await db.shoppingRequest.create({ data: { id: ids.request, number: `DPB-${run}`, name: "Daftar Uji", sequence: 1, storeId: actor.storeId, status: "APPROVED" } });
    await db.shoppingRequestItem.create({ data: { id: ids.requestItem, shoppingRequestId: ids.request, productId: ids.product, productName: "Kertas", unit: "lembar", stockOnHand: 0, requestedQty: 20, approvedQty: 20, decisionStatus: "APPROVED" } });
    await db.goodsPurchase.create({ data: {
      id: ids.purchase, number: `PB-${run}`, sequence: 1, storeId: actor.storeId, shoppingRequestId: ids.request, activeShoppingRequestKey: ids.request,
      supplierNameSnapshot: "Toko", status: "APPROVED", fulfillmentStatus: "PARTIALLY_RECEIVED", totalAmount: 8936156, totalBasis: "ORDERED",
      paymentMethod: "TRANSFER", initialTransferAmount: 8936156, initialTransferPaidAt: new Date("2026-11-12T00:00:00.000Z"), createdById: actor.id,
    } });
    await db.goodsPurchaseItem.create({ data: { id: ids.purchaseItem, goodsPurchaseId: ids.purchase, shoppingRequestItemId: ids.requestItem, productId: ids.product, productNameSnapshot: "Kertas", skuSnapshot: `SKU-${run}`, unitSnapshot: "lembar", unitMultiplierSnapshot: 1, quantity: 20, latestUnitPrice: 446807.8, lineTotal: 8936156 } });
    await db.goodsPurchasePayment.create({ data: { goodsPurchaseId: ids.purchase, method: "TRANSFER", amount: 8936156 } });
    await db.expense.create({ data: { id: ids.expense, storeId: actor.storeId, recordedById: actor.id, goodsPurchaseId: ids.purchase, shoppingRequestId: ids.request, applicantName: "Toko", category: "SUPPLIES", amount: 8936156, occurredAt: new Date("2026-11-12T00:00:00.000Z") } });
    await db.inventoryLog.create({ data: { id: ids.log, productId: ids.product, type: "IN", reason: "RESTOCK", quantity: 10, unitCost: 446807.8, createdBy: actor.id, stockBaseDelta: 10, unitMultiplierSnapshot: 1 } });
    await db.batchOperation.create({ data: { id: ids.batch, type: "INBOUND_RECEIPT", status: "COMMITTED", storeId: actor.storeId, createdBy: actor.id, summary: { source: "INBOUND_RECEIPT", receiptId: ids.receipt, goodsPurchaseId: ids.purchase } } });
    await db.batchOperationItem.create({ data: { batchOperationId: ids.batch, productId: ids.product, sku: `SKU-${run}`, action: "STOCK_IN", inventoryLogId: ids.log, afterSnapshot: { unit: "lembar", inboundReceiptImpact: { kind: "CANONICAL", receiptId: ids.receipt, receiptLineId: ids.line, stockGroupId: null, delta: 10, baseDelta: 10 } } } });
    await db.inventoryInboundReceipt.create({ data: {
      id: ids.receipt, storeId: actor.storeId, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, stockBundleId: ids.batch, status: "APPROVED",
      lines: { create: { id: ids.line, productId: ids.product, shoppingRequestItemId: ids.requestItem, goodsPurchaseItemId: ids.purchaseItem, status: "RECEIVED", expectedQuantity: 20, receivedQuantity: 10, productNameSnapshot: "Kertas", skuSnapshot: `SKU-${run}`, expectedQuantitySnapshot: 20, receivedQuantitySnapshot: 10, inventoryLogId: ids.log } },
    } });
    await db.inventoryInboundReceipt.create({ data: {
      id: ids.pending, storeId: actor.storeId, shoppingRequestId: ids.request, goodsPurchaseId: ids.purchase, status: "SUBMITTED",
      paymentMethod: "TRANSFER", paymentSchedule: [{ method: "TRANSFER", amount: 8936156, dueDate: null, note: null }],
      lines: { create: { productId: ids.product, shoppingRequestItemId: ids.requestItem, goodsPurchaseItemId: ids.purchaseItem, status: "RECEIVED", reviewStatus: "PENDING", expectedQuantity: 10, receivedQuantity: 5, productNameSnapshot: "Kertas", skuSnapshot: `SKU-${run}`, expectedQuantitySnapshot: 10, receivedQuantitySnapshot: 5 } },
    } });
  });

  afterAll(async () => { await db.$disconnect(); });

  it("tidak mengubah total atau membuat riwayat ketika koreksi tidak mengandung perubahan", async () => {
    const makeData = async (key: string) => {
      const editor = await db.$transaction(tx => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
      return { idempotencyKey: key, expectedVersion: editor.version, reason: "Periksa pembayaran", header: editor.header,
        items: editor.items, catalog: [], payment: { ...editor.payment, corrections: [] } };
    };
    const pending = await makeData("no-change-pending");
    await expect(db.$transaction(tx => planShoppingRequestCorrection(tx, { storeId: actor.storeId, requestId: ids.request, data: pending })))
      .rejects.toMatchObject({ status: 422, message: expect.stringMatching(/tidak ada perubahan/i) });
    await db.inventoryInboundReceipt.update({ where: { id: ids.pending }, data: { status: "REJECTED" } });
    try {
      const noPending = await makeData("no-change-no-pending");
      await expect(db.$transaction(tx => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data: noPending })))
        .rejects.toMatchObject({ status: 422, message: expect.stringMatching(/tidak ada perubahan/i) });
      const purchase = await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } });
      expect(purchase.totalAmount.toFixed(2)).toBe("8936156.00");
      expect(purchase.totalBasis).toBe("ORDERED");
      expect((await db.expense.findUniqueOrThrow({ where: { id: ids.expense } })).amount.toFixed(2)).toBe("8936156.00");
      expect(await db.shoppingRequestCorrection.count({ where: { shoppingRequestId: ids.request } })).toBe(0);
    } finally {
      await db.inventoryInboundReceipt.update({ where: { id: ids.pending }, data: { status: "SUBMITTED" } });
    }
  });

  it("menyimpan Transfer dan Giro sambil mempertahankan total pesanan dan riwayat pembayaran", async () => {
    await db.expense.update({ where: { id: ids.expense }, data: { amount: "8800000.00" } });
    const editor = await db.$transaction(tx => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    expect(editor.pendingReceipts).toHaveLength(1);
    expect(editor.totalAmount).toBe("8936156.00");
    expect(editor.expenseMismatch).toBe(true);
    const source = editor.payment.sources[0];
    expect(source).toMatchObject({ paymentId: ids.expense, amount: "8936156.00" });
    const schedule = [
      { method: "TRANSFER" as const, amount: "4947500.00", dueDate: null, note: null },
      { method: "GIRO" as const, amount: "3988656.00", dueDate: "2026-12-05", note: null },
    ];
    const data = {
      idempotencyKey: "payment-only", expectedVersion: editor.version, reason: "Koreksi pembayaran", header: editor.header,
      items: editor.items, catalog: [],
      payment: {
        method: null, dueDate: null, schedule,
        corrections: [{ ...source, amount: "4947500.00" }],
        allocations: [{ paymentId: source.paymentId, sourceKind: source.sourceKind, method: "TRANSFER" as const, amount: "4947500.00" }],
      },
    };
    const plan = await db.$transaction(tx => planShoppingRequestCorrection(tx, { storeId: actor.storeId, requestId: ids.request, data }));
    expect(plan.preview).toMatchObject({ oldTotal: "8936156.00", newTotal: "8936156.00", paid: "4947500.00" });
    const result = await db.$transaction(tx => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data }), { timeout: 30000 });
    const purchase = await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase }, include: { payments: true, supplierPayable: true } });
    expect(purchase.totalAmount.toFixed(2)).toBe("8936156.00");
    expect(purchase.totalBasis).toBe("ORDERED");
    expect(purchase.payments.map(row => [row.method, row.amount.toFixed(2)])).toEqual(expect.arrayContaining([["TRANSFER", "4947500.00"], ["GIRO", "3988656.00"]]));
    expect(purchase.supplierPayable?.dueDate?.toISOString().slice(0, 10)).toBe("2026-12-05");
    const expense = await db.expense.findUniqueOrThrow({ where: { id: ids.expense } });
    expect(expense.amount.toFixed(2)).toBe("8800000.00");
    expect(expense.occurredAt.toISOString().slice(0, 10)).toBe("2026-11-12");
    expect((await db.product.findUniqueOrThrow({ where: { id: ids.product } })).stock).toBe(20);
    const paymentState = await db.$transaction(tx => loadCorrectionPaymentState(tx, { storeId: actor.storeId, purchaseId: ids.purchase }));
    expect(paymentState.paid).toBe("4947500.00");
    expect(Number(purchase.supplierPayable!.amount) - Number(paymentState.paid)).toBe(3988656);
    const audit = await db.shoppingRequestCorrection.findUniqueOrThrow({ where: { id: result.correctionId } });
    expect(audit.beforeSnapshot).toMatchObject({ payment: { schedule: [{ method: "TRANSFER", amount: "8936156.00" }] } });
    expect(audit.afterSnapshot).toMatchObject({ data: { payment: { schedule } } });
    const listed = await new InventoryInboundReceiptRepository().listInboundReceipts(actor.storeId, { goodsPurchaseId: ids.purchase });
    const pending = listed.find(row => row.id === ids.pending);
    expect(pending?.paymentScheduleChanged).toBe(true);
    expect(pending?.currentPurchasePayments).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "TRANSFER", amount: 4947500 }),
      expect.objectContaining({ method: "GIRO", amount: 3988656, dueDate: "2026-12-05" }),
    ]));
    await db.$transaction(tx => new InventoryInboundReceiptRepository().settleGoodsPurchasePayment(tx, {
      storeId: actor.storeId, goodsPurchaseId: ids.purchase, paymentMethod: "TRANSFER", paymentDueDate: null,
      payments: [{ method: "TRANSFER", amount: 8936156, dueDate: null }], actor,
      now: new Date("2026-11-19T08:00:00.000Z"),
    }));
    await db.$transaction(tx => refreshReceivedPurchaseTotal(tx, { storeId: actor.storeId, purchaseId: ids.purchase }));
    const afterRefresh = await db.goodsPurchase.findUniqueOrThrow({ where: { id: ids.purchase } });
    expect(afterRefresh.totalAmount.toFixed(2)).toBe("8936156.00");
    expect(afterRefresh.totalBasis).toBe("ORDERED");
    expect(afterRefresh.initialTransferAmount?.toFixed(2)).toBe("8936156.00");

    const currentEditor = await db.$transaction(tx => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const stockChange = {
      ...data, idempotencyKey: "pending-stock-change", expectedVersion: currentEditor.version,
      header: currentEditor.header,
      items: currentEditor.items.map(item => ({
        ...item, receipts: item.receipts.map(receipt => ({ ...receipt, receivedQty: receipt.receivedQty - 1 })),
      })),
      payment: { ...data.payment, corrections: [], allocations: currentEditor.payment.allocations },
    };
    await expect(db.$transaction(tx => planShoppingRequestCorrection(tx, { storeId: actor.storeId, requestId: ids.request, data: stockChange })))
      .rejects.toThrow(/menunggu persetujuan/i);
  });

  it("menyamakan saldo Giro yang ditampilkan dengan validasi pembayaran aktual", async () => {
    await db.expense.update({ where: { id: ids.expense }, data: { amount: "8936156.00" } });
    const recognized = await loadRecognizedExpenses(actor.storeId, "2026-11", new Date("2026-11-19T12:00:00Z"));
    expect(recognized).toMatchObject({ incomplete: false, monthlyTotal: 4947500 });
    expect(await getMonthlyFinancialReport(actor.storeId, 2026, 11, new Date("2026-11-19T12:00:00Z")))
      .toMatchObject({ supplierDebtBalance: 3988656 });
    const payable = await db.supplierPayable.findFirstOrThrow({ where: { goodsPurchaseId: ids.purchase, storeId: actor.storeId } });
    const read = async () => {
      const response = await listGiro(new Request("http://localhost/api/finance/giro"));
      expect(response.status).toBe(200);
      return (await response.json()).items.find((item: { goodsPurchaseId: string }) => item.goodsPurchaseId === ids.purchase);
    };
    expect(await read()).toMatchObject({ amount: 3988656, status: "PARTIAL", remaining: 3988656 });
    const response = await payGiro(new Request("http://localhost/api/finance/supplier-payables/payment", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ amount: "1000", paidAt: "2026-11-19", expectedBalance: "3988656" }),
    }), { params: Promise.resolve({ id: payable.id }) });
    expect(response.status).toBe(201);
    expect(await read()).toMatchObject({ amount: 3988656, remaining: 3987656 });
    const editor = await db.$transaction(tx => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: ids.request }));
    const transfer = editor.payment.sources.find(source => source.sourceKind === "TRANSFER_EXPENSE")!;
    const giro = editor.payment.sources.find(source => source.sourceKind === "PAYABLE_PAYMENT")!;
    const data = { idempotencyKey: "correct-paid-full", expectedVersion: editor.version, reason: "Perbaiki transfer tercatat", header: editor.header,
      items: editor.items, catalog: [], payment: { method: editor.payment.method, dueDate: editor.payment.dueDate, schedule: editor.payment.schedule,
        corrections: [{ ...transfer, amount: "8935156.00" }], allocations: [
          { sourceKind: transfer.sourceKind, paymentId: transfer.paymentId, method: "TRANSFER" as const, amount: "8935156.00" },
          { sourceKind: giro.sourceKind, paymentId: giro.paymentId, method: "GIRO" as const, amount: "1000.00" },
        ] } };
    await db.$transaction(tx => commitShoppingRequestCorrectionRecord(tx, { requestId: ids.request, actor, data }), { timeout: 30000 });
    expect(await read()).toMatchObject({ amount: 3988656, status: "PAID", remaining: 0 });
    expect(await loadRecognizedExpenses(actor.storeId, "2026-11", new Date("2026-11-19T12:00:00Z")))
      .toMatchObject({ incomplete: false, monthlyTotal: 8936156 });
    expect(await getMonthlyFinancialReport(actor.storeId, 2026, 11, new Date("2026-11-19T12:00:00Z")))
      .toMatchObject({ supplierDebtBalance: 0 });
    const rejected = await payGiro(new Request("http://localhost/api/finance/supplier-payables/payment", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ amount: "1000", paidAt: "2026-11-19", expectedBalance: "3988656" }),
    }), { params: Promise.resolve({ id: payable.id }) });
    expect(rejected.status).toBe(409);
  });

  it("memakai jadwal terkoreksi pada penerimaan pertama dan mencatat transfer serta utang dengan benar", async () => {
    const requestId = `first-request-${run}`, requestItemId = `first-request-item-${run}`;
    const purchaseId = `first-purchase-${run}`, purchaseItemId = `first-purchase-item-${run}`;
    await db.shoppingRequest.create({ data: { id: requestId, number: `DPB-FIRST-${run}`, name: "Daftar Pertama", sequence: 2, storeId: actor.storeId, status: "APPROVED" } });
    await db.shoppingRequestItem.create({ data: { id: requestItemId, shoppingRequestId: requestId, productId: ids.product, productName: "Kertas", unit: "lembar", stockOnHand: 0, requestedQty: 20, approvedQty: 20, decisionStatus: "APPROVED" } });
    await db.goodsPurchase.create({ data: {
      id: purchaseId, number: `PB-FIRST-${run}`, sequence: 2, storeId: actor.storeId, shoppingRequestId: requestId, activeShoppingRequestKey: requestId,
      supplierNameSnapshot: "Toko", status: "APPROVED", fulfillmentStatus: "NOT_RECEIVED", totalAmount: 8936156, totalBasis: "ORDERED",
      paymentMethod: "TRANSFER", createdById: actor.id,
    } });
    await db.goodsPurchaseItem.create({ data: { id: purchaseItemId, goodsPurchaseId: purchaseId, shoppingRequestItemId: requestItemId, productId: ids.product, productNameSnapshot: "Kertas", skuSnapshot: `SKU-${run}`, unitSnapshot: "lembar", unitMultiplierSnapshot: 1, quantity: 20, latestUnitPrice: 446807.8, lineTotal: 8936156 } });
    await db.goodsPurchasePayment.create({ data: { goodsPurchaseId: purchaseId, method: "TRANSFER", amount: 8936156 } });
    await db.inventoryInboundReceipt.create({ data: {
      id: `first-pending-${run}`, storeId: actor.storeId, shoppingRequestId: requestId, goodsPurchaseId: purchaseId, status: "SUBMITTED",
      paymentMethod: "TRANSFER", paymentSchedule: [{ method: "TRANSFER", amount: 8936156, dueDate: null, note: null }],
      lines: { create: { productId: ids.product, shoppingRequestItemId: requestItemId, goodsPurchaseItemId: purchaseItemId, status: "RECEIVED", reviewStatus: "PENDING", expectedQuantity: 20, receivedQuantity: 10, productNameSnapshot: "Kertas", skuSnapshot: `SKU-${run}`, expectedQuantitySnapshot: 20, receivedQuantitySnapshot: 10 } },
    } });
    const editor = await db.$transaction(tx => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId }));
    const data = {
      idempotencyKey: "first-payment-only", expectedVersion: editor.version, reason: "Koreksi pembayaran", header: editor.header,
      items: editor.items, catalog: [],
      payment: { method: null, dueDate: null, allocations: [], corrections: [], schedule: [
        { method: "TRANSFER" as const, amount: "4947500.00", dueDate: null, note: null },
        { method: "GIRO" as const, amount: "3988656.00", dueDate: "2026-12-05", note: null },
      ] },
    };
    await db.$transaction(tx => commitShoppingRequestCorrectionRecord(tx, { requestId, actor, data }), { timeout: 30000 });
    expect(await db.expense.count({ where: { goodsPurchaseId: purchaseId } })).toBe(0);
    const listed = await new InventoryInboundReceiptRepository().listInboundReceipts(actor.storeId, { goodsPurchaseId: purchaseId });
    expect(listed[0].firstReceiptTransferAmount).toBe(4947500);
    await db.$transaction(tx => new InventoryInboundReceiptRepository().settleGoodsPurchasePayment(tx, {
      storeId: actor.storeId, goodsPurchaseId: purchaseId, paymentMethod: "TRANSFER", paymentDueDate: null,
      payments: [{ method: "TRANSFER", amount: 8936156, dueDate: null }], actor,
      now: new Date("2026-11-19T08:00:00.000Z"),
    }));
    const purchase = await db.goodsPurchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { supplierPayable: true } });
    expect(purchase.initialTransferAmount?.toFixed(2)).toBe("4947500.00");
    expect(purchase.supplierPayable?.dueDate?.toISOString().slice(0, 10)).toBe("2026-12-05");
    const paid = await db.$transaction(tx => loadCorrectionPaymentState(tx, { storeId: actor.storeId, purchaseId }));
    expect(paid.paid).toBe("4947500.00");
    expect(Number(purchase.supplierPayable!.amount) - Number(paid.paid)).toBe(3988656);
  });
});
