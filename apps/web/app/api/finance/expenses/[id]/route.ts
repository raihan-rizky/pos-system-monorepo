import { db, type Prisma } from "@pos/db";
import { authorizeInTransaction, canAuthenticatedUserAccessPage, handleAuthError, requirePermission, requireRole } from "@/lib/rbac/guard";
import {
  computeNetExpense,
  validateExpensePayload,
} from "@/features/keuangan/helpers/keuangan-core";
import { classifyAutomaticExpense } from "@/features/keuangan/helpers/automatic-expense";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";
import { customExpenseCategoryKey } from "@/features/keuangan/helpers/category-meta";
import { validateManualTransferExpense } from "@/features/keuangan/helpers/manual-transfer-expense";
import { isAllowedManualTransferProof } from "@/features/keuangan/helpers/manual-transfer-proof";
import { isManualExpenseReportCategory } from "@/features/keuangan/helpers/manual-report-categories";
import { jakartaToday } from "@/features/keuangan/helpers/supplier-payable-input";
import { linkTransferAllocations, type ManualTransferAllocationInput } from "@/features/keuangan/services/manual-transfer-allocation-service";
import { lockTransferAllocationPayables } from "@/features/keuangan/services/lock-transfer-allocation-payables";
import { ManualPayableReconciliationError } from "@/features/keuangan/services/manual-payable-reconciliation";

