import { NextResponse } from "next/server";
import { getMonthlyFinancialReport } from "@/features/financial-report/services/monthly-report";
import { loadIncomePeriod } from "@/features/financial-report/services/daily-income";
import { combineSalesAndManualReceivableIncome } from "@/features/keuangan/helpers/cash-income";
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
    const [report, incomePeriod] = await Promise.all([
      getMonthlyFinancialReport(incomeUser.storeId, year, monthNumber),
      loadIncomePeriod(incomeUser.storeId, `${month}-01`, `${month}-${lastDay}`),
    ]);
    const expenseDays = new Map<string, number>();
    const add = (days: Map<string, number>, date: string, amount: number) => {
      days.set(date, (days.get(date) ?? 0) + Math.round(amount * 100));
    };
    for (const row of report.expenses) add(expenseDays, row.date, row.amount);
    if (report.purchasePayments != null) {
      for (const row of report.purchasePayments) add(expenseDays, row.date, row.amount);
    } else {
      for (const row of report.purchaseExpenses ?? []) {
        if (row.purchase?.method === "TRANSFER") add(expenseDays, row.date, row.amount);
      }
      for (const row of report.giroPayments ?? []) add(expenseDays, row.date, row.amount);
    }
    const daily = (days: Map<string, number>) => [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cents]) => ({ date, total: cents / 100 }));
    const total = (days: Map<string, number>) => [...days.values()].reduce((sum, cents) => sum + cents, 0) / 100;
    const incomplete = report.cashIncomplete === true;
    return NextResponse.json({
      month,
      income: combineSalesAndManualReceivableIncome(incomePeriod.days, report.income),
      expense: { total: incomplete ? null : total(expenseDays), incomplete, daily: daily(expenseDays) },
    });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Failed to load combined cash-flow summary", error);
    return apiError("Ringkasan arus kas belum tersedia.", 500, { code: "InternalError" });
  }
}
