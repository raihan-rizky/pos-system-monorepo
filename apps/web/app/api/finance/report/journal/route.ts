import { db } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  buildReportRows,
  buildReportFooter,
  buildReportCategorySummary,
  buildReportPeriodRange,
  type ReportPeriod,
} from "@/features/financial-report/helpers/journal-core";
import type { ExpenseCategory } from "@/features/keuangan/helpers/keuangan-core";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";

const log = getLogger("api:finance:report:journal");
export const dynamic = "force-dynamic";

const VALID_PERIODS: ReadonlySet<ReportPeriod> = new Set([
  "daily",
  "weekly",
  "monthly",
]);

function isPeriod(value: string | null): value is ReportPeriod {
  return value !== null && VALID_PERIODS.has(value as ReportPeriod);
}

function toJakartaBounds(from: string, to: string) {
  const start = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(`${to}T00:00:00+07:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission("financial-report", "read");
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period");
    if (!isPeriod(periodParam)) {
      return apiError(
        "Query parameter 'period' is required (daily | weekly | monthly)",
        422,
        { code: "ValidationError" },
      );
    }
    const range = buildReportPeriodRange(periodParam);
    const { start, end } = toJakartaBounds(range.from, range.to);

    const storeId = user.storeId || undefined;
    const [sales, expenses] = await Promise.all([
      db.transaction.findMany({
        where: {
          ...(storeId ? { storeId } : {}),
          status: { in: ["COMPLETED", "DP"] },
          createdAt: { gte: start, lt: end },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          invoiceNumber: true,
          createdAt: true,
          salesName: true,
          salesperson: { select: { name: true } },
          customerName: true,
          paymentMethod: true,
          status: true,
          amountPaid: true,
          total: true,
          items: {
            select: {
              productName: true,
              subtotal: true,
              product: { select: { category: { select: { name: true } } } },
            },
          },
        },
      }),
      db.expense.findMany({
        where: {
          deletedAt: null,
          occurredAt: { gte: start, lt: end },
        },
        orderBy: { occurredAt: "asc" },
        select: {
          id: true,
          occurredAt: true,
          applicantName: true,
          category: true,
          description: true,
          amount: true,
          changeAmount: true,
        },
      }),
    ]);

    const saleInputs = sales.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      createdAt: s.createdAt,
      salesName: s.salesName,
      salesperson: s.salesperson,
      customerName: s.customerName,
      paymentMethod: s.paymentMethod,
      total: (s.status === "DP" ? s.amountPaid : s.total).toString(),
      items: s.items.map((item) => ({
        ...item,
        subtotal: item.subtotal.toString(),
      })),
    }));

    const rows = buildReportRows(
      saleInputs,
      expenses.map((e) => ({
        id: e.id,
        occurredAt: e.occurredAt,
        applicantName: e.applicantName,
        category: e.category as ExpenseCategory,
        description: e.description,
        amount: e.amount.toString(),
        changeAmount: e.changeAmount.toString(),
      })),
    );

    return NextResponse.json({
      period: periodParam,
      from: range.from,
      to: range.to,
      rows,
      footer: buildReportFooter(rows),
      categories: buildReportCategorySummary(saleInputs),
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to build laporan", error);
    return apiError("Failed to build laporan", 500, { code: "InternalError" });
  }
}
