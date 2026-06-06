import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { buildCustomerDetailRecap } from "@/features/customer-recap/helpers/recap-core";
import { getLogger } from "@/lib/logger";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const log = getLogger("api:customers:id:recap");
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

// GET /api/customers/[id]/recap
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = performance.now();
  try {
    const user = await requirePermission("customer", "read");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const parsed = dateRangeSchema.safeParse({
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
    });

    if (!parsed.success) {
      return apiValidationError(parsed.error, "Invalid customer recap date range");
    }

    const { dateFrom, dateTo } = parsed.data;
    if (rangeDays(dateFrom, dateTo) > 366) {
      return apiError("Date range is too large", 400, {
        code: "ValidationError",
      });
    }

    const customer = await db.customer.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        name: true,
        type: true,
        totalDebt: true,
        createdAt: true,
        lastVisitAt: true,
      },
    });

    if (!customer) {
      return apiError("Customer not found", 404, { code: "NotFound" });
    }

    const bounds = periodBounds(dateFrom, dateTo);
    const [transactions, debtPaymentLogs] = await Promise.all([
      db.transaction.findMany({
        where: {
          storeId,
          customerId: id,
          status: { in: ["COMPLETED", "DP"] },
          OR: [
            { createdAt: bounds },
            {
              status: "DP",
              createdAt: { lt: bounds.lt },
            },
          ],
        },
        select: {
          id: true,
          customerId: true,
          createdAt: true,
          status: true,
          total: true,
          amountPaid: true,
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
        where: {
          storeId,
          customerId: id,
        },
        select: {
          transactionId: true,
          customerId: true,
          amount: true,
          createdAt: true,
          transaction: {
            select: {
              id: true,
              createdAt: true,
              status: true,
              total: true,
              amountPaid: true,
            },
          },
        },
      }),
    ]);

    const data = buildCustomerDetailRecap({
      customer,
      dateFrom,
      dateTo,
      transactions,
      debtPaymentLogs,
    });

    log.info("customer.detailRecap.loaded", {
      storeId,
      customerId: id,
      periodDays: rangeDays(dateFrom, dateTo),
      transactionCount: transactions.length,
      durationMs: Math.round(performance.now() - startedAt),
    });

    return NextResponse.json({ data });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[GET /api/customers/[id]/recap]", error);
    return apiError("Failed to load customer recap", 500, {
      code: "InternalError",
    });
  }
}
