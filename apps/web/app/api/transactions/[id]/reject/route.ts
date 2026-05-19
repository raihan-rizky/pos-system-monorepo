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
    
    const { id } = await params;

    // Fetch the pending transaction
    const transaction = await db.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      return NextResponse.json({ message: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    if (transaction.status !== "PENDING_APPROVAL") {
      return NextResponse.json({ message: "Transaksi bukan PENDING_APPROVAL" }, { status: 409 });
    }

    // Set status to VOIDED
    const updatedTransaction = await db.transaction.update({
      where: { id },
      data: {
        status: "VOIDED",
        cashierId: user.id,
      },
    });

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
