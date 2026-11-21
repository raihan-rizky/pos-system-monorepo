import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { authorizeInTransaction, AuthError, canAuthenticatedUserAccessPage, handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { ReceivableError } from "@/features/customer-debt/helpers/manual-receivables";
import { correctReceivable, receivableCorrectionSchema } from "@/features/customer-debt/services/manual-receivable-correction";

const log = getLogger("api:customer-receivables:edit");
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("customer.receivable", "read");
    const editor = await requirePermission("customer.receivable.manual", "update");
    if (editor.id !== user.id || editor.storeId !== user.storeId || editor.role !== user.role) return NextResponse.json({ message: "Sesi pengguna berubah. Muat ulang dan coba lagi." }, { status: 403 });
    if (!await canAuthenticatedUserAccessPage(user, "/customers")) throw new AuthError(403, "Akses halaman Pelanggan diperlukan.");
    if (!user.storeId) return NextResponse.json({ message: "Toko pengguna belum tersedia." }, { status: 403 });
    const parsed = receivableCorrectionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: "Periksa rincian dan kategori piutang." }, { status: 422 });
    const { id } = await params;
    await db.$transaction(async tx => {
      const resources: Parameters<typeof authorizeInTransaction>[2]["resources"] = [{ resource: "customer.receivable", action: "read" }, { resource: "customer.receivable.manual", action: "update" }];
      if (!await authorizeInTransaction(tx, user, { resources, page: "/customers" })) throw new ReceivableError("Sesi atau izin pengguna berubah. Muat ulang dan coba lagi.", 403);
      await correctReceivable(tx, id, parsed.data, { id: user.id, storeId: user.storeId! }, async () => {
        if (!await authorizeInTransaction(tx, user, { resources: [{ resource: "customer", action: "read" }], page: "/customers" })) {
          throw new ReceivableError("Izin melihat pelanggan diperlukan untuk mengganti pelanggan.", 403);
        }
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const authError = handleAuthError(error); if (authError) return authError;
    if (error instanceof ReceivableError) return NextResponse.json({ message: error.message }, { status: error.status });
    log.error("Gagal mengubah piutang manual", error);
    return NextResponse.json({ message: "Piutang belum dapat diubah. Silakan coba lagi." }, { status: 500 });
  }
}
