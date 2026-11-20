import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";
import { buildMonthlyPeriod } from "@/features/financial-report/helpers/monthly-report-core";
import { loadRecognizedExpenses } from "@/features/keuangan/services/recognized-finance";
import { applyExpenseCashRows, totalExpenseCash } from "@/features/keuangan/helpers/expense-correction-cash";

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
    const [year, monthNumber] = month.split("-").map(Number);
    const metricsOnly = searchParams.get("metricsOnly") === "1";
    buildMonthlyPeriod(year, monthNumber);
    const expenses = await loadRecognizedExpenses(storeId, month, undefined, !metricsOnly);
    const { monthlyTotal, incomplete, entryCount, byCategory, daily, components } = expenses;
    const response = { month, monthlyTotal, incomplete, entryCount, byCategory, daily, components };
    if (metricsOnly) return NextResponse.json(response);
    const expenseDaily = daily.map(({ date, total }) => ({ date, total }));
    const outflow = expenses.correctionCash?.outflow ?? [];
    const cashDaily = outflow.length ? applyExpenseCashRows(expenseDaily, outflow, date => ({ date, total: 0 })) : expenseDaily;
    return NextResponse.json({ ...response, cashDaily,
      cashExpense: { total: monthlyTotal === null || !outflow.length ? monthlyTotal : totalExpenseCash(cashDaily), incomplete } });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to load expenses summary", error);
    return apiError("Failed to load expenses summary", 500, {
      code: "InternalError",
    });
  }
}
