import { NextResponse } from "next/server";
import { getCurrentUser, handleAuthError } from "@/lib/rbac/guard";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { canRoleAccessPage, canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import { buildDailyIncomeRange, DAILY_INCOME_PERMISSIONS, hasDailyReceivableAccess, jakartaToday, type DailyIncomeResponse } from "@/features/financial-report/helpers/daily-income";
import { loadDailyIncome } from "@/features/financial-report/services/daily-income";
import { loadReceivableBalance } from "@/features/customer-debt/services/receivable-balance";
import { resolveReceiptHistoryAccess } from "@/features/financial-report/helpers/income-access";

export const dynamic = "force-dynamic";
const log = getLogger("api:finance:report:daily");

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("Silakan masuk untuk melihat pemasukan harian.", 401, { code: "Unauthorized" });
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const params = new URL(request.url).searchParams;
    const view = params.get("view");
    if ((view !== null && view !== "sales") || params.getAll("view").length > 1) {
      return apiError("Pilih tampilan laporan yang valid.", 422, { code: "ValidationError" });
    }
    if (view === "sales" && user.role !== "OWNER") {
      return apiError("Pratinjau tampilan Sales hanya tersedia untuk Owner.", 403, { code: "Forbidden" });
    }
    let permissions;
    try {
      permissions = await getGlobalRolePermissions();
    } catch {
      return apiError("Hak akses belum dapat diverifikasi. Silakan coba lagi.", 503, { code: "ServiceUnavailable" });
    }
    if (!canRoleAccessPage(user.role, "/financial-report", permissions)) {
      return apiError("Akses Laporan Keuangan belum diizinkan.", 403, { code: "Forbidden" });
    }
    const effectiveRole = view === "sales" ? "SALES" : user.role;
    if (!canRoleAccessPage(effectiveRole, "/financial-report", permissions)) {
      return apiError("Akses Laporan Keuangan untuk Sales belum diizinkan.", 403, { code: "Forbidden" });
    }
    const full = canRolePerformAction(effectiveRole, "financial-report", "read", permissions);
    const allowed = (Object.keys(DAILY_INCOME_PERMISSIONS) as Array<keyof typeof DAILY_INCOME_PERMISSIONS>).filter(key => full || canRolePerformAction(effectiveRole, DAILY_INCOME_PERMISSIONS[key], "read", permissions));
    const canReadReceivableBalance = hasDailyReceivableAccess(target => canRolePerformAction(effectiveRole, target, "read", permissions));
    if (!allowed.length && !canReadReceivableBalance) return apiError("Akses pemasukan harian belum diizinkan.", 403, { code: "Forbidden" });

    const date = params.get("date") ?? jakartaToday();
    try {
      if ([...params.keys()].some(key => key !== "date" && key !== "storeId" && key !== "view") || params.getAll("date").length > 1) {
        throw new RangeError();
      }
      buildDailyIncomeRange(date);
    } catch {
      return apiError("Pilih satu tanggal yang valid, hari ini atau sebelumnya.", 422, { code: "ValidationError" });
    }
    if (view === "sales" && full) {
      return NextResponse.json({ date, viewMode: "full" }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const [report, receivableBalance] = await Promise.all([
      allowed.length ? loadDailyIncome(user.storeId, date) : Promise.resolve(undefined),
      canReadReceivableBalance ? loadReceivableBalance(user.storeId, date) : Promise.resolve(undefined),
    ]);
    const body: DailyIncomeResponse = { date: report?.date ?? date };
    if (report) for (const key of allowed) Object.assign(body, { [key]: report[key] });
    if (canReadReceivableBalance && receivableBalance !== undefined) body.receivableBalance = receivableBalance;
    if (view === "sales") body.receiptHistoryAccess = resolveReceiptHistoryAccess(effectiveRole, permissions);
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const auth = handleAuthError(error);
    if (auth) return auth;
    log.error("Gagal memuat pemasukan harian", error);
    return apiError("Pemasukan harian belum dapat dimuat. Silakan coba lagi.", 500, { code: "InternalError" });
  }
}
