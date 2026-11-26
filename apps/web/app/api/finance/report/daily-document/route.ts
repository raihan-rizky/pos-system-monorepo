import { NextResponse } from "next/server";
import { buildDailyIncomeRange } from "@/features/financial-report/helpers/daily-income";
import { buildDailyReportDocument } from "@/features/financial-report/helpers/daily-report-document";
import { buildReportFooter } from "@/features/financial-report/helpers/journal-core";
import { loadDailyIncome } from "@/features/financial-report/services/daily-income";
import { resolveFinancialExportDetails } from "@/features/financial-report/services/export-access";
import { loadFinancialJournal } from "@/features/financial-report/services/financial-journal";
import { loadFinancialReport } from "@/features/financial-report/services/financial-report";
import { canRoleAccessPage, canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { getCurrentUser, handleAuthError } from "@/lib/rbac/guard";

const log = getLogger("api:finance:report:daily-document");
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return apiError("Silakan masuk untuk membuka Laporan Harian.", 401, { code: "Unauthorized" });
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });

    const permissions = await getGlobalRolePermissions().catch(() => null);
    if (!permissions) return apiError("Hak akses belum dapat diverifikasi. Silakan coba lagi.", 503, { code: "ServiceUnavailable" });
    if (!canRoleAccessPage(user.role, "/financial-report", permissions) || !canRolePerformAction(user.role, "financial-report.daily-report", "read", permissions)) {
      return apiError("Akses Laporan Harian belum diizinkan.", 403, { code: "Forbidden" });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? "";
    const pageMode = searchParams.get("layout") ?? "multiple";
    if (searchParams.getAll("date").length !== 1 || searchParams.getAll("layout").length > 1
      || [...searchParams.keys()].some(key => key !== "date" && key !== "layout")
      || (pageMode !== "single" && pageMode !== "multiple")) {
      return apiError("Pilih tanggal dan tata letak Laporan Harian yang valid.", 422, { code: "ValidationError" });
    }
    try {
      buildDailyIncomeRange(date);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return apiError(error.message, 422, { code: "ValidationError" });
    }

    const access = resolveFinancialExportDetails(user.role, permissions);
    const canReadProfit = canRolePerformAction(user.role, "financial-report", "read", permissions);
    const range = { from: date, to: date };
    const [income, financial, journal] = await Promise.all([
      loadDailyIncome(user.storeId, date),
      loadFinancialReport(user.storeId, date, date, {
        includeSummaryCatalog: pageMode === "single",
        includeExpenses: access.canReadExpenses,
      }),
      pageMode === "multiple"
        ? loadFinancialJournal(user.storeId, range, access, access.canReadExpenses)
        : { rows: [], footer: buildReportFooter([]) },
    ]);
    const document = buildDailyReportDocument(date, income, financial, { period: "daily", ...range, ...journal }, pageMode, {
      canReadExpenses: access.canReadExpenses, canReadProfit,
    });
    if (!document) return apiError("Laporan untuk tanggal ini belum tersedia.", 500, { code: "InternalError" });
    return NextResponse.json(document, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Gagal menyiapkan Laporan Harian", error);
    return apiError("Laporan Harian belum bisa dimuat. Silakan coba lagi.", 500, { code: "InternalError" });
  }
}
