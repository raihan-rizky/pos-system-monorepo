import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, type Prisma } from "@pos/db";
import { applyExpenseSupplierCredit, listPayableSupplierCredits } from "../supplier-credit-repository";
import { commitGoodsExpenseCancellation, previewGoodsExpenseCancellation } from "../goods-expense-cancellation";
import { loadExpenseCorrectionCash } from "../expense-correction-cash-repository";
import { getMonthlyBalances } from "@/features/financial-report/services/monthly-balances";
import { buildMonthlyPeriod } from "@/features/financial-report/helpers/monthly-report-core";
import type { ExpenseCorrectionPreviewInput } from "../../helpers/expense-correction-input";

const enabled = process.env.POS_EXPENSE_CORRECTION_INTEGRATION === "1";
const run = crypto.randomUUID();
const actor = { id: `owner-credit-${run}`, name: "Pemilik Uji", storeId: `store-credit-${run}` };
const supplier = `credit-supplier-${run}`;
const otherSupplier = `other-credit-supplier-${run}`;
const day = new Date("2026-11-20T00:00:00Z");
let index = 0;

describe.skipIf(!enabled)("penggunaan kredit pemasok secara atomik", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55487" || url.pathname !== "/expense_correction_test") {
      throw new Error("Pengujian harus memakai PostgreSQL sementara khusus koreksi pengeluaran.");
    }
    await db.store.create({ data: { id: actor.storeId, name: "Toko Kredit Uji" } });
    await db.user.create({ data: { id: actor.id, username: actor.id, name: actor.name, storeId: actor.storeId, role: "OWNER" } });
    await db.supplier.createMany({ data: [
      { id: supplier, name: "Pemasok Kredit", type: "DISTRIBUTOR" },
      { id: otherSupplier, name: "Pemasok Lain", type: "DISTRIBUTOR" },
    ] });
  }, 30_000);

  afterAll(async () => { await db.$disconnect(); });

  async function makeCredit(amount: string) {
    const correction = await db.expenseCorrection.create({
      data: {
        storeId: actor.storeId, actorId: actor.id, actorName: actor.name, requestId: crypto.randomUUID(),
        action: "CANCEL", subjectKind: "GOODS_PURCHASE", subjectId: crypto.randomUUID(),
        reason: "Dana menjadi kredit", inputHash: "a".repeat(64), version: "b".repeat(64), before: {}, after: {},
        settlements: { create: [{
          paymentKind: "GOODS_INITIAL_TRANSFER", paymentId: crypto.randomUUID(), kind: "CREDIT",
          amount, reference: "NK-1", supplierId: supplier,
        }] },
      },
      include: { settlements: true },
    });
    return correction.settlements[0];
  }

  async function makePayable(amount: string, supplierId = supplier, legacyExpense = false) {
    const sequence = ++index;
    const request = await db.shoppingRequest.create({
      data: { storeId: actor.storeId, sequence, number: `DPB-CREDIT-${sequence}`, name: "Belanja Uji", status: "APPROVED" },
    });
    const purchase = await db.goodsPurchase.create({ data: {
      storeId: actor.storeId, sequence, number: `PB-CREDIT-${sequence}`, shoppingRequestId: request.id,
      activeShoppingRequestKey: request.id, supplierId, createdById: actor.id, supplierNameSnapshot: "Pemasok Kredit",
      status: "APPROVED", totalAmount: amount, paymentMethod: "GIRO", paymentDueDate: day,
    } });
    await db.expense.create({ data: {
      storeId: actor.storeId, recordedById: actor.id,
      ...(legacyExpense ? { shoppingRequestId: request.id } : { goodsPurchaseId: purchase.id }),
      applicantName: "Pemasok Kredit", category: "SUPPLIES", amount, occurredAt: day,
    } });
    return db.supplierPayable.create({ data: {
      id: crypto.randomUUID(), storeId: actor.storeId, supplierName: "Pemasok Kredit", amount, goodsPurchaseId: purchase.id,
      createdById: actor.id, debtDate: day, dueDate: day, giroHistoryVerifiedAt: day,
    } });
  }

  function application(payableId: string, creditId: string, amountCents = 70_000, requestId = crypto.randomUUID()) {
    return { payableId, creditId, amountCents, requestId };
  }

  it("memakai kredit sekali dan mempertahankan jumlah pembayaran kas", async () => {
    const [payable, credit] = await Promise.all([makePayable("900.00"), makeCredit("1000.00")]);
    const request = application(payable.id, credit.id);
    const result = await applyExpenseSupplierCredit(request, actor);
    await expect(applyExpenseSupplierCredit(request, actor)).resolves.toEqual(result);
    expect(await db.supplierPayablePayment.count({ where: { payableId: payable.id } })).toBe(0);
    await expect(listPayableSupplierCredits(payable.id, actor.storeId)).resolves.toMatchObject({
      remainingCents: 20_000,
      credits: expect.arrayContaining([{ id: credit.id, reference: "NK-1", remainingCents: 30_000 }]),
    });
  }, 30_000);

  it("menolak kredit pemasok lain dan akses tagihan dari toko lain", async () => {
    const [payable, credit] = await Promise.all([makePayable("900.00", otherSupplier), makeCredit("1000.00")]);
    await expect(applyExpenseSupplierCredit(application(payable.id, credit.id), actor))
      .rejects.toMatchObject({ status: 404 });
    await expect(applyExpenseSupplierCredit(application(payable.id, credit.id), { ...actor, storeId: "foreign" }))
      .rejects.toMatchObject({ status: 404 });
  }, 30_000);

  it("mencegah dua permintaan menghabiskan kredit atau saldo tagihan yang sama", async () => {
    const [first, second, payable, shared, left, right] = await Promise.all([
      makePayable("900.00"), makePayable("900.00"), makePayable("900.00"),
      makeCredit("1000.00"), makeCredit("1000.00"), makeCredit("1000.00"),
    ]);
    for (const inputs of [
      [application(first.id, shared.id), application(second.id, shared.id)],
      [application(payable.id, left.id), application(payable.id, right.id)],
    ]) {
      const results = await Promise.allSettled(inputs.map(input => applyExpenseSupplierCredit(input, actor)));
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    }
  }, 30_000);

  it("mengembalikan kredit terpakai saat pembelian dibatalkan dan mencatat pengembalian kas pada tanggal diterima", async () => {
    const [payable, recipient, credit] = await Promise.all([
      makePayable("900.00", supplier, true), makePayable("900.00"), makeCredit("1000.00"),
    ]);
    await applyExpenseSupplierCredit(application(payable.id, credit.id, 30_000), actor);
    const payment = await db.supplierPayablePayment.create({ data: {
      id: crypto.randomUUID(), payableId: payable.id, amount: 200, paidAt: new Date("2026-11-20T00:00:00Z"), createdById: actor.id,
    } });
    const now = new Date("2026-12-05T07:00:00Z");
    const input: ExpenseCorrectionPreviewInput = {
      subject: { type: "GOODS_PURCHASE", id: payable.goodsPurchaseId! }, operation: "cancel",
      draft: { reason: "Pembelian dikembalikan", dispositions: [{
        kind: "refund", paymentId: payment.id, amountCents: 20_000, reference: "REF-201", date: "2026-12-05",
      }] },
    };
    const review = await previewGoodsExpenseCancellation(input, actor, now);
    expect(review.blockers).toEqual([]);
    expect(review.impact.before.remainingCents).toBe(40_000);
    expect(review.impact.after.remainingCents).toBe(0);
    await commitGoodsExpenseCancellation({ ...input, version: review.version, requestId: crypto.randomUUID() }, actor, now);
    const purchase = await db.goodsPurchase.findUniqueOrThrow({ where: { id: payable.goodsPurchaseId! } });
    expect(await db.expense.findFirst({ where: { shoppingRequestId: purchase.shoppingRequestId } })).toMatchObject({ deletedAt: now });
    expect(await loadExpenseCorrectionCash(db, actor.storeId, "2026-11", now)).toMatchObject({ refunds: [], outflow: [{ date: "2026-11-20", total: 200 }] });
    expect(await loadExpenseCorrectionCash(db, actor.storeId, "2026-12", now)).toMatchObject({ outflow: [], refunds: [{ date: "2026-12-05", total: 200 }] });
    // The test database uses db push and lacks the inventory valuation SQL functions.
    // Exercise the actual supplier debt query without the independent inventory read.
    const debtReader = { $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) =>
      query.join("").includes('"pos_supplier_payables"') ? db.$queryRaw(query, ...values) : Promise.resolve([]) };
    const balances = await getMonthlyBalances(actor.storeId, buildMonthlyPeriod(2026, 12, now), now, debtReader as Prisma.TransactionClient);
    expect(balances.supplierDebts.some(debt => debt.id === payable.id)).toBe(false);
    expect(await listPayableSupplierCredits(recipient.id, actor.storeId)).toMatchObject({
      credits: expect.arrayContaining([{ id: credit.id, reference: credit.reference, remainingCents: 100_000 }]),
    });
  }, 30_000);
});
