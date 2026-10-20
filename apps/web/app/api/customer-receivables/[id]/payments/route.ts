import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { payReceivable, receivablePaymentSchema, ReceivableError } from "@/features/customer-debt/helpers/manual-receivables";

export const dynamic = "force-dynamic";
const log = getLogger("api:customer-receivables:payments");

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("customer", "update");
    const { id } = await params;
    const parsed = receivablePaymentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Periksa data pembayaran.", errors: parsed.error.flatten() }, { status: 422 });
    const receivable = await db.$transaction((tx) => payReceivable(tx, id, parsed.data, { id: user.id, storeId: user.storeId || "store-main" }));
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
