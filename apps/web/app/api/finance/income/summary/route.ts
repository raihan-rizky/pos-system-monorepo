import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";
import { loadMonthlyIncome } from "@/features/financial-report/services/daily-income";
import { jakartaToday } from "@/features/financial-report/helpers/daily-income";
const log = getLogger("api:finance:income:summary");
export const dynamic = "force-dynamic";
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export async function GET(request: Request) {
  try {
    const user = await requirePermission("income", "read");
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const currentMonth = jakartaToday(now).slice(0, 7);
    const month = searchParams.get("month") ?? currentMonth;
    if (!MONTH_PATTERN.test(month) || Number(month.slice(0, 4)) < 1900 || month > currentMonth) {
      return apiError("Pilih bulan yang valid dan tidak melewati bulan ini.", 422, { code: "ValidationError" });
    }
    const { total, daily, transactionCount, manualEntryCount, components, supplierRefund } = await loadMonthlyIncome(user.storeId, month, now);
    const summary = { month, monthlyTotal: total, transactionCount, manualEntryCount, daily };
    if (searchParams.get("metricsOnly") === "1") return NextResponse.json(summary);
    return NextResponse.json({ ...summary, cashDaily: daily, cashTotal: total, incomeComponents: components, supplierRefund });
  } catch (error) { const authErr = handleAuthError(error); if (authErr) return authErr; log.error("Failed to load income summary", error); return apiError("Failed to load income summary", 500, { code: "InternalError" }); }
}
