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
import { recognizedExpenseFilter } from "@/features/keuangan/helpers/recognized-expense-filter";
import { validateManualTransferExpense } from "@/features/keuangan/helpers/manual-transfer-expense";
import { customExpenseCategoryId, customExpenseCategoryKey } from "@/features/keuangan/helpers/category-meta";

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
    const user = await requirePermission("expense", "read");
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const storeId = user.storeId;
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
    const customCategoryId = categoryParam ? customExpenseCategoryId(categoryParam) : null;
    if (categoryParam && !category && !customCategoryId) {
      return apiError("Kategori tidak valid.", 422, { code: "ValidationError" });
    }

    const where = {
      deletedAt: null,
      storeId,
      ...recognizedExpenseFilter(),
      occurredAt: { gte: range.start, lt: range.end },
      ...(customCategoryId ? { customCategoryId } : category ? { category, customCategoryId: null } : {}),
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
          customCategoryId: true,
          description: true,
          amount: true,
          changeAmount: true,
          occurredAt: true,
          createdAt: true,
          transactionId: true,
          attachmentUrl: true,
          manualPurchasePaymentMethod: true,
          hasMissingCostSnapshot: true,
          shoppingRequest: { select: { id: true, number: true } },
          goodsPurchase: { select: { id: true, number: true } },
          backdatedPurchaseDue: { select: { id: true, reference: true } },
          backdatedPurchasePayment: { select: { purchase: { select: { id: true, reference: true } } } },
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
        category: row.customCategoryId ? customExpenseCategoryKey(row.customCategoryId) : row.category,
        description: row.description,
        amount,
        changeAmount,
        netAmount: computeNetExpense(amount, changeAmount),
        occurredAt: row.occurredAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        transactionId: row.transactionId,
        attachmentUrl: row.attachmentUrl,
        hasMissingCostSnapshot: row.hasMissingCostSnapshot,
        source: row.backdatedPurchaseDue || row.backdatedPurchasePayment
          ? {
              type: "BACKDATED_PURCHASE" as const,
              id: (row.backdatedPurchaseDue ?? row.backdatedPurchasePayment!.purchase).id,
              number: (row.backdatedPurchaseDue ?? row.backdatedPurchasePayment!.purchase).reference,
            }
          : row.goodsPurchase
          ? {
              type: "GOODS_PURCHASE" as const,
              id: row.goodsPurchase.id,
              number: row.goodsPurchase.number,
            }
          : row.shoppingRequest
          ? {
              type: "SHOPPING_REQUEST" as const,
              id: row.shoppingRequest.id,
              number: row.shoppingRequest.number,
            }
          : row.manualPurchasePaymentMethod === "TRANSFER"
          ? { type: "MANUAL_TRANSFER_PURCHASE" as const }
          : { type: "MANUAL" as const },
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
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const storeId = user.storeId;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return apiError('Isian pengeluaran tidak valid.', 422, { code: 'ValidationError' });
    const isManualTransfer = body.manualPurchasePaymentMethod != null;
    const result = isManualTransfer ? validateManualTransferExpense(body) : validateExpensePayload(body, { now: new Date() });
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
      const exists = await db.transaction.findFirst({
        where: { id: body.transactionId, storeId },
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
    const customCategoryId = body.customCategoryId ?? null;
    if (customCategoryId !== null) {
      if (typeof customCategoryId !== "string" || !customCategoryId || data.category !== "OTHER") {
        return apiError("Kategori tidak valid.", 422, { code: "ValidationError" });
      }
      const exists = await db.customExpenseCategory.findFirst({ where: { id: customCategoryId, storeId }, select: { id: true } });
      if (!exists) return apiError("Kategori tidak ditemukan.", 422, { code: "ValidationError" });
    }
    const occurredAt = new Date(`${data.occurredAt}T00:00:00+07:00`);

    const created = await db.expense.create({
      data: {
        storeId,
        recordedById: user.id,
        applicantName: data.applicantName.trim(),
        category: data.category,
        customCategoryId,
        description: data.description?.trim() || null,
        amount: data.amount,
        changeAmount: data.changeAmount,
        occurredAt,
        transactionId: data.transactionId || null,
        attachmentUrl: data.attachmentUrl || null,
        manualPurchasePaymentMethod: isManualTransfer ? 'TRANSFER' : null,
      },
      select: {
        id: true,
        applicantName: true,
        category: true,
        customCategoryId: true,
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
          category: created.customCategoryId ? customExpenseCategoryKey(created.customCategoryId) : created.category,
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
