import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

const closeShiftSchema = z.object({
  shiftId: z.string().min(1),
  closingBalance: z.number(),
  note: z.string().optional().nullable(),
});

// POST /api/shifts/close
export async function POST(request: Request) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER");
    const body = await request.json();
    const parsed = closeShiftSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { shiftId, closingBalance, note } = parsed.data;
    const storeId = user.storeId || "store-main";

    // Find the shift — store-wide, not tied to the closing user
    const shift = await db.cashierShift.findFirst({
      where: {
        id: shiftId,
        storeId,
        status: "OPEN",
      },
    });

    if (!shift) {
      return NextResponse.json({ message: "Shift aktif tidak ditemukan" }, { status: 404 });
    }

    // Calculate expected balance: openingBalance + CASH transactions - CHANGEs
    // Since only CASH transactions go to the physical drawer
    
    // Find all CASH transactions in this shift duration (store-wide)
    const cashTransactions = await db.transaction.findMany({
      where: {
        storeId,
        paymentMethod: "CASH",
        createdAt: {
          gte: shift.openedAt,
        },
      },
    });

    // For CASH transactions, the actual cash added to drawer is `total`
    const totalCashIncome = cashTransactions.reduce((acc: number, txn: typeof cashTransactions[number]) => acc + Number(txn.total), 0);
    
    const opening = Number(shift.openingBalance);
    const expectedBalance = opening + totalCashIncome;
    const actualClosing = Number(closingBalance);
    const discrepancy = actualClosing - expectedBalance;

    const closedShift = await db.cashierShift.update({
      where: { id: shift.id },
      data: {
        closingBalance: actualClosing,
        expectedBalance,
        discrepancy,
        status: "CLOSED",
        closedAt: new Date(),
        note: note || shift.note, // preserve old note if new one isn't provided, or append
      },
    });

    return NextResponse.json(closedShift, { status: 200 });

  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to close shift:", error);
    return NextResponse.json({ message: "Failed to close shift" }, { status: 500 });
  }
}
