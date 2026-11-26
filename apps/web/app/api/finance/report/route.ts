import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import { loadFinancialReport } from "@/features/financial-report/services/financial-report";
import {
  buildFinancialReportRange,
  type FinancialReportPreset,
} from "@/features/financial-report/helpers/report-core";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";

const log = getLogger("api:finance:report");
export const dynamic = "force-dynamic";

const PRESETS = new Set<FinancialReportPreset>(["today", "7d", "30d", "month"]);
const MAX_RANGE_DAYS = 366;

function isPreset(value: string | null): value is FinancialReportPreset {
  return value !== null && PRESETS.has(value as FinancialReportPreset);
}

function isValidDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const date = new Date(`${dateKey}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return false;

  return (
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date) === dateKey
  );
}

function rangeDays(dateFrom: string, dateTo: string): number {
  const from = new Date(`${dateFrom}T00:00:00+07:00`);
  const to = new Date(`${dateTo}T00:00:00+07:00`);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission("financial-report", "read");
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const storeId = user.storeId;
    const { searchParams } = new URL(request.url);
    const requestedViews = searchParams.getAll("view");
    if (requestedViews.length > 1 || (requestedViews.length === 1 && requestedViews[0] !== "sales")) {
      return apiError("Tampilan laporan keuangan tidak valid.", 422, {
        code: "ValidationError",
      });
    }
    const salesPreview = requestedViews[0] === "sales";
    if (salesPreview && user.role !== "OWNER") {
      return apiError("Tampilan Sales hanya tersedia untuk Owner.", 403, {
        code: "Forbidden",
      });
    }
    const effectiveRole = salesPreview ? "SALES" : user.role;
    const permissions = await getGlobalRolePermissions();
    const canReadTransactions = canRolePerformAction(
      effectiveRole,
      "transaction",
      "read",
      permissions,
    );
    const canReadCustomerReceivables = canRolePerformAction(
      effectiveRole,
      "customer.receivable",
      "read",
      permissions,
    );
    const canReadReceivableBalance = canReadTransactions && canReadCustomerReceivables;
    const requestedPreset = searchParams.get("preset");
    const preset = isPreset(requestedPreset) ? requestedPreset : "month";
    const fallbackRange = buildFinancialReportRange(preset);
    const dateFrom = searchParams.get("dateFrom") || fallbackRange.dateFrom;
    const dateTo = searchParams.get("dateTo") || fallbackRange.dateTo;

    if (
      !isValidDateKey(dateFrom) ||
      !isValidDateKey(dateTo) ||
      dateFrom > dateTo
    ) {
      return apiError("Invalid financial report date range", 422, {
        code: "ValidationError",
      });
    }

    if (rangeDays(dateFrom, dateTo) > MAX_RANGE_DAYS) {
      return apiError(
        `Date range exceeds ${MAX_RANGE_DAYS}-day maximum`,
        422,
        { code: "ValidationError" },
      );
    }

    return NextResponse.json(await loadFinancialReport(storeId, dateFrom, dateTo, {
      canReadReceivableBalance,
      includeSummaryCatalog: searchParams.get("summaryCatalog") === "1",
    }));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to load financial report", error);
    return apiError("Failed to load financial report", 500, {
      code: "InternalError",
    });
  }
}
