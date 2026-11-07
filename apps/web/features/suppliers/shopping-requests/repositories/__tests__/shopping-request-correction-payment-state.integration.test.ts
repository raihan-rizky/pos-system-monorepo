import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@pos/db";
import { loadCorrectionPaymentState } from "../shopping-request-correction-payment-state";
import { applyCorrectionFinance, buildCorrectionFinancePlan } from "../shopping-request-correction-finance";
import { GET as getGiro } from "@/app/api/finance/giro/route";
import { POST as paySupplier } from "@/app/api/finance/supplier-payables/[id]/payments/route";
import { randomUUID } from "node:crypto";
import { InventoryInboundReceiptRepository } from "@/features/inventory-management/repositories/InventoryInboundReceiptRepository";

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: async () => ({ id: userId, storeId }),
  requireRole: async () => ({ id: userId, storeId }),
  handleAuthError: () => null,
}));

const enabled = process.env.POS_SHOPPING_CORRECTION_INTEGRATION === "1";
const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const storeId = `payment-store-${run}`;
const userId = `payment-owner-${run}`;
let next = 0;

describe.skipIf(!enabled)("sumber pembayaran koreksi di PostgreSQL sementara", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/shopping_correction_test") {
      throw new Error("Pengujian hanya boleh memakai database sementara khusus.");
    }
    await db.store.create({ data: { id: storeId, name: "Toko Uji Pembayaran" } });
    await db.user.create({ data: { id: userId, username: userId, name: "Pemilik Uji", role: "OWNER", storeId } });
  });

  afterAll(async () => { await db.$disconnect(); });

  async function fixture(method: "TRANSFER" | "GIRO", amount: number) {
    const key = `${run}-${++next}`;
    const requestId = `payment-request-${key}`;
    const purchaseId = `payment-purchase-${key}`;
    const expenseId = `payment-expense-${key}`;
    await db.shoppingRequest.create({ data: { id: requestId, storeId, number: `DPB-${key}`, name: `Daftar ${key}`, sequence: next, status: "APPROVED" } });
    await db.goodsPurchase.create({ data: { id: purchaseId, storeId, number: `PB-${key}`, sequence: next, shoppingRequestId: requestId, activeShoppingRequestKey: requestId, supplierNameSnapshot: "Pemasok Uji", status: "APPROVED", totalAmount: amount, paymentMethod: method, createdById: userId } });
    await db.expense.create({ data: { id: expenseId, storeId, recordedById: userId, shoppingRequestId: requestId, goodsPurchaseId: purchaseId, applicantName: "Pemasok Uji", category: "SUPPLIES", amount, occurredAt: new Date("2026-10-01T19:00:00.000Z") } });
    return { requestId, purchaseId, expenseId, key };
  }

  it("menyimpan sumber Transfer asli dengan tanggal usaha WIB", async () => {
    const { purchaseId, expenseId } = await fixture("TRANSFER", 1000000);
    const result = await db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId, purchaseId }));
    expect(result).toEqual({
      sources: [{ paymentId: expenseId, sourceKind: "TRANSFER_EXPENSE", amount: "1000000.00", paidAt: "2026-10-02" }],
      allocations: [{ paymentId: expenseId, sourceKind: "TRANSFER_EXPENSE", amount: "1000000.00", method: "TRANSFER" }],
      paid: "1000000.00",
      byMethod: { TRANSFER: "1000000.00", GIRO: "0.00" },
    });
  });

  it("mencatat sumber Transfer tetap dan utang dari jadwal yang telah dikoreksi sebelum penerimaan", async () => {
    const { requestId, purchaseId, expenseId } = await fixture("TRANSFER", 10000);
    await db.expense.delete({ where: { id: expenseId } });
    await db.goodsPurchase.update({ where: { id: purchaseId }, data: { paymentMethod: null } });
    const payments = [{ method: "TRANSFER" as const, amount: 3000, dueDate: null, note: "DP" }, { method: "GIRO" as const, amount: 7000, dueDate: "2026-12-01", note: "Sisa" }];
    await db.goodsPurchasePayment.createMany({ data: payments.map(row => ({ ...row, goodsPurchaseId: purchaseId, dueDate: row.dueDate ? new Date(row.dueDate) : null })) });
    await db.shoppingRequestCorrection.create({ data: { storeId, shoppingRequestId: requestId, actorId: userId, reason: "Pra-penerimaan", idempotencyKey: purchaseId, requestFingerprint: purchaseId, beforeSnapshot: {}, afterSnapshot: { paymentSnapshot: { sources: [], allocations: [] } }, preview: {} } });
    await db.$transaction(tx => new InventoryInboundReceiptRepository().settleGoodsPurchasePayment(tx, { storeId, goodsPurchaseId: purchaseId, paymentMethod: null, paymentDueDate: null, payments, actor: { id: userId }, now: new Date("2026-11-01T18:00:00Z") }));
    const purchase = await db.goodsPurchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { supplierPayable: true } });
    expect(purchase.initialTransferAmount?.toFixed(2)).toBe("3000.00");
    expect(purchase.initialTransferPaidAt?.toISOString().slice(0, 10)).toBe("2026-11-02");
    expect(purchase.supplierPayable?.amount.toFixed(2)).toBe("10000.00");
    expect((await db.$transaction(tx => loadCorrectionPaymentState(tx, { storeId, purchaseId }))).paid).toBe("3000.00");
  });

  it("panel Giro hanya mengurangi alokasi Giro pada jadwal campuran", async () => {
    const { requestId, purchaseId, expenseId, key } = await fixture("TRANSFER", 10000);
    const payableId = `mixed-${key}`;
    await db.goodsPurchase.update({ where: { id: purchaseId }, data: { paymentMethod: null } });
    await db.goodsPurchasePayment.createMany({ data: [{ goodsPurchaseId: purchaseId, method: "TRANSFER", amount: 3000 }, { goodsPurchaseId: purchaseId, method: "GIRO", amount: 7000, dueDate: new Date("2026-12-01") }] });
    await db.supplierPayable.create({ data: { id: payableId, storeId, goodsPurchaseId: purchaseId, supplierName: "Uji", amount: 10000, debtDate: new Date("2026-11-01"), dueDate: new Date("2026-12-01"), giroHistoryVerifiedAt: new Date(), createdById: userId } });
    await db.$transaction(async tx => {
      const state = await loadCorrectionPaymentState(tx, { storeId, purchaseId });
      const audit = await tx.shoppingRequestCorrection.create({ data: { storeId, shoppingRequestId: requestId, actorId: userId, reason: "Campuran", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: { paymentSnapshot: { sources: state.sources, allocations: state.allocations } }, preview: {} } });
      await tx.shoppingRequestCorrectionAllocation.create({ data: { correctionId: audit.id, paymentId: expenseId, sourceKind: "TRANSFER_EXPENSE", method: "TRANSFER", amount: "3000.00", sourceAmount: "3000.00", paidAt: new Date("2026-10-02"), details: {} } });
    });
    const body = await (await getGiro(new Request("http://localhost/api/finance/giro"))).json();
    expect(body.items.find((row: { goodsPurchaseId: string }) => row.goodsPurchaseId === purchaseId)).toMatchObject({ amount: 7000, paid: 0, remaining: 7000 });
    const response = await paySupplier(new Request(`http://localhost/api/finance/supplier-payables/${payableId}/payments`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID() }, body: JSON.stringify({ amount: 7000, paidAt: "2026-11-02", expectedBalance: 7000 }) }), { params: Promise.resolve({ id: payableId }) });
    expect(response.status).toBe(201);
    expect((await db.$transaction(tx => loadCorrectionPaymentState(tx, { storeId, purchaseId }))).paid).toBe("10000.00");
  });

  it("memisahkan Transfer dari Giro yang belum dibayar pada jadwal campuran", async () => {
    const { purchaseId, key } = await fixture("TRANSFER", 1000000);
    await db.goodsPurchase.update({ where: { id: purchaseId }, data: { paymentMethod: null } });
    await db.$executeRaw`
      INSERT INTO "pos_goods_purchase_payments" ("id", "goodsPurchaseId", "method", "amount", "dueDate")
      VALUES (${`transfer-schedule-${key}`}, ${purchaseId}, 'TRANSFER', 300000, NULL),
        (${`giro-schedule-${key}`}, ${purchaseId}, 'GIRO', 700000, '2026-10-30'::date)
    `;
    expect((await db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId, purchaseId }))).paid).toBe("300000.00");
  });

  it("membaca beberapa Giro tanpa menggabungkan jatuh tempo atau membuat pembayaran", async () => {
    const { purchaseId, key } = await fixture("GIRO", 1000000);
    await db.goodsPurchase.update({ where: { id: purchaseId }, data: { paymentDueDate: new Date("2026-10-20T00:00:00.000Z") } });
    await db.supplierPayable.create({ data: { id: `schedule-payable-${key}`, storeId, goodsPurchaseId: purchaseId, supplierName: "Pemasok Uji", amount: 1000000, debtDate: new Date("2026-10-01T00:00:00.000Z"), giroHistoryVerifiedAt: new Date(), createdById: userId } });
    await db.$executeRaw`
      INSERT INTO "pos_goods_purchase_payments" ("id", "goodsPurchaseId", "method", "amount", "dueDate")
      VALUES (${`giro-first-${key}`}, ${purchaseId}, 'GIRO', 300000, '2026-10-20'::date),
        (${`giro-last-${key}`}, ${purchaseId}, 'GIRO', 700000, '2026-11-20'::date)
    `;
    expect((await db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId, purchaseId }))).paid).toBe("0.00");
    expect(await db.goodsPurchasePayment.count({ where: { goodsPurchaseId: purchaseId } })).toBe(2);
  });

  it("mempertahankan ID pembayaran Giro setelah pembayaran masuk snapshot koreksi", async () => {
    const { requestId, purchaseId, key } = await fixture("GIRO", 1000000);
    const paymentId = `stable-payment-${key}`;
    const source = { paymentId, sourceKind: "PAYABLE_PAYMENT" as const, amount: "300000.00", paidAt: "2026-10-03" };
    const allocation = { paymentId, sourceKind: "PAYABLE_PAYMENT" as const, amount: "300000.00", method: "GIRO" as const };
    await db.supplierPayable.create({ data: { id: `stable-payable-${key}`, storeId, goodsPurchaseId: purchaseId, supplierName: "Pemasok Uji", amount: 1000000, debtDate: new Date("2026-10-01T00:00:00.000Z"), giroHistoryVerifiedAt: new Date(), createdById: userId, payments: { create: { id: paymentId, amount: 300000, paidAt: new Date("2026-10-03T00:00:00.000Z"), createdById: userId } } } });
    const before = await (await getGiro(new Request("http://localhost/api/finance/giro"))).json();
    expect(before.items.find((item: { goodsPurchaseId: string }) => item.goodsPurchaseId === purchaseId).payments)
      .toEqual([{ id: paymentId, amount: 300000, paidAt: "2026-10-03" }]);
    await db.shoppingRequestCorrection.create({ data: { storeId, shoppingRequestId: requestId, actorId: userId, reason: "Koreksi", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: { paymentSnapshot: { sources: [source], allocations: [allocation] } }, preview: {}, allocations: { create: { paymentId, sourceKind: "PAYABLE_PAYMENT", method: "GIRO", amount: "300000.00", sourceAmount: "300000.00", paidAt: new Date("2026-10-03T00:00:00.000Z"), details: {} } } } });
    const after = await (await getGiro(new Request("http://localhost/api/finance/giro"))).json();
    expect(after.items.find((item: { goodsPurchaseId: string }) => item.goodsPurchaseId === purchaseId).payments)
      .toEqual([{ id: paymentId, amount: 300000, paidAt: "2026-10-03" }]);
  });

  it("mempertahankan sumber Transfer sebelum pengeluaran berubah dan menambahkan pembayaran Giro baru", async () => {
    const { requestId, purchaseId, expenseId, key } = await fixture("GIRO", 700000);
    const source = { paymentId: expenseId, sourceKind: "TRANSFER_EXPENSE" as const, amount: "1000000.00", paidAt: "2026-10-02" };
    const allocation = { paymentId: expenseId, sourceKind: "TRANSFER_EXPENSE" as const, amount: "1000000.00", method: "GIRO" as const };
    await db.shoppingRequestCorrection.create({ data: { storeId, shoppingRequestId: requestId, actorId: userId, reason: "Koreksi", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: { paymentSnapshot: { sources: [source], allocations: [allocation] } }, preview: {}, allocations: { create: { ...allocation, sourceAmount: source.amount, paidAt: new Date("2026-10-02T00:00:00.000Z"), details: {} } } } });
    await db.supplierPayable.create({ data: { id: `payable-${key}`, storeId, goodsPurchaseId: purchaseId, supplierName: "Pemasok Uji", amount: 700000, debtDate: new Date("2026-10-01T00:00:00.000Z"), giroHistoryVerifiedAt: new Date(), createdById: userId, payments: { create: { id: `payment-${key}`, amount: 200000, paidAt: new Date("2026-10-03T00:00:00.000Z"), createdById: userId } } } });
    const result = await db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId, purchaseId }));
    expect(result.sources).toEqual([source, { paymentId: `payment-${key}`, sourceKind: "PAYABLE_PAYMENT", amount: "200000.00", paidAt: "2026-10-03" }]);
    expect(result.allocations).toEqual([allocation, { paymentId: `payment-${key}`, sourceKind: "PAYABLE_PAYMENT", amount: "200000.00", method: "GIRO" }]);
    expect(result.paid).toBe("1200000.00");
    expect(result.byMethod).toEqual({ TRANSFER: "0.00", GIRO: "1200000.00" });
  });

  it("menolak riwayat Giro yang belum diverifikasi", async () => {
    const { purchaseId, key } = await fixture("GIRO", 700000);
    await db.supplierPayable.create({ data: { id: `payable-${key}`, storeId, goodsPurchaseId: purchaseId, supplierName: "Pemasok Uji", amount: 700000, debtDate: new Date("2026-10-01T00:00:00.000Z"), createdById: userId } });
    await expect(db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId, purchaseId }))).rejects.toThrow(/riwayat.*giro/i);
  });

  it("menolak snapshot yang tidak cocok dengan alokasi pembayaran tersimpan", async () => {
    const { requestId, purchaseId, expenseId, key } = await fixture("TRANSFER", 700000);
    const source = { paymentId: expenseId, sourceKind: "TRANSFER_EXPENSE" as const, amount: "1000000.00", paidAt: "2026-10-02" };
    const allocation = { paymentId: expenseId, sourceKind: "TRANSFER_EXPENSE" as const, amount: "1000000.00", method: "TRANSFER" as const };
    await db.shoppingRequestCorrection.create({ data: { storeId, shoppingRequestId: requestId, actorId: userId, reason: "Koreksi", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: { paymentSnapshot: { sources: [source], allocations: [allocation] } }, preview: {} } });
    await expect(db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId, purchaseId }))).rejects.toThrow(/alokasi.*pembayaran/i);
  });

  it("menunggu pembayaran Giro bersamaan sampai pembacaan terkunci selesai", async () => {
    const { purchaseId, key } = await fixture("GIRO", 700000);
    const payableId = `payable-${key}`;
    await db.supplierPayable.create({ data: { id: payableId, storeId, goodsPurchaseId: purchaseId, supplierName: "Pemasok Uji", amount: 700000, debtDate: new Date("2026-10-01T00:00:00.000Z"), giroHistoryVerifiedAt: new Date(), createdById: userId } });
    let release!: () => void;
    let ready!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { ready = resolve; });
    const reader = db.$transaction(async (tx) => {
      const state = await loadCorrectionPaymentState(tx, { storeId, purchaseId });
      ready();
      await hold;
      return state;
    }, { timeout: 15000 });
    await locked;
    let paymentFinished = false;
    const payment = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "pos_supplier_payables" WHERE "id" = ${payableId} FOR UPDATE`;
      await tx.supplierPayablePayment.create({ data: { id: `payment-${key}`, payableId, amount: 200000, paidAt: new Date("2026-10-03T00:00:00.000Z"), createdById: userId } });
      paymentFinished = true;
    }, { timeout: 15000 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(paymentFinished).toBe(false);
    } finally {
      release();
    }
    expect((await reader).paid).toBe("0.00");
    await payment;
    expect((await db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId, purchaseId }))).paid).toBe("200000.00");
  });

  it("menyimpan total terkoreksi dan sumber pembayaran dalam satu transaksi", async () => {
    const { requestId, purchaseId, expenseId, key } = await fixture("TRANSFER", 1000000);
    const lines = [{ receivedQty: 7, unitPrice: "100000.00" }];
    const result = await db.$transaction(async (tx) => {
      const state = await loadCorrectionPaymentState(tx, { storeId, purchaseId });
      const plan = buildCorrectionFinancePlan({ oldTotal: "1000000.00", lines, sources: state.sources, allocations: state.allocations, corrections: [] });
      const audit = await tx.shoppingRequestCorrection.create({ data: { storeId, shoppingRequestId: requestId, actorId: userId, reason: "Koreksi", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: { paymentSnapshot: plan.paymentSnapshot }, preview: {} } });
      const applied = await applyCorrectionFinance(tx, { storeId, purchaseId, correctionId: audit.id, actorId: userId, lines, allocations: state.allocations, corrections: [], method: "TRANSFER", dueDate: null });
      return { correctionId: audit.id, applied };
    });
    expect(result.applied).toMatchObject({ oldTotal: "1000000.00", newTotal: "700000.00", paid: "1000000.00", overpaid: "300000.00" });
    expect((await db.goodsPurchase.findUniqueOrThrow({ where: { id: purchaseId } })).totalAmount.toFixed(2)).toBe("700000.00");
    expect((await db.goodsPurchase.findUniqueOrThrow({ where: { id: purchaseId } })).totalBasis).toBe("RECEIVED");
    expect((await db.expense.findUniqueOrThrow({ where: { id: expenseId } })).amount.toFixed(2)).toBe("700000.00");
    expect(await db.shoppingRequestCorrectionAllocation.count({ where: { correctionId: result.correctionId } })).toBe(1);
    expect((await db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId, purchaseId }))).paid).toBe("1000000.00");
  });

  it("memperbarui satu jadwal Giro setelah total dan jatuh tempo dikoreksi", async () => {
    const { requestId, purchaseId, key } = await fixture("GIRO", 1000000);
    await db.goodsPurchase.update({ where: { id: purchaseId }, data: { paymentDueDate: new Date("2026-10-20T00:00:00.000Z") } });
    await db.goodsPurchasePayment.create({ data: { id: `schedule-${key}`, goodsPurchaseId: purchaseId, method: "GIRO", amount: 1000000, dueDate: new Date("2026-10-20T00:00:00.000Z") } });
    await db.supplierPayable.create({ data: { id: `payable-${key}`, storeId, goodsPurchaseId: purchaseId, supplierName: "Pemasok Uji", amount: 1000000, debtDate: new Date("2026-10-01T00:00:00.000Z"), dueDate: new Date("2026-10-20T00:00:00.000Z"), giroHistoryVerifiedAt: new Date(), createdById: userId } });
    const lines = [{ receivedQty: 7, unitPrice: "100000.00" }];
    await db.$transaction(async tx => {
      const state = await loadCorrectionPaymentState(tx, { storeId, purchaseId });
      const plan = buildCorrectionFinancePlan({ oldTotal: "1000000.00", lines, sources: state.sources, allocations: state.allocations, corrections: [] });
      const audit = await tx.shoppingRequestCorrection.create({ data: { storeId, shoppingRequestId: requestId, actorId: userId, reason: "Koreksi", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: { paymentSnapshot: plan.paymentSnapshot }, preview: {} } });
      await applyCorrectionFinance(tx, { storeId, purchaseId, correctionId: audit.id, actorId: userId, lines, allocations: state.allocations, corrections: [], method: "GIRO", dueDate: new Date("2026-10-30T00:00:00.000Z") });
    });
    const scheduled = await db.goodsPurchasePayment.findUniqueOrThrow({ where: { id: `schedule-${key}` } });
    expect(scheduled.amount.toFixed(2)).toBe("700000.00");
    expect(scheduled.dueDate?.toISOString().slice(0, 10)).toBe("2026-10-30");
    const body = await (await getGiro(new Request("http://localhost/api/finance/giro"))).json();
    expect(body.items.find((item: { goodsPurchaseId: string }) => item.goodsPurchaseId === purchaseId)).toMatchObject({ amount: 700000, dueDate: "2026-10-30" });
  });

  it("membatalkan total, alokasi, dan audit jika transaksi koreksi gagal", async () => {
    const { requestId, purchaseId, expenseId, key } = await fixture("TRANSFER", 1000000);
    const lines = [{ receivedQty: 7, unitPrice: "100000.00" }];
    await expect(db.$transaction(async (tx) => {
      const state = await loadCorrectionPaymentState(tx, { storeId, purchaseId });
      const plan = buildCorrectionFinancePlan({ oldTotal: "1000000.00", lines, sources: state.sources, allocations: state.allocations, corrections: [] });
      const audit = await tx.shoppingRequestCorrection.create({ data: { storeId, shoppingRequestId: requestId, actorId: userId, reason: "Koreksi", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: { paymentSnapshot: plan.paymentSnapshot }, preview: {} } });
      await applyCorrectionFinance(tx, { storeId, purchaseId, correctionId: audit.id, actorId: userId, lines, allocations: state.allocations, corrections: [], method: "TRANSFER", dueDate: null });
      throw new Error("Simulasi kegagalan");
    })).rejects.toThrow("Simulasi kegagalan");
    expect((await db.goodsPurchase.findUniqueOrThrow({ where: { id: purchaseId } })).totalAmount.toFixed(2)).toBe("1000000.00");
    expect((await db.expense.findUniqueOrThrow({ where: { id: expenseId } })).amount.toFixed(2)).toBe("1000000.00");
    expect(await db.shoppingRequestCorrection.count({ where: { shoppingRequestId: requestId } })).toBe(0);
  });

  it("menolak koreksi yang menunjuk pengeluaran dari toko lain", async () => {
    const { requestId, purchaseId, expenseId, key } = await fixture("TRANSFER", 1000000);
    const otherStore = `payment-other-${key}`;
    await db.store.create({ data: { id: otherStore, name: "Toko Lain" } });
    await db.expense.update({ where: { id: expenseId }, data: { storeId: otherStore } });
    await expect(db.$transaction(async (tx) => {
      const state = await loadCorrectionPaymentState(tx, { storeId, purchaseId });
      const lines = [{ receivedQty: 7, unitPrice: "100000.00" }];
      const plan = buildCorrectionFinancePlan({ oldTotal: "1000000.00", lines, sources: state.sources, allocations: state.allocations, corrections: [] });
      const audit = await tx.shoppingRequestCorrection.create({ data: { storeId, shoppingRequestId: requestId, actorId: userId, reason: "Koreksi", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: { paymentSnapshot: plan.paymentSnapshot }, preview: {} } });
      await applyCorrectionFinance(tx, { storeId, purchaseId, correctionId: audit.id, actorId: userId, lines, allocations: state.allocations, corrections: [], method: "TRANSFER", dueDate: null });
    })).rejects.toThrow(/toko|pengeluaran/i);
    expect((await db.expense.findUniqueOrThrow({ where: { id: expenseId } })).amount.toFixed(2)).toBe("1000000.00");
    expect((await db.goodsPurchase.findUniqueOrThrow({ where: { id: purchaseId } })).totalAmount.toFixed(2)).toBe("1000000.00");
    expect(await db.shoppingRequestCorrection.count({ where: { shoppingRequestId: requestId } })).toBe(0);
  });

  it("mengalihkan Transfer ke Giro sesuai alokasi tanpa membuat pembayaran baru", async () => {
    const { requestId, purchaseId, expenseId, key } = await fixture("TRANSFER", 1000000);
    const lines = [{ receivedQty: 7, unitPrice: "100000.00" }];
    await db.$transaction(async (tx) => {
      const state = await loadCorrectionPaymentState(tx, { storeId, purchaseId });
      const allocations = [{ paymentId: expenseId, sourceKind: "TRANSFER_EXPENSE" as const, method: "GIRO" as const, amount: "1000000.00" }];
      const plan = buildCorrectionFinancePlan({ oldTotal: "1000000.00", lines, sources: state.sources, allocations, corrections: [] });
      const audit = await tx.shoppingRequestCorrection.create({ data: { storeId, shoppingRequestId: requestId, actorId: userId, reason: "Koreksi metode", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: { paymentSnapshot: plan.paymentSnapshot }, preview: {} } });
      await applyCorrectionFinance(tx, { storeId, purchaseId, correctionId: audit.id, actorId: userId, lines, allocations, corrections: [], method: "GIRO", dueDate: new Date("2026-10-30T00:00:00.000Z") });
    });
    const purchase = await db.goodsPurchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { supplierPayable: { include: { payments: true } } } });
    expect(purchase.paymentMethod).toBe("GIRO");
    expect(purchase.supplierPayable?.amount.toFixed(2)).toBe("700000.00");
    expect(purchase.supplierPayable?.debtDate.toISOString().slice(0, 10)).toBe("2026-10-02");
    expect(purchase.supplierPayable?.payments).toHaveLength(0);
    const paymentState = await db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId, purchaseId }));
    expect(paymentState.paid).toBe("1000000.00");
    expect(paymentState.byMethod).toEqual({ TRANSFER: "0.00", GIRO: "1000000.00" });
    const response = await getGiro(new Request("http://localhost/api/finance/giro"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.find((item: { goodsPurchaseId: string }) => item.goodsPurchaseId === purchaseId))
      .toMatchObject({ status: "OVERPAID", paid: 1000000, remaining: 0, overpaid: 300000 });
  });

  it("mengalihkan Giro ke Transfer tanpa mencatat pengeluaran sebagai pembayaran baru", async () => {
    const { requestId, purchaseId, key } = await fixture("GIRO", 1000000);
    const payableId = `payable-transfer-${key}`;
    const paymentId = `payment-transfer-${key}`;
    await db.supplierPayable.create({ data: { id: payableId, storeId, goodsPurchaseId: purchaseId, supplierName: "Pemasok Uji", amount: 1000000, debtDate: new Date("2026-10-01T00:00:00.000Z"), giroHistoryVerifiedAt: new Date(), createdById: userId, payments: { create: { id: paymentId, amount: 300000, paidAt: new Date("2026-10-03T00:00:00.000Z"), createdById: userId } } } });
    const lines = [{ receivedQty: 7, unitPrice: "100000.00" }];
    await db.$transaction(async (tx) => {
      const state = await loadCorrectionPaymentState(tx, { storeId, purchaseId });
      const allocations = [{ paymentId, sourceKind: "PAYABLE_PAYMENT" as const, method: "TRANSFER" as const, amount: "300000.00" }];
      const plan = buildCorrectionFinancePlan({ oldTotal: "1000000.00", lines, sources: state.sources, allocations, corrections: [] });
      const audit = await tx.shoppingRequestCorrection.create({ data: { storeId, shoppingRequestId: requestId, actorId: userId, reason: "Koreksi metode", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: { paymentSnapshot: plan.paymentSnapshot }, preview: {} } });
      await applyCorrectionFinance(tx, { storeId, purchaseId, correctionId: audit.id, actorId: userId, lines, allocations, corrections: [], method: "TRANSFER", dueDate: null });
    });
    const purchase = await db.goodsPurchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { supplierPayable: { include: { payments: true } } } });
    expect(purchase.paymentMethod).toBe("TRANSFER");
    expect(purchase.totalAmount.toFixed(2)).toBe("700000.00");
    expect(purchase.supplierPayable?.payments.map((payment) => payment.id)).toEqual([paymentId]);
    const state = await db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId, purchaseId }));
    expect(state.paid).toBe("300000.00");
    expect(state.byMethod).toEqual({ TRANSFER: "300000.00", GIRO: "0.00" });
    const response = await getGiro(new Request("http://localhost/api/finance/giro"));
    const body = await response.json();
    expect(body.items.some((item: { goodsPurchaseId: string }) => item.goodsPurchaseId === purchaseId)).toBe(false);
  });

  it("menghitung alokasi pembayaran saat menerima pelunasan Giro yang dikoreksi", async () => {
    const { requestId, purchaseId, expenseId, key } = await fixture("TRANSFER", 600000);
    const lines = [{ receivedQty: 10, unitPrice: "100000.00" }];
    await db.$transaction(async (tx) => {
      const state = await loadCorrectionPaymentState(tx, { storeId, purchaseId });
      const allocations = [{ paymentId: expenseId, sourceKind: "TRANSFER_EXPENSE" as const, method: "GIRO" as const, amount: "600000.00" }];
      const plan = buildCorrectionFinancePlan({ oldTotal: "600000.00", lines, sources: state.sources, allocations, corrections: [] });
      const audit = await tx.shoppingRequestCorrection.create({ data: { storeId, shoppingRequestId: requestId, actorId: userId, reason: "Koreksi metode", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: { paymentSnapshot: plan.paymentSnapshot }, preview: {} } });
      await applyCorrectionFinance(tx, { storeId, purchaseId, correctionId: audit.id, actorId: userId, lines, allocations, corrections: [], method: "GIRO", dueDate: new Date("2026-10-30T00:00:00.000Z") });
    });
    const purchase = await db.goodsPurchase.findUniqueOrThrow({ where: { id: purchaseId }, include: { supplierPayable: true } });
    const payableId = purchase.supplierPayable!.id;
    const request = new Request(`http://localhost/api/finance/supplier-payables/${payableId}/payments`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ amount: 400000, paidAt: "2026-10-03", expectedBalance: 400000 }),
    });
    const response = await paySupplier(request, { params: Promise.resolve({ id: payableId }) });
    expect(response.status).toBe(201);
    const state = await db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId, purchaseId }));
    expect(state.paid).toBe("1000000.00");
    expect(await db.supplierPayablePayment.count({ where: { payableId } })).toBe(1);
  });

  it("menolak snapshot pembayaran yang tidak lengkap dan akses lintas toko", async () => {
    const { requestId, purchaseId, key } = await fixture("TRANSFER", 700000);
    await db.shoppingRequestCorrection.create({ data: { storeId, shoppingRequestId: requestId, actorId: userId, reason: "Koreksi", idempotencyKey: key, requestFingerprint: key, beforeSnapshot: {}, afterSnapshot: {}, preview: {} } });
    await expect(db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId, purchaseId }))).rejects.toThrow(/riwayat.*pembayaran/i);
    await expect(db.$transaction((tx) => loadCorrectionPaymentState(tx, { storeId: "toko-lain", purchaseId }))).rejects.toThrow(/pembelian.*tidak/i);
  });
});