const log = getLogger("api:finance:expenses:id");
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const storeId = user.storeId;
    const { id } = await params;

    const existing = await db.expense.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        deletedAt: true,
        shoppingRequestId: true,
        goodsPurchaseId: true,
        backdatedPurchaseDueId: true,
        backdatedPurchasePaymentId: true,
        customCategoryId: true,
        attachmentUrl: true,
        manualPurchasePaymentMethod: true,
      },
    });
    const updater = await requirePermission(existing?.manualPurchasePaymentMethod === "TRANSFER" ? "expense.manual_transfer" : "expense", "update");
    if (updater.id !== user.id || updater.storeId !== storeId || updater.role !== user.role) return apiError("Sesi pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
    if (existing?.manualPurchasePaymentMethod === "TRANSFER") {
      const editor = await requirePermission("expense.manual_transfer.edit", "update");
      if (editor.id !== user.id || editor.storeId !== storeId || editor.role !== user.role) return apiError("Sesi pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
      const reader = await requirePermission("expense", "read");
      if (reader.id !== user.id || reader.storeId !== storeId || reader.role !== user.role) return apiError("Sesi pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
      if (!await canAuthenticatedUserAccessPage(user, "/keuangan")) return apiError("Akses halaman Keuangan diperlukan.", 403, { code: "Forbidden" });
    }
    if (!existing || existing.deletedAt) {
      return apiError("Expense not found", 404, { code: "NotFound" });
    }
    const classification = classifyAutomaticExpense(existing);
    if (classification.automatic) {
      return apiError(
        `Pengeluaran dari ${classification.label} tidak dapat diedit dari halaman Keuangan.`,
        409,
        { code: "Conflict" },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return apiError('Isian pengeluaran tidak valid.', 422, { code: 'ValidationError' });
    const isManualTransfer = existing.manualPurchasePaymentMethod === 'TRANSFER';
    if (isManualTransfer && (typeof body.updatedAt !== 'string' || !Number.isFinite(new Date(body.updatedAt).getTime()))) {
      return apiError('Versi transfer tidak tersedia. Muat ulang dan coba lagi.', 409, { code: 'Conflict' });
    }
    if (!isManualTransfer && body.manualPurchasePaymentMethod != null) return apiError('Sumber pengeluaran tidak dapat diubah.', 422, { code: 'ValidationError' });
    if (body.allocations !== undefined && (!isManualTransfer || !Array.isArray(body.allocations) || body.allocations.length > 100)) return apiError('Daftar alokasi transfer tidak valid.', 422, { code: 'ValidationError' });
    const allocations = body.allocations as ManualTransferAllocationInput[] | undefined;
    if (allocations) {
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
    if (isManualTransfer && body.attachmentUrl !== undefined && body.attachmentUrl !== existing.attachmentUrl && !isAllowedManualTransferProof(body.attachmentUrl, storeId)) return apiError("Bukti transfer tidak sesuai dengan toko ini.", 422, { code: "ValidationError" });
    const nextAttachment = isManualTransfer && body.attachmentUrl === undefined ? existing.attachmentUrl : (result.data.attachmentUrl || null);
    if (isManualTransfer && existing.attachmentUrl && nextAttachment !== existing.attachmentUrl) {
      const proofEditor = await requirePermission("proof_upload", "delete");
      if (proofEditor.id !== user.id || proofEditor.storeId !== storeId || proofEditor.role !== user.role) return apiError("Sesi pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
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
    const customCategoryId = body.customCategoryId === undefined
      ? (data.category === "OTHER" ? existing.customCategoryId : null)
      : body.customCategoryId;
    if (customCategoryId != null) {
      if (typeof customCategoryId !== "string" || !customCategoryId || data.category !== "OTHER") {
        return apiError("Kategori tidak valid.", 422, { code: "ValidationError" });
      }
      const category = await db.customExpenseCategory.findFirst({ where: { id: customCategoryId, storeId }, select: { id: true } });
      if (!category) return apiError("Kategori tidak ditemukan.", 422, { code: "ValidationError" });
    }
    const occurredAt = new Date(`${data.occurredAt}T00:00:00+07:00`);
    const updateExpense = (client: Pick<Prisma.TransactionClient, "expense">) => client.expense.update({
      where: { id, storeId, deletedAt: null },
      data: {
        applicantName: data.applicantName.trim(),
        category: data.category,
        ...(isManualTransfer && isManualExpenseReportCategory(body.reportCategory) ? { reportCategory: body.reportCategory } : {}),
        customCategoryId,
        description: data.description?.trim() || null,
        amount: data.amount,
        changeAmount: data.changeAmount,
        occurredAt,
        transactionId: data.transactionId || null,
        attachmentUrl: nextAttachment,
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
    const updated = isManualTransfer ? await db.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string; updatedAt: Date; attachmentUrl: string | null }[]>`SELECT "id", "updatedAt", "attachmentUrl" FROM "pos_expenses" WHERE "id" = ${id} AND "storeId" = ${storeId} AND "deletedAt" IS NULL AND "manualPurchasePaymentMethod" = 'TRANSFER' FOR UPDATE`;
      const resources = [
        { resource: "expense.manual_transfer", action: "update" as const },
        { resource: "expense.manual_transfer.edit", action: "update" as const },
        { resource: "expense", action: "read" as const },
        ...(allocations ? [
          { resource: "expense.manual_transfer.allocation", action: "update" as const },
          { resource: "expense.payable", action: "read" as const },
          ...(allocations.some(allocation => allocation?.paymentId === null) ? [{ resource: "expense.payable", action: "update" as const }] : []),
        ] : []),
        ...(existing.attachmentUrl && nextAttachment !== existing.attachmentUrl ? [{ resource: "proof_upload", action: "delete" as const }] : []),
      ];
      const authorize = async (correction = false) => {
        if (!await authorizeInTransaction(tx, user, { resources: correction ? [...resources, { resource: "expense.payable.manual.payment", action: "update" }] : resources, page: "/keuangan" })) {
          throw new ManualPayableReconciliationError("Sesi atau izin pengguna berubah. Muat ulang halaman dan coba lagi.", 403);
        }
      };
      if (locked.length) {
        // Link-manual takes SHARE on this table before payable and RBAC locks.
        await tx.$executeRaw`LOCK TABLE "pos_expenses" IN ROW EXCLUSIVE MODE`;
        if (allocations) await lockTransferAllocationPayables(tx, { storeId, expenseId: id }, allocations);
      }
      await authorize();
      if (!locked.length) throw new ManualPayableReconciliationError("Transfer manual tidak ditemukan.", 404);
      if (locked[0].updatedAt.getTime() !== new Date(body.updatedAt).getTime()) throw new ManualPayableReconciliationError("Transfer telah berubah. Muat ulang dan periksa kembali sebelum menyimpan.", 409);
      if (locked[0].attachmentUrl !== existing.attachmentUrl) throw new ManualPayableReconciliationError("Bukti transfer telah berubah. Muat ulang dan periksa kembali sebelum menyimpan.", 409);
      if (!allocations) {
        const linked = await tx.manualTransferAllocation.findMany({ where: { expenseId: id, storeId }, select: { amount: true, payment: { select: { paidAt: true } } } });
        const allocatedCents = linked.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
        if (allocatedCents > Math.round((data.amount - data.changeAmount) * 100) || linked.some(item => item.payment.paidAt.toISOString().slice(0, 10) !== data.occurredAt)) {
          throw new ManualPayableReconciliationError("Nominal atau tanggal transfer tidak sesuai dengan alokasi hutang. Ubah alokasi terlebih dahulu.", 409);
        }
      }
      const expense = await updateExpense(tx);
      if (allocations) await linkTransferAllocations(tx, { storeId, expenseId: id, actorId: user.id, todayWib: jakartaToday(), authorizeAfterLocks: () => authorize(), authorizeAutomaticCorrection: () => authorize(true) }, allocations);
      return expense;
    }, { isolationLevel: "ReadCommitted" }) : await updateExpense(db);

    const amount = Number(updated.amount.toString());
    const changeAmount = Number(updated.changeAmount.toString());
    return NextResponse.json({
      data: {
        ...updated,
        category: updated.customCategoryId ? customExpenseCategoryKey(updated.customCategoryId) : updated.category,
        amount,
        changeAmount,
        netAmount: computeNetExpense(amount, changeAmount),
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof ManualPayableReconciliationError) return apiError(error.message, error.status, { code: error.status === 403 ? "Forbidden" : error.status === 404 ? "NotFound" : error.status === 422 ? "ValidationError" : "Conflict" });
    log.error("Failed to update expense", error);
    return apiError("Failed to update expense", 500, { code: "InternalError" });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const storeId = user.storeId;
    const { id } = await params;
    const existing = await db.expense.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        deletedAt: true,
        shoppingRequestId: true,
        goodsPurchaseId: true,
        backdatedPurchaseDueId: true,
        backdatedPurchasePaymentId: true,
        manualPurchasePaymentMethod: true,
      },
    });
    const remover = await requirePermission(existing?.manualPurchasePaymentMethod === "TRANSFER" ? "expense.manual_transfer" : "expense", "delete");
    if (remover.id !== user.id || remover.storeId !== storeId || remover.role !== user.role) return apiError("Sesi pengguna berubah. Muat ulang dan coba lagi.", 403, { code: "Forbidden" });
    if (existing?.manualPurchasePaymentMethod === "TRANSFER" && !await canAuthenticatedUserAccessPage(user, "/keuangan")) return apiError("Akses halaman Keuangan diperlukan.", 403, { code: "Forbidden" });
    if (!existing) {
      return apiError("Expense not found", 404, { code: "NotFound" });
    }
    const classification = classifyAutomaticExpense(existing);
    if (classification.automatic) {
      return apiError(
        `Pengeluaran dari ${classification.label} tidak dapat dihapus dari halaman Keuangan.`,
        409,
        { code: "Conflict" },
      );
    }
    if (existing.deletedAt && existing.manualPurchasePaymentMethod !== "TRANSFER") {
      return NextResponse.json({
        data: { id, deletedAt: existing.deletedAt },
      });
    }
    const removeExpense = (client: Pick<Prisma.TransactionClient, "expense">) => client.expense.update({ where: { id, storeId }, data: { deletedAt: new Date() }, select: { id: true, deletedAt: true } });
    const updated = existing.manualPurchasePaymentMethod === "TRANSFER" ? await db.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string; deletedAt: Date | null }[]>`SELECT "id", "deletedAt" FROM "pos_expenses" WHERE "id" = ${id} AND "storeId" = ${storeId} AND "manualPurchasePaymentMethod" = 'TRANSFER' FOR UPDATE`;
      if (locked.length && !locked[0].deletedAt) await tx.$executeRaw`LOCK TABLE "pos_expenses" IN ROW EXCLUSIVE MODE`;
      if (!await authorizeInTransaction(tx, user, { resources: [{ resource: "expense.manual_transfer", action: "delete" }], page: "/keuangan" })) {
        throw new ManualPayableReconciliationError("Sesi atau izin pengguna berubah. Muat ulang halaman dan coba lagi.", 403);
      }
      if (!locked.length) throw new ManualPayableReconciliationError("Transfer manual tidak ditemukan.", 404);
      if (locked[0].deletedAt) return locked[0];
      const linked = await tx.manualTransferAllocation.findMany({ where: { expenseId: id, storeId }, select: { id: true }, take: 1 });
      if (linked.length) throw new ManualPayableReconciliationError("Lepaskan alokasi hutang sebelum menghapus transfer.", 409);
      return removeExpense(tx);
    }, { isolationLevel: "ReadCommitted" }) : await removeExpense(db);
    return NextResponse.json({
      data: { id: updated.id, deletedAt: updated.deletedAt },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof ManualPayableReconciliationError) return apiError(error.message, error.status, { code: error.status === 403 ? "Forbidden" : error.status === 404 ? "NotFound" : "Conflict" });
    log.error("Failed to delete expense", error);
    return apiError("Failed to delete expense", 500, { code: "InternalError" });
  }
}
