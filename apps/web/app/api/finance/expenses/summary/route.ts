import { db } from "@pos/db";
import { recognizedExpenseFilter } from "@/features/keuangan/helpers/recognized-expense-filter";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  bucketExpensesByCategory,
  bucketExpensesByDay,
  buildKeuanganMonthRange,
} from "@/features/keuangan/helpers/keuangan-core";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";
import { getMonthlyFinancialReport } from "@/features/financial-report/services/monthly-report";
import { buildMonthlyPeriod } from "@/features/financial-report/helpers/monthly-report-core";
import { customExpenseCategoryKey } from "@/features/keuangan/helpers/category-meta";

const log = getLogger("api:finance:expenses:summary");
export const dynamic = "force-dynamic";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentJakartaMonth(): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return ymd.slice(0, 7);
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission("expense", "read");
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const storeId = user.storeId;
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month");
    if (monthParam && !MONTH_PATTERN.test(monthParam)) {
      return apiError("Invalid month format (YYYY-MM)", 422, {
        code: "ValidationError",
      });
    }
    const month = monthParam ?? currentJakartaMonth();
    const range = buildKeuanganMonthRange(month);

    const [year, monthNumber] = month.split("-").map(Number);
    const metricsOnly = searchParams.get("metricsOnly") === "1";
    if (metricsOnly) buildMonthlyPeriod(year, monthNumber);
    const [expenses, report] = await Promise.all([
      db.expense.findMany({
        where: {
          ...recognizedExpenseFilter(),
          deletedAt: null,
          storeId,
          occurredAt: { gte: range.start, lt: range.end },
        },
        select: {
          occurredAt: true,
          amount: true,
          changeAmount: true,
          category: true,
          customCategoryId: true,
        },
      }),
      metricsOnly ? Promise.resolve(null) : getMonthlyFinancialReport(storeId, year, monthNumber),
    ]);

    const expenseRows = expenses.map((e) => ({
      occurredAt: e.occurredAt,
      amount: e.amount.toString(),
      changeAmount: e.changeAmount.toString(),
      category: e.customCategoryId ? customExpenseCategoryKey(e.customCategoryId) : e.category,
    }));

    const daily = bucketExpensesByDay(expenseRows);
    const byCategory = bucketExpensesByCategory(expenseRows);
    const monthlyTotal = daily.reduce((sum, d) => sum + d.total, 0);
    const entryCount = expenses.length;
    if (metricsOnly) return NextResponse.json({ month, monthlyTotal, entryCount, byCategory, daily });
    if (!report) throw new Error("Laporan kas belum tersedia.");

    const cashDays = new Map<string, number>();
    const addCash = (date: string, amount: number) => {
      cashDays.set(date, (cashDays.get(date) ?? 0) + Math.round(amount * 100));
    };
    for (const row of report.expenses) addCash(row.date, row.amount);
    for (const row of report.purchaseExpenses ?? []) if (row.purchase?.method === "TRANSFER") addCash(row.date, row.amount);
    for (const row of report.giroPayments ?? []) addCash(row.date, row.amount);
    const cashDaily = [...cashDays.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, total: amount / 100 }));
    const expenseCents = [...cashDays.values()].reduce((sum, amount) => sum + amount, 0);
    const incomplete = report.cashIncomplete === true;

    return NextResponse.json({
      month,
      monthlyTotal,
      entryCount,
      byCategory,
      daily,
      cashDaily,
      cashExpense: {
        total: incomplete ? null : expenseCents / 100,
        incomplete,
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to load expenses summary", error);
    return apiError("Failed to load expenses summary", 500, {
      code: "InternalError",
    });
  }
}
