import { db } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  buildFinancialReport,
  buildFinancialReportRange,
  type FinancialReportPreset,
} from "@/features/financial-report/helpers/report-core";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";

const log = getLogger("api:finance:report");
export const dynamic = "force-dynamic";

const PRESETS = new Set<FinancialReportPreset>(["today", "7d", "30d", "month"]);
const MAX_RANGE_DAYS = 366;

function isPreset(value: string | null): value is FinancialReportPreset {
  return value !== null && PRESETS.has(value as FinancialReportPreset);
}

function addOneJakartaDay(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function isValidDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const date = new Date(`${dateKey}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return false;

  return (
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date) === dateKey
  );
}

function rangeDays(dateFrom: string, dateTo: string): number {
  const from = new Date(`${dateFrom}T00:00:00+07:00`);
  const to = new Date(`${dateTo}T00:00:00+07:00`);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
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

export async function GET(request: Request) {
  try {
    const user = await requirePermission("financial-report", "read");
    const storeId = user.storeId || "store-main";
    const { searchParams } = new URL(request.url);
    const requestedPreset = searchParams.get("preset");
    const preset = isPreset(requestedPreset) ? requestedPreset : "month";
    const fallbackRange = buildFinancialReportRange(preset);
    const dateFrom = searchParams.get("dateFrom") || fallbackRange.dateFrom;
    const dateTo = searchParams.get("dateTo") || fallbackRange.dateTo;

    if (
      !isValidDateKey(dateFrom) ||
      !isValidDateKey(dateTo) ||
      dateFrom > dateTo
    ) {
      return apiError("Invalid financial report date range", 422, {
        code: "ValidationError",
      });
    }

    if (rangeDays(dateFrom, dateTo) > MAX_RANGE_DAYS) {
      return apiError(
        `Date range exceeds ${MAX_RANGE_DAYS}-day maximum`,
        422,
        { code: "ValidationError" },
      );
    }

    const dateBounds = toDateBounds(dateFrom, dateTo);

    const [
      transactions,
      shifts,
      inventoryLogs,
      expenseAggregate,
      incompleteExpenseCount,
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
          invoiceDate: true,
          createdAt: true,
          status: true,
          paymentMethod: true,
          total: true,
          amountPaid: true,
          discount: true,
          salesName: true,
          salesperson: { select: { name: true } },
          items: {
            select: {
              productId: true,
              productName: true,
              quantity: true,
              subtotal: true,
              unitCost: true,
              product: {
                select: {
                  category: { select: { name: true } },
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
      db.expense.aggregate({
        where: {
          storeId,
          deletedAt: null,
          occurredAt: dateBounds,
        },
        _sum: { amount: true, changeAmount: true },
        _count: { _all: true },
      }),
      db.expense.count({
        where: {
          storeId,
          deletedAt: null,
          occurredAt: dateBounds,
          hasMissingCostSnapshot: true,
        },
      }),
    ]);

    return NextResponse.json(
      buildFinancialReport({
        dateFrom,
        dateTo,
        transactions: transactions.map((transaction) => ({
          ...transaction,
          createdAt: transaction.invoiceDate,
          total: toNumber(transaction.total),
          amountPaid: toNumber(transaction.amountPaid),
          discount: toNumber(transaction.discount),
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
        expenseSummary: {
          amount: toNumber(expenseAggregate._sum.amount),
          changeAmount: toNumber(expenseAggregate._sum.changeAmount),
          entryCount: expenseAggregate._count._all,
          incompleteCount: incompleteExpenseCount,
        },
      }),
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to load financial report", error);
    return apiError("Failed to load financial report", 500, {
      code: "InternalError",
    });
  }
}
