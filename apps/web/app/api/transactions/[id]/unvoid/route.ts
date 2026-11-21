import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { previewTransactionUnvoid, restoreTransactionUnvoid } from "@/features/transactions-stock/services/transaction-unvoid-service";

const bodySchema = z.object({ previewToken: z.string().regex(/^[a-f0-9]{64}$/) });
const safeMessages = new Set([
  "Audit void tidak lengkap. Transaksi perlu diperiksa.",
  "Audit void tidak konsisten. Transaksi perlu diperiksa.",
  "Audit void tidak ditemukan atau tidak konsisten.",
  "Transaksi void tidak ditemukan.",
  "Data pelanggan telah berubah. Transaksi perlu diperiksa.",
  "Data transaksi telah berubah. Transaksi perlu diperiksa.",
  "Data stok telah berubah. Transaksi perlu diperiksa.",
  "Riwayat stok telah berubah. Transaksi perlu diperiksa.",
  "Kelompok stok tidak ditemukan.",
  "Asal atau satuan stok perlu diperiksa sebelum transaksi dipulihkan.",
  "Stok tidak mencukupi untuk memulihkan transaksi.",
  "Surat jalan telah berubah. Transaksi perlu diperiksa.",
  "Data transaksi telah berubah. Tinjau kembali.",
  "Data stok telah berubah. Tinjau kembali.",
  "Data telah berubah. Tinjau kembali pratinjau.",
  "Stok telah berubah. Tinjau kembali pratinjau.",
  "Pelanggan tidak ditemukan. Transaksi perlu diperiksa.",
  "Surat jalan telah berubah. Tinjau kembali pratinjau.",
  "Status transaksi telah berubah. Tinjau kembali pratinjau.",
]);

function responseForError(error: unknown) {
  const auth = handleAuthError(error);
  if (auth) return auth;
  if (error instanceof Error && safeMessages.has(error.message)) return NextResponse.json({ message: error.message }, { status: 409 });
  return NextResponse.json({ message: "Pemulihan belum dapat diproses. Silakan coba lagi." }, { status: 500 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("transaction.unvoid", "update");
    if (user.role !== "OWNER") return NextResponse.json({ message: "Hanya owner yang dapat memulihkan transaksi." }, { status: 403 });
    const { id } = await params;
    const preview = await previewTransactionUnvoid(db, { storeId: user.storeId || "store-main", transactionId: id, actor: user });
    return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return responseForError(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("transaction.unvoid", "update");
    if (user.role !== "OWNER") return NextResponse.json({ message: "Hanya owner yang dapat memulihkan transaksi." }, { status: 403 });
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: "Tinjau pemulihan terlebih dahulu." }, { status: 400 });
    const { id } = await params;
    const result = await db.$transaction((tx) => restoreTransactionUnvoid(tx, {
      storeId: user.storeId || "store-main", transactionId: id, actor: user, previewToken: parsed.data.previewToken,
    }), { timeout: 30000 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return responseForError(error); }
}
