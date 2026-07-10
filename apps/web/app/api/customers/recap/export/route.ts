import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@pos/db";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { buildCustomerRecapExport } from "@/features/customer-recap/helpers/export-core";

const log = getLogger("api:customers:recap:export");
export const dynamic = "force-dynamic";

const dateRangeSchema = z
  .object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((value) => value.dateTo >= value.dateFrom, {
    message: "dateTo must be on or after dateFrom",
    path: ["dateTo"],
  });

function addDays(dateKeyValue: string, days: number): string {
  const date = new Date(`${dateKeyValue}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function rangeDays(dateFrom: string, dateTo: string): number {
  const from = new Date(`${dateFrom}T00:00:00+07:00`);
  const to = new Date(`${dateTo}T00:00:00+07:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function periodBounds(dateFrom: string, dateTo: string) {
  return {
    gte: new Date(`${dateFrom}T00:00:00+07:00`),
    lt: new Date(`${addDays(dateTo, 1)}T00:00:00+07:00`),
  };
}

export async function GET(request: Request) {
  const startedAt = performance.now();

  try {
    const user = await requirePermission("customer", "read");
    const storeId = user.storeId || "store-main";
    const { searchParams } = new URL(request.url);
    const parsed = dateRangeSchema.safeParse({
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
    });

    if (!parsed.success) {
      return apiValidationError(parsed.error, "Invalid customer recap export date range");
    }

    const { dateFrom, dateTo } = parsed.data;
    if (rangeDays(dateFrom, dateTo) > 366) {
      return apiError("Date range is too large", 400, { code: "ValidationError" });
    }

    const bounds = periodBounds(dateFrom, dateTo);
    const [customers, transactions, debtPaymentLogs] = await Promise.all([
      db.customer.findMany({
        where: { storeId },
        select: {
          id: true,
          name: true,
          type: true,
          totalDebt: true,
          createdAt: true,
          lastVisitAt: true,
        },
      }),
      db.transaction.findMany({
        where: {
          storeId,
          createdAt: bounds,
          status: { in: ["COMPLETED", "DP"] },
          customerId: { not: null },
        },
        select: {
          id: true,
          customerId: true,
          createdAt: true,
          status: true,
          total: true,
          items: {
            select: {
              productId: true,
              productName: true,
              quantity: true,
              subtotal: true,
            },
          },
        },
      }),
      db.debtPaymentLog.findMany({
        where: { storeId, createdAt: bounds },
        select: {
          customerId: true,
          amount: true,
          createdAt: true,
        },
      }),
    ]);

    const data = buildCustomerRecapExport({
      dateFrom,
      dateTo,
      customers,
      transactions,
      debtPaymentLogs,
    });

    log.info("customer.recap.export.loaded", {
      storeId,
      periodDays: rangeDays(dateFrom, dateTo),
      customerCount: customers.length,
      transactionCount: transactions.length,
      durationMs: Math.round(performance.now() - startedAt),
    });

    return NextResponse.json({ data });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[GET /api/customers/recap/export]", error);
    return apiError("Failed to load customer recap export", 500, {
      code: "InternalError",
    });
  }
}
