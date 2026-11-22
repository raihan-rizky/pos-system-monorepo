import { createHash } from "node:crypto";
import { db, type Prisma } from "@pos/db";
import { authorizeInTransaction, canAuthenticatedUserAccessPage, handleAuthError, requirePermission, requireRole } from "@/lib/rbac/guard";
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
import { isAllowedManualTransferProof } from "@/features/keuangan/helpers/manual-transfer-proof";
import { isManualExpenseReportCategory } from "@/features/keuangan/helpers/manual-report-categories";
import { customExpenseCategoryId, customExpenseCategoryKey } from "@/features/keuangan/helpers/category-meta";
import { loadRecognizedExpenses } from "@/features/keuangan/services/recognized-finance";
import { jakartaToday } from "@/features/keuangan/helpers/supplier-payable-input";
import { linkTransferAllocations, type ManualTransferAllocationInput } from "@/features/keuangan/services/manual-transfer-allocation-service";
import { lockTransferAllocationPayables } from "@/features/keuangan/services/lock-transfer-allocation-payables";
import { ManualPayableReconciliationError } from "@/features/keuangan/services/manual-payable-reconciliation";

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
    if (!await canAuthenticatedUserAccessPage(user, "/keuangan")) return apiError("Akses halaman Keuangan diperlukan.", 403, { code: "Forbidden" });
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
    const reportCategory = categoryParam?.startsWith("report:") ? categoryParam.slice(7) : null;
    const validReportCategory = reportCategory === "UNASSIGNED" || isManualExpenseReportCategory(reportCategory);
    if (categoryParam && !category && !customCategoryId && !validReportCategory) {
      return apiError("Kategori tidak valid.", 422, { code: "ValidationError" });
    }

    const recognized = await loadRecognizedExpenses(storeId, month);
    const filtered = categoryParam ? recognized.rows.filter(row => row.category === categoryParam || row.reportCategories?.includes(categoryParam as typeof row.category)) : recognized.rows;
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
    const creator = await requirePermission(isManualTransfer ? "expense.manual_transfer" : "expense", "create");
    if (creator.id !== user.id || creator.storeId !== storeId || creator.role !== user.role) return apiError("Sesi pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
    if (isManualTransfer && !await canAuthenticatedUserAccessPage(user, "/keuangan")) return apiError("Akses halaman Keuangan diperlukan.", 403, { code: "Forbidden" });
    if (body.allocations !== undefined && (!isManualTransfer || !Array.isArray(body.allocations) || body.allocations.length > 100)) {
      return apiError("Daftar alokasi transfer tidak valid.", 422, { code: "ValidationError" });
    }
    const allocations = (body.allocations ?? []) as ManualTransferAllocationInput[];
    if (allocations.length) {
      const permissions = [["expense", "read"], ["expense.manual_transfer.allocation", "update"], ["expense.payable", "read"],
        ...(allocations.some(allocation => allocation?.paymentId === null) ? [["expense.payable", "update"] as const] : [])] as const;
      for (const [target, action] of permissions) {
        const authorized = await requirePermission(target, action);
        if (authorized.id !== user.id || authorized.storeId !== storeId || authorized.role !== user.role) return apiError("Sesi pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
      }
    }
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
    if (isManualTransfer && !isAllowedManualTransferProof(body.attachmentUrl, storeId)) return apiError("Bukti transfer tidak sesuai dengan toko ini.", 422, { code: "ValidationError" });
    const requestKey = request.headers.get('Idempotency-Key');
    if (isManualTransfer && (!requestKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestKey))) {
      return apiError('Kunci penyimpanan transfer tidak tersedia. Muat ulang dan coba lagi.', 422, { code: 'ValidationError' });
    }
    const transferId = isManualTransfer ? `manual-transfer-${createHash('sha256').update(JSON.stringify([storeId, requestKey!.toLowerCase()])).digest('hex')}` : undefined;
    const fingerprint = isManualTransfer ? createHash('sha256').update(JSON.stringify({ userId: user.id, data, reportCategory: body.reportCategory, allocations })).digest('hex') : undefined;
    const transferResources = [
      { resource: "expense.manual_transfer", action: "create" as const },
      ...(allocations.length ? [
        { resource: "expense", action: "read" as const },
        { resource: "expense.manual_transfer.allocation", action: "update" as const },
        { resource: "expense.payable", action: "read" as const },
        ...(allocations.some(allocation => allocation?.paymentId === null) ? [{ resource: "expense.payable", action: "update" as const }] : []),
      ] : []),
    ];
    const customCategoryId = body.customCategoryId ?? null;
    if (customCategoryId !== null) {
      if (typeof customCategoryId !== "string" || !customCategoryId || data.category !== "OTHER") {
        return apiError("Kategori tidak valid.", 422, { code: "ValidationError" });
      }
      const exists = await db.customExpenseCategory.findFirst({ where: { id: customCategoryId, storeId }, select: { id: true } });
      if (!exists) return apiError("Kategori tidak ditemukan.", 422, { code: "ValidationError" });
    }
    const occurredAt = new Date(`${data.occurredAt}T00:00:00+07:00`);

    const createExpense = (client: Pick<Prisma.TransactionClient, "expense">) => client.expense.create({
      data: {
        ...(isManualTransfer ? { id: transferId, manualTransferFingerprint: fingerprint } : {}),
        storeId,
        recordedById: user.id,
        applicantName: data.applicantName.trim(),
        category: data.category,
        reportCategory: isManualTransfer && isManualExpenseReportCategory(body.reportCategory) ? body.reportCategory : null,
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
        reportCategory: true,
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
    let replay = false;
    let created;
    const replaySelect = {
      id: true, applicantName: true, category: true, reportCategory: true, customCategoryId: true, description: true,
      amount: true, changeAmount: true, occurredAt: true, createdAt: true, transactionId: true, attachmentUrl: true,
      deletedAt: true, manualTransferFingerprint: true,
    } as const;
    try {
      created = isManualTransfer ? await db.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([storeId, user.id, "manual-transfer-attempt"])}, 0))`;
        const authorize = async (correction = false) => {
          if (!await authorizeInTransaction(tx, user, { resources: correction ? [...transferResources, { resource: "expense.payable.manual.payment", action: "update" }] : transferResources, page: "/keuangan" })) {
            throw new ManualPayableReconciliationError("Sesi atau izin pengguna berubah. Muat ulang halaman dan coba lagi.", 403);
          }
        };
        const [attempt] = await tx.$queryRaw<Array<{ id: string; body: string }>>`
          SELECT "id", "body" FROM "pos_manual_transfer_attempts"
          WHERE "id" = ${requestKey!.toLowerCase()} AND "storeId" = ${storeId} AND "userId" = ${user.id} FOR UPDATE
        `;
        let existing = await tx.expense.findFirst({ where: { id: transferId, storeId }, select: replaySelect });
        if (existing) {
          await tx.$queryRaw`SELECT "id" FROM "pos_expenses" WHERE "id" = ${transferId} AND "storeId" = ${storeId} FOR UPDATE`;
          existing = await tx.expense.findFirst({ where: { id: transferId, storeId }, select: replaySelect });
          await authorize();
          if (!existing || existing.deletedAt || existing.manualTransferFingerprint !== fingerprint || (attempt && attempt.body !== JSON.stringify(body))) {
            throw new ManualPayableReconciliationError('Permintaan transfer ini sudah digunakan untuk data lain. Muat ulang dan periksa kembali.', 409);
          }
          if (attempt) await tx.manualTransferAttempt.updateMany({ where: { id: attempt.id, storeId, userId: user.id, completedAt: null }, data: { completedAt: new Date() } });
          const { deletedAt: _deletedAt, manualTransferFingerprint: _fingerprint, ...saved } = existing;
          replay = true;
          return saved;
        }
        if (!attempt || attempt.body !== JSON.stringify(body)) {
          await authorize();
          throw new ManualPayableReconciliationError('Percobaan transfer berubah atau tidak tersedia. Muat ulang dan coba lagi.', 409);
        }
        // Link-manual takes SHARE on this table before payable and RBAC locks.
        await tx.$executeRaw`LOCK TABLE "pos_expenses" IN ROW EXCLUSIVE MODE`;
        if (allocations.length) await lockTransferAllocationPayables(tx, { storeId }, allocations);
        await authorize();
        const expense = await createExpense(tx);
        if (allocations.length) await linkTransferAllocations(tx, { storeId, expenseId: expense.id, actorId: user.id, todayWib: jakartaToday(), authorizeAfterLocks: () => authorize(), authorizeAutomaticCorrection: () => authorize(true) }, allocations);
        await tx.manualTransferAttempt.updateMany({ where: { id: attempt.id, storeId, userId: user.id }, data: { completedAt: new Date() } });
        return expense;
      }, { isolationLevel: "ReadCommitted" }) : await createExpense(db);
    } catch (error) {
      if (!isManualTransfer || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') throw error;
      const existing = await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "pos_expenses" WHERE "id" = ${transferId} AND "storeId" = ${storeId} FOR UPDATE`;
        if (!await authorizeInTransaction(tx, user, { resources: transferResources, page: "/keuangan" })) {
          throw new ManualPayableReconciliationError("Sesi atau izin pengguna berubah. Muat ulang halaman dan coba lagi.", 403);
        }
        return tx.expense.findFirst({ where: { id: transferId, storeId }, select: replaySelect });
      }, { isolationLevel: "ReadCommitted" });
      if (!existing || existing.deletedAt || existing.manualTransferFingerprint !== fingerprint) {
        return apiError('Permintaan transfer ini sudah digunakan untuk data lain. Muat ulang dan periksa kembali.', 409, { code: 'Conflict' });
      }
      const { deletedAt: _deletedAt, manualTransferFingerprint: _fingerprint, ...saved } = existing;
      created = saved;
      replay = true;
    }

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
      { status: replay ? 200 : 201 },
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof ManualPayableReconciliationError) return apiError(error.message, error.status, { code: error.status === 403 ? "Forbidden" : error.status === 404 ? "NotFound" : error.status === 422 ? "ValidationError" : "Conflict" });
    log.error("Failed to create expense", error);
    return apiError("Failed to create expense", 500, { code: "InternalError" });
  }
}
