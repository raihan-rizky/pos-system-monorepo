import { db } from "@pos/db";
import { loadExpenseCorrectionCash } from "@/features/keuangan/repositories/expense-correction-cash-repository";
import { buildDailyIncome, buildDailyIncomeRange, buildIncomePeriod } from "../helpers/daily-income";
import { buildMonthlyPeriod } from "../helpers/monthly-report-core";

async function loadIncomeInputs(storeId: string, month: string, start: Date, end: Date, now: Date, includeOutstandingDp: boolean) {
  const bounds = { gte: start, lt: end };
  const paymentSelect = { id: true, method: true, amount: true, createdAt: true } as const;
  const paymentOrder = [{ createdAt: "asc" }, { id: "asc" }] as const;
  const [transactions, manualIncome, manualReceivables, correctionCash] = await db.$transaction(tx => Promise.all([
    tx.transaction.findMany({
      where: {
        storeId, status: { in: ["COMPLETED", "DP"] },
        OR: [
          { invoiceDate: bounds },
          { debtPaymentLogs: { some: { storeId, createdAt: bounds } } },
          ...(includeOutstandingDp ? [{ status: "DP" as const, paymentMethod: { not: "TEMPO" as const }, invoiceDate: { lt: end } }] : []),
        ],
      },
      select: {
        id: true, createdAt: true, invoiceDate: true, status: true, total: true, amountPaid: true, change: true, paymentMethod: true,
        transactionCategory: true, printingSubcategory: true, printingReceipt: { select: { subcategory: true } },
        items: { select: { subtotal: true, printingServiceId: true, product: { select: { category: { select: { name: true } } } } } },
        // Complete ledgers are needed to allocate refunds before filtering by day.
        payments: { select: paymentSelect, orderBy: [...paymentOrder] },
        debtPaymentLogs: { where: { storeId }, select: { id: true, paymentMethod: true, amount: true, createdAt: true }, orderBy: [...paymentOrder] },
      },
    }),
    tx.manualIncome.findMany({
      where: { storeId, deletedAt: null, occurredAt: bounds },
      select: { id: true, occurredAt: true, category: true, amount: true, payments: { select: { method: true, amount: true } } },
    }),
    tx.customerReceivable.findMany({
      where: { storeId, payments: { some: { createdAt: bounds } } },
      select: { id: true, amount: true, payments: { select: paymentSelect, orderBy: [...paymentOrder] } },
    }),
    loadExpenseCorrectionCash(tx, storeId, month, now),
  ]), { isolationLevel: "RepeatableRead", timeout: 30_000 });
  return { transactions, manualIncome, manualReceivables, supplierRefunds: correctionCash.refunds };
}

export async function loadDailyIncome(storeId: string, date: string, now = new Date()) {
  const { start, end } = buildDailyIncomeRange(date, now);
  const input = await loadIncomeInputs(storeId, date.slice(0, 7), start, end, now, true);
  return buildDailyIncome({ date, ...input });
}

export async function loadMonthlyIncome(storeId: string, month: string, now = new Date()) {
  const [year, monthNumber] = month.split("-").map(Number);
  const { start, end } = buildMonthlyPeriod(year, monthNumber, now);
  const input = await loadIncomeInputs(storeId, month, start, end, now, false);
  return buildIncomePeriod(input, start, end);
}
