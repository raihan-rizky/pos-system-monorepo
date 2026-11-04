import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { handleAuthError, requireRole } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:transaction-receipt-changes");
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("OWNER");
    const { id } = await params;
    const changes = await db.transactionReceiptChange.findMany({
      where: { storeId: user.storeId || "store-main", transactionId: id },
      orderBy: { sequence: "asc" },
      select: { id: true, actorName: true, createdAt: true, before: true, after: true },
    });
    return NextResponse.json({ data: { changes } });
  } catch (error) {
    const auth = handleAuthError(error);
    if (auth) return auth;
    log.error("receipt-changes.list.failed", { error });
    return NextResponse.json({ message: "Riwayat perubahan nota belum dapat dimuat." }, { status: 500 });
  }
}
