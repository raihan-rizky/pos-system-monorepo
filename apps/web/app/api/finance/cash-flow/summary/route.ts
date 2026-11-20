import { NextResponse } from "next/server";
import { getMonthlyFinancialReport } from "@/features/financial-report/services/monthly-report";
import { loadRecognizedExpenses } from "@/features/keuangan/services/recognized-finance";
import { applyExpenseCashRows, totalExpenseCash } from "@/features/keuangan/helpers/expense-correction-cash";
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
    const [report, expenses] = await Promise.all([
      getMonthlyFinancialReport(incomeUser.storeId, year, monthNumber),
      loadRecognizedExpenses(incomeUser.storeId, month, undefined, true),
    ]);
    const incomeDays = new Map<string, { totalCents: number; receivableCents: number }>();
    let salesCents = 0;
    let manualIncomeCents = 0;
    let manualReceivableCents = 0;
    let refundCents = 0;
    for (const row of report.income) {
      const cents = Object.values(row.amounts).reduce((sum, amount) => sum + Math.round(amount * 100), 0);
      const day = incomeDays.get(row.date) ?? { totalCents: 0, receivableCents: 0 };
      day.totalCents += cents;
      if (row.id?.startsWith("manual:")) {
        day.receivableCents += cents;
        manualReceivableCents += cents;
      } else if (row.id?.startsWith("manual-income:")) manualIncomeCents += cents;
      else if (row.id?.startsWith("supplier-refund:")) refundCents += cents;
      else salesCents += cents;
      incomeDays.set(row.date, day);
    }
    const incomeDaily = [...incomeDays.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, day]) => ({ date, total: day.totalCents / 100, manualReceivable: day.receivableCents / 100 }));
    const components = { sales: salesCents / 100, manualIncome: manualIncomeCents / 100, manualReceivable: manualReceivableCents / 100 };
    const supplierRefund = refundCents / 100;
    const outflows = expenses.correctionCash?.outflow ?? [];
    const correctionOutflow = totalExpenseCash(outflows);
    const expenseDaily = applyExpenseCashRows(expenses.daily.map(({ date, total }) => ({ date, total })),
      outflows, date => ({ date, total: 0 }));
    return NextResponse.json({
      month,
      income: { total: totalExpenseCash(incomeDaily), daily: incomeDaily, components, supplierRefund },
      expense: { total: expenses.monthlyTotal === null ? null : totalExpenseCash(expenseDaily),
        incomplete: expenses.incomplete, daily: expenseDaily, components: expenses.components,
        correctionOutflow, byCategory: expenses.byCategory, entryCount: expenses.entryCount },
    });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Failed to load combined cash-flow summary", error);
    return apiError("Ringkasan arus kas belum tersedia.", 500, { code: "InternalError" });
  }
}
