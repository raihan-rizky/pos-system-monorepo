import { NextResponse } from "next/server";
import { loadIncomePeriod } from "@/features/financial-report/services/daily-income";
import { buildIncomeCalculation } from "@/features/keuangan/helpers/income-calculation";
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
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0");
    const [incomePeriod, expenses] = await Promise.all([
      loadIncomePeriod(incomeUser.storeId, `${month}-01`, `${month}-${lastDay}`),
      loadRecognizedExpenses(incomeUser.storeId, month),
    ]);
    const income = buildIncomeCalculation(incomePeriod);
    const daily = expenses.daily.map(({ date, total }) => ({ date, total }));
    return NextResponse.json({
      month,
      income,
      expense: { total: expenses.monthlyTotal,
        incomplete: expenses.incomplete, daily, components: expenses.components,
        ...(expenses.correctionOutflow ? { correctionOutflow: expenses.correctionOutflow } : {}),
        byCategory: expenses.byCategory, entryCount: expenses.entryCount },
    });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Failed to load combined cash-flow summary", error);
    return apiError("Ringkasan arus kas belum tersedia.", 500, { code: "InternalError" });
  }
}
