import { db } from "@pos/db";
import { buildDailyIncome, buildDailyIncomeRange } from "../helpers/daily-income";

export async function loadDailyIncome(storeId: string, date: string) {
  const { start, end } = buildDailyIncomeRange(date);
  const bounds = { gte: start, lt: end };
  const [transactions, manualIncome] = await Promise.all([
    db.transaction.findMany({
      where: {
        storeId, status: { in: ["COMPLETED", "DP"] },
        OR: [
          { invoiceDate: bounds },
          { debtPaymentLogs: { some: { createdAt: bounds } } },
          { status: "DP", paymentMethod: { not: "TEMPO" }, invoiceDate: { lt: end } },
        ],
      },
      select: {
        id: true, createdAt: true, invoiceDate: true, status: true, total: true, amountPaid: true, change: true, paymentMethod: true,
        transactionCategory: true, printingSubcategory: true, printingReceipt: { select: { subcategory: true } },
        items: { select: { subtotal: true, printingServiceId: true, product: { select: { category: { select: { name: true } } } } } },
        // Complete ledgers are needed to allocate refunds before filtering by day.
        payments: { select: { id: true, method: true, amount: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        debtPaymentLogs: { select: { id: true, paymentMethod: true, amount: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    }),
    db.manualIncome.findMany({
      where: { storeId, deletedAt: null, occurredAt: bounds },
      select: { id: true, occurredAt: true, category: true, amount: true, payments: { select: { method: true, amount: true } } },
    }),
  ]);
  return buildDailyIncome({ date, transactions, manualIncome });
}
