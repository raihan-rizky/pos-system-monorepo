import { db } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  EXPENSE_CATEGORIES,
  buildKeuanganMonthRange,
  computeNetExpense,
  validateExpensePayload,
  type ExpenseCategory,
} from "@/features/keuangan/helpers/keuangan-core";
import { getLogger } from "@/lib/logger";
import {
  apiError,
  apiList,
  buildPaginationMeta,
  parsePagination,
} from "@/lib/api/responses";
import { NextResponse } from "next/server";

const log = getLogger("api:finance:expenses");
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

function isCategory(v: string | null): v is ExpenseCategory {
  return v !== null && (EXPENSE_CATEGORIES as readonly string[]).includes(v);
}

export async function GET(request: Request) {
  try {
    await requirePermission("expense", "read");
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month");
    if (monthParam && !MONTH_PATTERN.test(monthParam)) {
      return apiError("Invalid month format (YYYY-MM)", 422, {
        code: "ValidationError",
      });
    }
    const month = monthParam ?? currentJakartaMonth();
    const range = buildKeuanganMonthRange(month);

    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 50,
      maxLimit: 100,
    });
    const categoryParam = searchParams.get("category");
    const category = isCategory(categoryParam) ? categoryParam : null;

    const where = {
      deletedAt: null,
      occurredAt: { gte: range.start, lt: range.end },
      ...(category ? { category } : {}),
    } as const;

    const [items, total] = await Promise.all([
      db.expense.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          applicantName: true,
          category: true,
          description: true,
          amount: true,
          changeAmount: true,
          occurredAt: true,
          createdAt: true,
          transactionId: true,
          attachmentUrl: true,
          recordedBy: { select: { id: true, name: true } },
        },
      }),
      db.expense.count({ where }),
    ]);

    const data = items.map((row) => {
      const amount = Number(row.amount.toString());
      const changeAmount = Number(row.changeAmount.toString());
      return {
        id: row.id,
        applicantName: row.applicantName,
        category: row.category,
        description: row.description,
        amount,
        changeAmount,
        netAmount: computeNetExpense(amount, changeAmount),
        occurredAt: row.occurredAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        transactionId: row.transactionId,
        attachmentUrl: row.attachmentUrl,
        recordedBy: row.recordedBy,
      };
    });

    return apiList(data, buildPaginationMeta(total, page, limit));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to list expenses", error);
    return apiError("Failed to list expenses", 500, { code: "InternalError" });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("expense", "create");
    const body = await request.json();
    const result = validateExpensePayload(body, { now: new Date() });
    if (!result.success) {
      const errors: Record<string, string[]> = {};
      for (const err of result.errors) {
        errors[err.path] = errors[err.path] ?? [];
        errors[err.path].push(err.message);
      }
      return apiError("Invalid expense payload", 422, {
        code: "ValidationError",
        errors,
      });
    }
    if (
      body.transactionId &&
      typeof body.transactionId === "string" &&
      body.transactionId.length > 0
    ) {
      const exists = await db.transaction.findUnique({
        where: { id: body.transactionId },
        select: { id: true },
      });
      if (!exists) {
        return apiError("Linked transaction not found", 422, {
          code: "ValidationError",
          errors: { transactionId: ["Linked transaction not found"] },
        });
      }
    }

    const data = result.data;
    const occurredAt = new Date(`${data.occurredAt}T00:00:00+07:00`);

    const created = await db.expense.create({
      data: {
        recordedById: user.id,
        applicantName: data.applicantName.trim(),
        category: data.category,
        description: data.description?.trim() || null,
        amount: data.amount,
        changeAmount: data.changeAmount,
        occurredAt,
        transactionId: data.transactionId || null,
        attachmentUrl: data.attachmentUrl || null,
      },
      select: {
        id: true,
        applicantName: true,
        category: true,
        description: true,
        amount: true,
        changeAmount: true,
        occurredAt: true,
        createdAt: true,
        transactionId: true,
        attachmentUrl: true,
      },
    });

    return NextResponse.json(
      {
        data: {
          ...created,
          amount: Number(created.amount.toString()),
          changeAmount: Number(created.changeAmount.toString()),
          netAmount: computeNetExpense(
            created.amount.toString(),
            created.changeAmount.toString(),
          ),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to create expense", error);
    return apiError("Failed to create expense", 500, { code: "InternalError" });
  }
}
