import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { buildKeuanganMonthRange } from "@/features/keuangan/helpers/keuangan-core";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";
import { jakartaToday } from "@/features/financial-report/helpers/daily-income";
import { loadIncomePeriod } from "@/features/financial-report/services/daily-income";
import { buildIncomeCalculation } from "@/features/keuangan/helpers/income-calculation";

const log = getLogger("api:finance:income:summary");
export const dynamic = "force-dynamic";
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  try {
    const user = await requirePermission("income", "read");
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const storeId = user.storeId;
    const { searchParams } = new URL(request.url);
    const currentMonth = jakartaToday().slice(0, 7);
    const month = searchParams.get("month") ?? currentMonth;
    if (!MONTH_PATTERN.test(month) || Number(month.slice(0, 4)) < 1900 || month > currentMonth) {
      return apiError("Pilih bulan yang valid dan tidak melewati bulan ini.", 422, { code: "ValidationError" });
    }
    const range = buildKeuanganMonthRange(month);
    const period = await loadIncomePeriod(storeId, `${month}-01`, jakartaToday(new Date(range.end.getTime() - 1)));
    const cash = buildIncomeCalculation(period);
    const response = { month, monthlyTotal: cash.total, transactionCount: cash.transactionCount,
      manualEntryCount: cash.manualEntryCount, daily: cash.daily };
    if (searchParams.get("metricsOnly") === "1") return NextResponse.json(response);
    return NextResponse.json({ ...response, cashDaily: cash.daily, cashTotal: cash.total,
      incomeComponents: cash.components, supplierRefund: cash.supplierRefund });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to load income summary", error);
    return apiError("Failed to load income summary", 500, { code: "InternalError" });
  }
}
