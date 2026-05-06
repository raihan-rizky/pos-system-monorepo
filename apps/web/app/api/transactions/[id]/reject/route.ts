import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

// POST /api/transactions/[id]/reject
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER");
    
    const { id } = params;

    // Fetch the pending transaction
    const transaction = await db.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      return NextResponse.json({ message: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    if (transaction.status !== "PENDING_APPROVAL") {
      return NextResponse.json({ message: "Transaksi bukan PENDING_APPROVAL" }, { status: 400 });
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

    console.error("Failed to reject transaction:", error);
    return NextResponse.json(
      { message: "Failed to reject transaction" },
      { status: 500 }
    );
  }
}
