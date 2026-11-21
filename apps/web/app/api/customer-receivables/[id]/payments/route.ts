import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { AuthError, authorizeInTransaction, canAuthenticatedUserAccessPage, requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { payReceivable, receivablePaymentSchema, ReceivableError } from "@/features/customer-debt/helpers/manual-receivables";

export const dynamic = "force-dynamic";
const log = getLogger("api:customer-receivables:payments");

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("customer.receivable", "read");
    const creator = await requirePermission("customer.receivable.payment", "create");
    if (creator.id !== user.id || creator.storeId !== user.storeId || creator.role !== user.role) return NextResponse.json({ message: "Sesi pengguna berubah. Muat ulang dan coba lagi." }, { status: 403 });
    if (!await canAuthenticatedUserAccessPage(user, "/customers")) throw new AuthError(403, "Akses halaman Pelanggan diperlukan.");
    if (!user.storeId) return NextResponse.json({ message: "Toko pengguna belum tersedia." }, { status: 403 });
    const { id } = await params;
    const parsed = receivablePaymentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Periksa data pembayaran.", errors: parsed.error.flatten() }, { status: 422 });
    const storeId = user.storeId;
    const receivable = await db.$transaction(async tx => {
      const resources: Parameters<typeof authorizeInTransaction>[2]["resources"] = [
        { resource: "customer.receivable", action: "read" },
        { resource: "customer.receivable.payment", action: "create" },
      ];
      if (!await authorizeInTransaction(tx, user, { resources, page: "/customers" })) {
        throw new ReceivableError("Sesi atau izin pengguna berubah. Muat ulang dan coba lagi.", 403);
      }
      return payReceivable(tx, id, parsed.data, { id: user.id, storeId });
    });
    return NextResponse.json(receivable);
  } catch (error) {
    const authError = handleAuthError(error); if (authError) return authError;
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Data pembayaran tidak valid." }, { status: 400 });
    if (error instanceof ReceivableError) return NextResponse.json({ message: error.message }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ message: "Permintaan pembayaran sudah digunakan. Silakan muat ulang piutang." }, { status: 409 });
    log.error("Gagal mencatat pembayaran piutang manual", error);
    return NextResponse.json({ message: "Pembayaran belum bisa dicatat. Silakan coba lagi." }, { status: 500 });
  }
}
