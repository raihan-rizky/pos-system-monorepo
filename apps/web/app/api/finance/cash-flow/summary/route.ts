import { NextResponse } from "next/server";
import { loadMonthlyIncome } from "@/features/financial-report/services/daily-income";
import { loadRecognizedExpenses } from "@/features/keuangan/services/recognized-finance";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const log = getLogger("api:finance:cash-flow:summary");
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const dynamic = "force-dynamic";

function currentJakartaMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()).slice(0, 7);
}

export async function GET(request: Request) {
  try {
    const incomeUser = await requirePermission("income", "read");
    const expenseUser = await requirePermission("expense", "read");
    if (!incomeUser.id || !incomeUser.storeId || incomeUser.id !== expenseUser.id || incomeUser.storeId !== expenseUser.storeId) {
      return apiError("Akses toko tidak tersedia.", 403, { code: "Forbidden" });
    }

    const month = new URL(request.url).searchParams.get("month") ?? currentJakartaMonth();
    if (!MONTH_PATTERN.test(month) || Number(month.slice(0, 4)) < 1900 || month > currentJakartaMonth()) {
      return apiError("Pilih bulan yang valid dan tidak melewati bulan ini.", 422, { code: "ValidationError" });
    }
    const now = new Date();
    const [income, expenses] = await Promise.all([
      loadMonthlyIncome(incomeUser.storeId, month, now),
      loadRecognizedExpenses(incomeUser.storeId, month, now),
    ]);
    return NextResponse.json({
      month,
      income,
      expense: { total: expenses.monthlyTotal, incomplete: expenses.incomplete,
        daily: expenses.daily.map(({ date, total }) => ({ date, total })), components: expenses.components,
        correctionOutflow: expenses.correctionOutflow, byCategory: expenses.byCategory, entryCount: expenses.entryCount },
    });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Failed to load combined cash-flow summary", error);
    return apiError("Ringkasan arus kas belum tersedia.", 500, { code: "InternalError" });
  }
}
