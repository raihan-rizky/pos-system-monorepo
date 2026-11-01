import { db } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  bucketTransactionsByDay,
  buildKeuanganMonthRange,
} from "@/features/keuangan/helpers/keuangan-core";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";
import { getMonthlyFinancialReport } from "@/features/financial-report/services/monthly-report";
import { buildMonthlyPeriod } from "@/features/financial-report/helpers/monthly-report-core";

const log = getLogger("api:finance:income:summary");
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
    const user = await requirePermission("income", "read");
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
    const [transactions, report] = await Promise.all([db.transaction.findMany({
      where: {
        storeId,
        status: "COMPLETED",
        createdAt: { gte: range.start, lt: range.end },
      },
      select: { createdAt: true, total: true },
      orderBy: { createdAt: "asc" },
    }), metricsOnly ? Promise.resolve(null) : getMonthlyFinancialReport(storeId, year, monthNumber)]);

    const daily = bucketTransactionsByDay(
      transactions.map((t) => ({
        createdAt: t.createdAt,
        total: t.total.toString(),
      })),
    );
    const monthlyTotal = daily.reduce((sum, d) => sum + d.total, 0);
    const transactionCount = daily.reduce((sum, d) => sum + d.count, 0);
    if (metricsOnly) return NextResponse.json({ month, monthlyTotal, transactionCount, daily });
    if (!report) throw new Error("Laporan kas belum tersedia.");
    const cashDays = new Map<string, number>();
    for (const row of report.income) {
      for (const amount of Object.values(row.amounts)) {
        cashDays.set(row.date, (cashDays.get(row.date) ?? 0) + Math.round(amount * 100));
      }
    }
    const cashDaily = [...cashDays.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, total: amount / 100 }));
    const cashTotal = [...cashDays.values()].reduce((sum, amount) => sum + amount, 0) / 100;

    return NextResponse.json({
      month,
      monthlyTotal,
      transactionCount,
      daily,
      cashDaily,
      cashTotal,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to load income summary", error);
    return apiError("Failed to load income summary", 500, {
      code: "InternalError",
    });
  }
}
