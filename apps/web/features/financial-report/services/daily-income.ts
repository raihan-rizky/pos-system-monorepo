import { db } from "@pos/db";
import { buildDailyIncomeRange, jakartaToday } from "../helpers/daily-income";
import { buildIncomePeriod, type IncomePeriod } from "../helpers/income-period";

export async function loadIncomePeriod(storeId: string, fromDate: string, toDate: string): Promise<IncomePeriod> {
  const from = buildDailyIncomeRange(fromDate, new Date(`${fromDate}T12:00:00+07:00`));
  const to = buildDailyIncomeRange(toDate, new Date(`${toDate}T12:00:00+07:00`));
  if (to.start.getTime() < from.start.getTime()) throw new RangeError("Rentang tanggal tidak valid.");
  const today = jakartaToday();
  if (fromDate > today) return { days: [], contributions: [], outstandingDp: [] };
  const effectiveTo = toDate > today ? today : toDate;
  const start = from.start;
  const end = buildDailyIncomeRange(effectiveTo).end;
  const bounds = { gte: start, lt: end };
  const [transactions, manualIncome] = await Promise.all([
    db.transaction.findMany({
      where: {
        storeId, status: { in: ["COMPLETED", "DP"] },
        OR: [
          { payments: { some: { createdAt: bounds } } },
          { debtPaymentLogs: { some: { createdAt: bounds } } },
          { createdAt: bounds, offlineClientMutationId: { not: null } },
          { createdAt: bounds, paymentMethod: { not: "TEMPO" }, payments: { none: {} } },
          { status: "DP", paymentMethod: { not: "TEMPO" }, createdAt: { lt: end } },
        ],
      },
      select: {
        id: true, createdAt: true, offlineSyncMetadata: true, status: true, total: true, amountPaid: true, change: true, paymentMethod: true,
        transactionCategory: true, printingSubcategory: true, printingReceipt: { select: { subcategory: true } },
        items: { select: { subtotal: true, printingServiceId: true, product: { select: { category: { select: { name: true } } } } } },
        // Complete ledgers are needed to allocate refunds before filtering by day.
        payments: { select: { id: true, method: true, amount: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        debtPaymentLogs: { select: { id: true, paymentMethod: true, amount: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    }),
    db.manualIncome.findMany({
      where: { storeId, deletedAt: null, occurredAt: bounds },
      select: { id: true, occurredAt: true, category: true, amount: true },
    }),
  ]);
  return buildIncomePeriod({ fromDate, toDate: effectiveTo, transactions, manualIncome });
}

export async function loadDailyIncome(storeId: string, date: string) {
  buildDailyIncomeRange(date);
  const result = await loadIncomePeriod(storeId, date, date);
  return result.days[0];
}
