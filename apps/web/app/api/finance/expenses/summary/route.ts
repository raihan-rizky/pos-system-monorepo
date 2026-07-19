import { db } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  bucketExpensesByCategory,
  bucketExpensesByDay,
  buildKeuanganMonthRange,
  type ExpenseCategory,
} from "@/features/keuangan/helpers/keuangan-core";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";

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
    const storeId = user.storeId || "store-main";
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month");
    if (monthParam && !MONTH_PATTERN.test(monthParam)) {
      return apiError("Invalid month format (YYYY-MM)", 422, {
        code: "ValidationError",
      });
    }
    const month = monthParam ?? currentJakartaMonth();
    const range = buildKeuanganMonthRange(month);

    const [expenses, transactions] = await Promise.all([
      db.expense.findMany({
        where: {
          deletedAt: null,
          storeId,
          occurredAt: { gte: range.start, lt: range.end },
        },
        select: {
          occurredAt: true,
          amount: true,
          changeAmount: true,
          category: true,
        },
      }),
      db.transaction.findMany({
        where: {
          storeId,
          status: "COMPLETED",
          createdAt: { gte: range.start, lt: range.end },
        },
        select: { total: true },
      }),
    ]);

    const expenseRows = expenses.map((e) => ({
      occurredAt: e.occurredAt,
      amount: e.amount.toString(),
      changeAmount: e.changeAmount.toString(),
      category: e.category as ExpenseCategory,
    }));

    const daily = bucketExpensesByDay(expenseRows);
    const byCategory = bucketExpensesByCategory(expenseRows);
    const monthlyTotal = daily.reduce((sum, d) => sum + d.total, 0);
    const entryCount = expenses.length;

    const incomeTotal = transactions.reduce(
      (sum, t) => sum + Number(t.total.toString()),
      0,
    );

    return NextResponse.json({
      month,
      monthlyTotal,
      entryCount,
      byCategory,
      daily,
      netCashFlow: {
        income: incomeTotal,
        expense: monthlyTotal,
        net: incomeTotal - monthlyTotal,
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
