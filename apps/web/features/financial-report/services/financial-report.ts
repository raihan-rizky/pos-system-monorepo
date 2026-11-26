import { db } from "@pos/db";
import { buildReportSummaryCatalog } from "../helpers/report-breakdowns";
import { recognizedExpenseFilter } from "@/features/keuangan/helpers/recognized-expense-filter";
import { findInitialCollections } from "./initial-collections";
import { loadReceivableBalance } from "@/features/customer-debt/services/receivable-balance";
import { withManualPayableSnapshot } from "./manual-payable-period";
import { loadManualReceivablePeriod } from "./manual-receivable-period";
import { buildFinancialReport } from "../helpers/report-core";

function addOneJakartaDay(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function toDateBounds(dateFrom: string, dateTo: string) {
  return {
    gte: new Date(`${dateFrom}T00:00:00+07:00`),
    lt: addOneJakartaDay(dateTo),
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString()) || 0;
  }
  return 0;
}

export async function loadFinancialReport(storeId: string, dateFrom: string, dateTo: string, {
  canReadReceivableBalance = false, includeSummaryCatalog = false, includeExpenses = true,
}: { canReadReceivableBalance?: boolean; includeSummaryCatalog?: boolean; includeExpenses?: boolean } = {}) {
  const dateBounds = toDateBounds(dateFrom, dateTo);
  const receivableBalancePromise = canReadReceivableBalance
    ? loadReceivableBalance(storeId, dateTo)
    : Promise.resolve(undefined);

  const [
    transactions,
    shifts,
    inventoryLogs,
    expenseSnapshot,
    debtPayments,
    collectionTransactions,
    receivableBalance,
    manualIncome,
    manualReceivables,
  ] = await Promise.all([
    db.transaction.findMany({
      where: {
        storeId,
        status: { in: ["COMPLETED", "DP"] },
        invoiceDate: dateBounds,
      },
      orderBy: { invoiceDate: "desc" },
      select: {
        id: true,
        invoiceNumber: true,
        transactionCategory: true,
        printingSubcategory: true,
        printingReceipt: { select: { subcategory: true } },
        invoiceDate: true,
        createdAt: true,
        status: true,
        paymentMethod: true,
        total: true,
        amountPaid: true,
        change: true,
        discount: true,
        salesName: true,
        salesperson: { select: { name: true } },
        payments: {
          select: { method: true, amount: true, createdAt: true },
        },
        debtPaymentLogs: { select: { id: true } },
        items: {
          select: {
            productId: true,
            printingServiceId: true,
            productName: true,
            quantity: true,
            subtotal: true,
            unitCost: true,
            product: {
              select: {
                category: { select: { name: true } },
                catalogSubcategory: { select: { group: true, name: true } },
              },
            },
          },
        },
      },
    }),
    db.cashierShift.findMany({
      where: {
        storeId,
        openedAt: dateBounds,
      },
      orderBy: { openedAt: "desc" },
      select: {
        id: true,
        openedAt: true,
        closedAt: true,
        openingBalance: true,
        expectedBalance: true,
        closingBalance: true,
        discrepancy: true,
        status: true,
        cashier: { select: { name: true } },
      },
    }),
    db.inventoryLog.findMany({
      where: {
        product: { storeId },
        createdAt: dateBounds,
        OR: [
          { reason: { in: ["WASTE", "USAGE", "OPNAME", "MANUAL_ADJUSTMENT"] } },
          { reason: null },
        ],
      },
      select: {
        type: true,
        reason: true,
        quantity: true,
        unitCost: true,
        createdAt: true,
      },
    }),
    includeExpenses ? withManualPayableSnapshot(db, storeId, dateFrom, dateTo, async tx => Promise.all([tx.expense.aggregate({
      where: {
        storeId,
        deletedAt: null,
        occurredAt: dateBounds,
        ...recognizedExpenseFilter(),
      },
      _sum: { amount: true, changeAmount: true },
      _count: { _all: true },
    }), tx.expense.count({
      where: {
        storeId,
        deletedAt: null,
        occurredAt: dateBounds,
        ...recognizedExpenseFilter(),
        hasMissingCostSnapshot: true,
      },
    })])) : undefined,
    db.debtPaymentLog.findMany({
      where: {
        storeId,
        createdAt: dateBounds,
        transaction: { status: { in: ["COMPLETED", "DP"] } },
      },
      select: {
        transactionId: true,
        paymentMethod: true,
        amount: true,
        createdAt: true,
        transaction: {
          select: {
            salesName: true,
            salesperson: { select: { name: true } },
          },
        },
      },
    }),
    findInitialCollections(db, storeId, dateBounds),
    receivableBalancePromise,
    db.manualIncome.findMany({
      where: { storeId, deletedAt: null, occurredAt: dateBounds },
      select: { id: true, occurredAt: true, category: true, amount: true, payments: { select: { method: true, amount: true } } },
    }),
    loadManualReceivablePeriod(db, storeId, dateFrom, dateTo),
  ]);


  const summaryCatalog = includeSummaryCatalog
    ? buildReportSummaryCatalog(await db.productSubcategory.findMany({
        select: { group: true, name: true, legacyCategory: { select: { name: true } } },
      }))
    : undefined;

  return {
    ...buildFinancialReport({
      dateFrom,
      dateTo,
      collectionTransactions,
      receivableBalance,
      manualIncome,
      manualReceivables,
      transactions: transactions.map((transaction) => ({
        ...transaction,
        createdAt: transaction.invoiceDate,
        total: toNumber(transaction.total),
        amountPaid: toNumber(transaction.amountPaid),
        change: toNumber(transaction.change),
        discount: toNumber(transaction.discount),
        payments: transaction.payments.map((payment) => ({
          ...payment,
          amount: toNumber(payment.amount),
        })),
        items: transaction.items.map((item) => ({
          ...item,
          quantity: toNumber(item.quantity),
          subtotal: toNumber(item.subtotal),
          unitCost:
            item.unitCost === null || item.unitCost === undefined
              ? null
              : toNumber(item.unitCost),
        })),
      })),
      shifts: shifts.map((shift) => ({
        ...shift,
        openingBalance: toNumber(shift.openingBalance),
        expectedBalance: toNumber(shift.expectedBalance),
        closingBalance: toNumber(shift.closingBalance),
        discrepancy: toNumber(shift.discrepancy),
      })),
      inventoryLogs: inventoryLogs.map((logRow) => ({
        type: logRow.type,
        reason: logRow.reason,
        quantity: toNumber(logRow.quantity),
        unitCost:
          logRow.unitCost === null || logRow.unitCost === undefined
            ? null
            : toNumber(logRow.unitCost),
        createdAt: logRow.createdAt,
      })),
      expenseSummary: expenseSnapshot && {
        amount: toNumber(expenseSnapshot.data[0]._sum.amount) + expenseSnapshot.payables.payments.reduce((sum, payment) => sum + payment.amountCents, 0) / 100,
        changeAmount: toNumber(expenseSnapshot.data[0]._sum.changeAmount),
        entryCount: expenseSnapshot.data[0]._count._all + expenseSnapshot.payables.payments.length,
        incompleteCount: expenseSnapshot.data[1],
      },
      debtPayments: debtPayments.map((payment) => ({
        ...payment,
        amount: toNumber(payment.amount),
      })),
    }),
    ...(summaryCatalog ? { summaryCatalog } : {}),
  };
}
