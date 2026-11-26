import { handleAuthError } from "@/lib/rbac/guard";
import { getFinancialExportAccess } from "@/features/financial-report/services/export-access";
import { loadFinancialJournal } from "@/features/financial-report/services/financial-journal";
import { buildReportPeriodRange, type ReportPeriod } from "@/features/financial-report/helpers/journal-core";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";

const log = getLogger("api:finance:report:journal");
export const dynamic = "force-dynamic";

const VALID_PERIODS: ReadonlySet<ReportPeriod> = new Set([
  "daily",
  "weekly",
  "monthly",
  "30d",
]);

function isPeriod(value: string | null): value is ReportPeriod {
  return value !== null && VALID_PERIODS.has(value as ReportPeriod);
}

export async function GET(request: Request) {
  try {
    const access = await getFinancialExportAccess(request);
    if ("response" in access) return access.response;
    const { user } = access;
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period");
    if (!isPeriod(periodParam) && periodParam !== "custom") {
      return apiError(
        "Query parameter 'period' is required (daily | weekly | monthly | 30d)",
        422,
        { code: "ValidationError" },
      );
    }
    let range: { from: string; to: string };
    if (periodParam === "custom") {
      const from = searchParams.get("from") ?? "";
      const to = searchParams.get("to") ?? "";
      const validDate = (value: string) => {
        const date = new Date(`${value}T00:00:00+07:00`);
        return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) &&
          new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) === value;
      };
      if (searchParams.getAll("from").length !== 1 || searchParams.getAll("to").length !== 1 ||
        !validDate(from) || !validDate(to) || from > to ||
        (new Date(`${to}T00:00:00+07:00`).getTime() - new Date(`${from}T00:00:00+07:00`).getTime()) / 86_400_000 >= 366) {
        return apiError("Pilih rentang tanggal yang valid hingga 366 hari.", 422, { code: "ValidationError" });
      }
      range = { from, to };
    } else {
      range = buildReportPeriodRange(periodParam);
    }
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const journal = await loadFinancialJournal(user.storeId, range, access);
    return NextResponse.json({ period: periodParam, ...range, ...journal }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to build laporan", error);
    return apiError("Failed to build laporan", 500, { code: "InternalError" });
  }
}
