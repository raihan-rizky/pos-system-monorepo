import { db, type Prisma } from "@pos/db";
import { loadExpenseCorrectionCash } from "@/features/keuangan/repositories/expense-correction-cash-repository";
import { buildDailyIncomeRange, jakartaToday } from "../helpers/daily-income";
import { buildIncomePeriod, type IncomePeriod } from "../helpers/income-period";
import { loadManualReceivablePeriod } from "./manual-receivable-period";

async function loadSupplierRefunds(tx: Pick<Prisma.TransactionClient, "$queryRaw">, storeId: string, fromDate: string, toDate: string, now: Date) {
  const months: string[] = [];
  const firstMonth = new Date(`${fromDate.slice(0, 7)}-01T00:00:00Z`);
  const lastMonth = new Date(`${toDate.slice(0, 7)}-01T00:00:00Z`);
  for (const cursor = firstMonth; cursor <= lastMonth; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    months.push(cursor.toISOString().slice(0, 7));
  }
  const cash = await Promise.all(months.map(month => loadExpenseCorrectionCash(tx, storeId, month, now)));
  return cash.flatMap(period => period.refunds);
}

export async function loadIncomePeriod(storeId: string, fromDate: string, toDate: string, {
  initialPaymentDate = "invoice", includeSupplierRefunds = true, now = new Date(), client,
}: { initialPaymentDate?: "invoice" | "received"; includeSupplierRefunds?: boolean; now?: Date; client?: Prisma.TransactionClient } = {}): Promise<IncomePeriod> {
  const from = buildDailyIncomeRange(fromDate, new Date(`${fromDate}T12:00:00+07:00`));
  const to = buildDailyIncomeRange(toDate, new Date(`${toDate}T12:00:00+07:00`));
  if (to.start.getTime() < from.start.getTime()) throw new RangeError("Rentang tanggal tidak valid.");
  const today = jakartaToday(now);
  if (fromDate > today) return { days: [], contributions: [], outstandingDp: [] };
  const effectiveTo = toDate > today ? today : toDate;
  const start = from.start;
  const end = buildDailyIncomeRange(effectiveTo, now).end;
  const bounds = { gte: start, lt: end };
  const initialPaymentFilter = initialPaymentDate === "invoice" ? [
    { invoiceDate: bounds },
    { status: "DP" as const, paymentMethod: { not: "TEMPO" as const }, invoiceDate: { lt: end } },
  ] : [
    { payments: { some: { createdAt: bounds } } },
    { createdAt: bounds, paymentMethod: { not: "TEMPO" as const }, payments: { none: {} } },
    { status: "DP" as const, paymentMethod: { not: "TEMPO" as const }, createdAt: { lt: end } },
  ];
  const tx = client ?? db;
  const [transactions, manualIncome, manualReceivables, supplierRefunds] = await Promise.all([
    tx.transaction.findMany({
      where: {
        storeId, status: { in: ["COMPLETED", "DP"] },
        OR: [
          ...initialPaymentFilter,
          { debtPaymentLogs: { some: { storeId, createdAt: bounds } } },
          { createdAt: bounds, offlineClientMutationId: { not: null } },
        ],
      },
      select: {
        id: true, createdAt: true, invoiceDate: true, offlineSyncMetadata: true, status: true, total: true, amountPaid: true, change: true, paymentMethod: true,
        transactionCategory: true, printingSubcategory: true, printingReceipt: { select: { subcategory: true } },
        items: { select: { subtotal: true, printingServiceId: true, product: { select: { category: { select: { name: true } }, catalogSubcategory: { select: { group: true, name: true } } } } } },
        // Complete ledgers are needed to allocate refunds before filtering by day.
        payments: { select: { id: true, method: true, amount: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        debtPaymentLogs: { where: { storeId }, select: { id: true, paymentMethod: true, amount: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    }),
    tx.manualIncome.findMany({
      where: { storeId, deletedAt: null, occurredAt: bounds },
      select: { id: true, occurredAt: true, category: true, amount: true, payments: { select: { method: true, amount: true } } },
    }),
    loadManualReceivablePeriod(tx, storeId, fromDate, effectiveTo),
    includeSupplierRefunds ? loadSupplierRefunds(tx, storeId, fromDate, effectiveTo, now) : [],
  ]);
  return buildIncomePeriod({ fromDate, toDate: effectiveTo, transactions, manualIncome, manualReceivables, supplierRefunds, initialPaymentDate });
}

export async function loadDailyIncome(storeId: string, date: string) {
  buildDailyIncomeRange(date);
  const result = await loadIncomePeriod(storeId, date, date);
  return result.days[0];
}
