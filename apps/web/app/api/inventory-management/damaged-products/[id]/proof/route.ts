import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { removeStoredProofAsset } from "@/features/proof-upload/server/remove-stored-proof";
import { getLogger } from "@/lib/logger";
import { isProofStorageUnavailableError } from "@/features/proof-upload/server/r2-proof-storage";
const log = getLogger("api:inventory:damaged-proof:delete");

function extractDamageProofUrl(note: string | null) {
  return note?.split("\n").find((line) => line.startsWith("Proof URL: "))?.slice("Proof URL: ".length) ?? null;
}

export function removeDamageProofLines(note: string | null) {
  return (note ?? "").split("\n").filter((line) => !line.startsWith("Proof URL: ") && !line.startsWith("Resolved proof: ")).join("\n").trim();
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("proof_upload", "delete");
    if (!user.storeId) return NextResponse.json({ message: "Pengguna harus terhubung ke toko." }, { status: 403 });
    const { id } = await params;
    const source = await db.inventoryLog.findFirst({ where: { id, product: { storeId: user.storeId } }, select: { id: true, note: true } });
    const proofUrl = extractDamageProofUrl(source?.note ?? null);
    if (!source || !proofUrl) return NextResponse.json({ message: "Bukti kerusakan tidak ditemukan." }, { status: 404 });
    const removed = await removeStoredProofAsset(proofUrl);
    const logs = await db.inventoryLog.findMany({
      where: { product: { storeId: user.storeId }, note: { contains: `Proof URL: ${proofUrl}` } },
      select: { id: true, note: true },
    });
    await db.$transaction(logs.map((item) => db.inventoryLog.update({ where: { id: item.id }, data: { note: removeDamageProofLines(item.note) || null } })));
    log.info("Damaged-product proof references deleted", { userId: user.id, storeId: user.storeId, inventoryLogId: id, affected: logs.length, storage: removed.storage });
    return NextResponse.json({ data: { id, affected: logs.length } });
  } catch (error) {
    const authErr = handleAuthError(error); if (authErr) return authErr;
    log.error("Failed to delete damaged-product proof", error);
    const status = error instanceof Error && error.name === "UnknownProofReferenceError" ? 422 : isProofStorageUnavailableError(error) ? 503 : 500;
    return NextResponse.json({ message: status === 422 && error instanceof Error ? error.message : status === 503 ? "Foto bukti belum dapat dihapus dari R2. Silakan coba lagi." : "Referensi foto bukti gagal dikosongkan." }, { status });
  }
}
