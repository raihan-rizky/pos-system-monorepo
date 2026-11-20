import { db } from "@pos/db";
import { handleAuthError, requirePermission, requireRole } from "@/lib/rbac/guard";
import {
  EXPENSE_CATEGORIES,
  computeNetExpense,
  validateExpensePayload,
  type ExpenseCategory,
} from "@/features/keuangan/helpers/keuangan-core";
import { getLogger } from "@/lib/logger";
import {
  apiError,
  buildPaginationMeta,
  parsePagination,
} from "@/lib/api/responses";
import { NextResponse } from "next/server";
import { validateManualTransferExpense } from "@/features/keuangan/helpers/manual-transfer-expense";
import { customExpenseCategoryId, customExpenseCategoryKey } from "@/features/keuangan/helpers/category-meta";
import { loadRecognizedExpenses } from "@/features/keuangan/services/recognized-finance";

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

    const recognized = await loadRecognizedExpenses(storeId, month);
    const filtered = categoryParam ? recognized.rows.filter(row => row.category === categoryParam) : recognized.rows;
    return NextResponse.json({ data: filtered.slice(skip, skip + limit),
      pagination: buildPaginationMeta(filtered.length, page, limit), incomplete: recognized.incomplete });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to list expenses", error);
    return apiError("Failed to list expenses", 500, { code: "InternalError" });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const storeId = user.storeId;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return apiError('Isian pengeluaran tidak valid.', 422, { code: 'ValidationError' });
    const isManualTransfer = body.manualPurchasePaymentMethod != null;
    await requirePermission(isManualTransfer ? "expense.manual_transfer" : "expense", "create");
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
