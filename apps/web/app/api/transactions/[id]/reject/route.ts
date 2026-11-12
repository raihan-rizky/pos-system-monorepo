import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:transactions:id:reject");
export const dynamic = "force-dynamic";

// POST /api/transactions/[id]/reject
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("transaction.approve", "delete");
    const storeId = user.storeId || "store-main";
    
    const { id } = await params;

    // Fetch the pending transaction
    const transaction = await db.transaction.findFirst({
      where: { id, storeId },
    });

    if (!transaction) {
      return NextResponse.json({ message: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    if (transaction.status !== "PENDING_APPROVAL") {
      return NextResponse.json({ message: "Transaksi sudah diproses. Gunakan Void pada Riwayat sesuai izin akun." }, { status: 409 });
    }

    // Set status to VOIDED
    const result = await db.transaction.updateMany({
      where: { id, storeId, status: "PENDING_APPROVAL" },
      data: {
        status: "VOIDED",
        cashierId: user.id,
      },
    });
    if (result.count !== 1) return NextResponse.json({ message: "Transaksi sudah berubah. Muat ulang sebelum mencoba lagi." }, { status: 409 });
    const updatedTransaction = await db.transaction.findFirst({ where: { id, storeId } });

    return NextResponse.json(updatedTransaction, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to reject transaction:", error);
    return NextResponse.json(
      { message: "Failed to reject transaction" },
      { status: 500 }
    );
  }
}
