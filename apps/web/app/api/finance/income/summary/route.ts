import { db } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { bucketTransactionsByDay, buildKeuanganMonthRange } from "@/features/keuangan/helpers/keuangan-core";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";
import { buildMonthlyPeriod } from "@/features/financial-report/helpers/monthly-report-core";
import { getManualIncomeRows } from "@/features/keuangan/services/manual-income";
import { jakartaToday } from "@/features/financial-report/helpers/daily-income";
import { loadIncomePeriod } from "@/features/financial-report/services/daily-income";
import { getMonthlyFinancialReport } from "@/features/financial-report/services/monthly-report";
import { combineSalesAndManualReceivableIncome } from "@/features/keuangan/helpers/cash-income";

const log = getLogger("api:finance:income:summary");
export const dynamic = "force-dynamic";
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
function currentJakartaMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).slice(0, 7);
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission("income", "read");
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const storeId = user.storeId;
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month");
    if (monthParam && !MONTH_PATTERN.test(monthParam)) return apiError("Invalid month format (YYYY-MM)", 422, { code: "ValidationError" });
    const month = monthParam ?? currentJakartaMonth();
    const range = buildKeuanganMonthRange(month);
    const [year, monthNumber] = month.split("-").map(Number);
    buildMonthlyPeriod(year, monthNumber);
    const metricsOnly = searchParams.get("metricsOnly") === "1";
    const [transactions, manualIncome, income] = await Promise.all([
      db.transaction.findMany({ where: { storeId, status: "COMPLETED", createdAt: { gte: range.start, lt: range.end } }, select: { createdAt: true, total: true }, orderBy: { createdAt: "asc" } }),
      getManualIncomeRows(storeId, range.start, range.end),
      loadIncomePeriod(storeId, `${month}-01`, jakartaToday(new Date(range.end.getTime() - 1))),
    ]);
    const transactionDaily = bucketTransactionsByDay(transactions.map(t => ({ createdAt: t.createdAt, total: t.total.toString() })));
    const manualDaily = bucketTransactionsByDay(manualIncome.map(row => ({ createdAt: row.occurredAt, total: row.amount.toString() })));
    const buckets = new Map(transactionDaily.map(row => [row.date, { ...row, total: 0, manualCount: 0 }]));
    for (const row of manualDaily) {
      const bucket = buckets.get(row.date) ?? { date: row.date, total: 0, count: 0, manualCount: 0 };
      bucket.manualCount += row.count; buckets.set(row.date, bucket);
    }
    for (const row of income.days) {
      if (row.total === 0 && !buckets.has(row.date)) continue;
      const bucket = buckets.get(row.date) ?? { date: row.date, total: 0, count: 0, manualCount: 0 };
      bucket.total = row.total; buckets.set(row.date, bucket);
    }
    const daily = [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
    const monthlyTotal = daily.reduce((sum, row) => sum + Math.round(row.total * 100), 0) / 100;
    const transactionCount = daily.reduce((sum, row) => sum + row.count, 0);
    const response = { month, monthlyTotal, transactionCount, manualEntryCount: manualIncome.length, daily };
    if (metricsOnly) return NextResponse.json(response);
    const report = await getMonthlyFinancialReport(storeId, year, monthNumber);
    const cash = combineSalesAndManualReceivableIncome(income.days, report.income);
    return NextResponse.json({ ...response, cashDaily: cash.daily, cashTotal: cash.total });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to load income summary", error);
    return apiError("Failed to load income summary", 500, { code: "InternalError" });
  }
}
