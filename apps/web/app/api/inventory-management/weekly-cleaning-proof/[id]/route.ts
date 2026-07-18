import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { removeStoredProofAsset } from "@/features/proof-upload/server/remove-stored-proof";
import { getLogger } from "@/lib/logger";
import { isProofStorageUnavailableError } from "@/features/proof-upload/server/r2-proof-storage";
const log = getLogger("api:inventory:weekly-proof:delete");

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("proof_upload", "delete");
    if (!user.storeId) return NextResponse.json({ message: "Pengguna harus terhubung ke toko." }, { status: 403 });
    const { id } = await params;
    const task = await db.inventoryTask.findFirst({
      where: { id, storeId: user.storeId, type: "WEEKLY_CLEANING_PROOF" },
      select: { id: true, proofUrl: true },
    });
    if (!task?.proofUrl) return NextResponse.json({ message: "Bukti mingguan tidak ditemukan." }, { status: 404 });
    const removed = await removeStoredProofAsset(task.proofUrl);
    await db.inventoryTask.update({ where: { id }, data: { proofUrl: null, resolvedProofImageUrl: null } });
    log.info("Weekly proof reference deleted", { userId: user.id, storeId: user.storeId, taskId: id, storage: removed.storage });
    return NextResponse.json({ data: { id, proofUrl: null } });
  } catch (error) {
    const authErr = handleAuthError(error); if (authErr) return authErr;
    log.error("Failed to delete weekly proof", error);
    const status = error instanceof Error && error.name === "UnknownProofReferenceError" ? 422 : isProofStorageUnavailableError(error) ? 503 : 500;
    return NextResponse.json({ message: status === 422 && error instanceof Error ? error.message : status === 503 ? "Foto bukti belum dapat dihapus dari R2. Silakan coba lagi." : "Referensi foto bukti gagal dikosongkan." }, { status });
  }
}
