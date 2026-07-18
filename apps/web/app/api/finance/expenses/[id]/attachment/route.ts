import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { removeStoredProofAsset } from "@/features/proof-upload/server/remove-stored-proof";
import { getLogger } from "@/lib/logger";
import { isProofStorageUnavailableError } from "@/features/proof-upload/server/r2-proof-storage";

const log = getLogger("api:finance:expenses:attachment");

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("proof_upload", "delete");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const expense = await db.expense.findFirst({
      where: { id, recordedBy: { storeId } },
      select: { id: true, attachmentUrl: true, deletedAt: true },
    });
    if (!expense || expense.deletedAt || !expense.attachmentUrl) {
      return NextResponse.json({ message: "Bukti pengeluaran tidak ditemukan." }, { status: 404 });
    }
    const removed = await removeStoredProofAsset(expense.attachmentUrl);
    await db.expense.update({ where: { id }, data: { attachmentUrl: null } });
    log.info("Expense proof reference deleted", { userId: user.id, storeId, expenseId: id, storage: removed.storage });
    return NextResponse.json({ data: { id, attachmentUrl: null } });
  } catch (error) {
    const authErr = handleAuthError(error); if (authErr) return authErr;
    log.error("Failed to delete expense proof", error);
    const status = error instanceof Error && error.name === "UnknownProofReferenceError" ? 422 : isProofStorageUnavailableError(error) ? 503 : 500;
    return NextResponse.json({ message: status === 422 && error instanceof Error ? error.message : status === 503 ? "Foto bukti belum dapat dihapus dari R2. Silakan coba lagi." : "Referensi foto bukti gagal dikosongkan." }, { status });
  }
}
