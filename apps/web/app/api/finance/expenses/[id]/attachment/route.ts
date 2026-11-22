import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { authorizeInTransaction, canAuthenticatedUserAccessPage, handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { classifyAutomaticExpense } from "@/features/keuangan/helpers/automatic-expense";

const log = getLogger("api:finance:expenses:attachment");

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("proof_upload", "delete");
    if (!user.storeId) return NextResponse.json({ message: "Toko pengguna belum tersedia." }, { status: 403 });
    const storeId = user.storeId;
    const { id } = await params;
    const expense = await db.expense.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        attachmentUrl: true,
        deletedAt: true,
        shoppingRequestId: true,
        goodsPurchaseId: true,
        backdatedPurchaseDueId: true,
        backdatedPurchasePaymentId: true,
        manualPurchasePaymentMethod: true,
      },
    });
    if (!expense || expense.deletedAt || (!expense.attachmentUrl && expense.manualPurchasePaymentMethod !== "TRANSFER")) {
      return NextResponse.json({ message: "Bukti pengeluaran tidak ditemukan." }, { status: 404 });
    }
    if (expense.manualPurchasePaymentMethod === "TRANSFER") {
      for (const target of ["expense.manual_transfer", "expense.manual_transfer.edit"] as const) {
        const authorized = await requirePermission(target, "update");
        if (authorized.id !== user.id || authorized.storeId !== storeId || authorized.role !== user.role) return NextResponse.json({ message: "Sesi pengguna berubah. Muat ulang dan coba lagi." }, { status: 403 });
      }
      if (!await canAuthenticatedUserAccessPage(user, "/keuangan")) return NextResponse.json({ message: "Akses halaman Keuangan diperlukan." }, { status: 403 });
    }
    const classification = classifyAutomaticExpense(expense);
    if (classification.automatic) {
      return NextResponse.json(
        {
          message: `Lampiran pengeluaran dari ${classification.label} tidak dapat diubah dari halaman Keuangan.`,
        },
        { status: 409 },
      );
    }
    if (expense.manualPurchasePaymentMethod === "TRANSFER") {
      const body = await request.json().catch(() => null) as { expectedUpdatedAt?: unknown; requestKey?: unknown } | null;
      if (typeof body?.expectedUpdatedAt !== "string" || !Number.isFinite(new Date(body.expectedUpdatedAt).getTime())
        || typeof body.requestKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestKey)) {
        return NextResponse.json({ message: "Versi transfer tidak tersedia. Muat ulang dan coba lagi." }, { status: 409 });
      }
      const expectedVersion = new Date(body.expectedUpdatedAt).getTime();
      const requestKey = body.requestKey;
      const attachmentUrl = expense.attachmentUrl;
      const result = await db.$transaction(async tx => {
        const [locked] = await tx.$queryRaw<{ id: string; updatedAt: Date; attachmentUrl: string | null; manualTransferProofDeleteKey: string | null;
          manualTransferProofDeleteExpectedVersion: Date | null; manualTransferProofDeleteVersion: Date | null }[]>`
          SELECT "id", "updatedAt", "attachmentUrl", "manualTransferProofDeleteKey", "manualTransferProofDeleteExpectedVersion", "manualTransferProofDeleteVersion" FROM "pos_expenses"
          WHERE "id" = ${id} AND "storeId" = ${storeId} AND "deletedAt" IS NULL AND "manualPurchasePaymentMethod" = 'TRANSFER' FOR UPDATE
        `;
        if (locked?.attachmentUrl) await tx.$executeRaw`LOCK TABLE "pos_expenses" IN ROW EXCLUSIVE MODE`;
        if (!await authorizeInTransaction(tx, user, { resources: [
          { resource: "proof_upload", action: "delete" },
          { resource: "expense.manual_transfer", action: "update" },
          { resource: "expense.manual_transfer.edit", action: "update" },
        ], page: "/keuangan" })) return "forbidden" as const;
        if (locked?.manualTransferProofDeleteKey === requestKey && locked.manualTransferProofDeleteExpectedVersion?.getTime() === expectedVersion && locked.manualTransferProofDeleteVersion) {
          return { id, attachmentUrl: null, updatedAt: locked.manualTransferProofDeleteVersion };
        }
        if (!locked || !attachmentUrl || locked.updatedAt.getTime() !== expectedVersion || locked.attachmentUrl !== attachmentUrl) return null;
        const version = new Date(Math.max(Date.now(), locked.updatedAt.getTime() + 1));
        return tx.expense.update({ where: { id, storeId }, data: { attachmentUrl: null, updatedAt: version, manualTransferProofDeleteKey: requestKey,
          manualTransferProofDeleteExpectedVersion: new Date(expectedVersion), manualTransferProofDeleteVersion: version }, select: { id: true, attachmentUrl: true, updatedAt: true } });
      }, { isolationLevel: "ReadCommitted", timeout: 30_000 });
      if (result === "forbidden") return NextResponse.json({ message: "Sesi atau izin pengguna berubah. Muat ulang dan coba lagi." }, { status: 403 });
      if (!result) return NextResponse.json({ message: "Transfer telah berubah. Muat ulang dan periksa kembali." }, { status: 409 });
      return NextResponse.json({ data: result });
    }
    await db.expense.update({ where: { id }, data: { attachmentUrl: null } });
    log.info("Expense proof reference removed", { userId: user.id, storeId, expenseId: id });
    return NextResponse.json({ data: { id, attachmentUrl: null } });
  } catch (error) {
    const authErr = handleAuthError(error); if (authErr) return authErr;
    log.error("Failed to delete expense proof", error);
    return NextResponse.json({ message: "Referensi foto bukti gagal dikosongkan." }, { status: 500 });
  }
}
