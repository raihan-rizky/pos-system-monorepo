import { NextResponse } from "next/server";
import { db } from "@pos/db";

export const dynamic = "force-dynamic";

// POST /api/shifts/close
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { shiftId, closingBalance, note } = body;
    const cashierId = "user-kasir1";
    const storeId = "store-main";
    
    if (!shiftId || closingBalance === undefined || closingBalance === null) {
      return NextResponse.json({ message: "Invalid parameters" }, { status: 400 });
    }

    // Find the shift opening balance
    const shift = await db.cashierShift.findFirst({
      where: {
        id: shiftId,
        cashierId,
        storeId,
        status: "OPEN",
      },
    });

    if (!shift) {
      return NextResponse.json({ message: "Shift aktif tidak ditemukan" }, { status: 404 });
    }

    // Calculate expected balance: openingBalance + CASH transactions - CHANGEs
    // Since only CASH transactions go to the physical drawer
    
    // Find all CASH transactions in this shift duration
    // The transactions belong to the same cashier and store, and created after openedAt
    const cashTransactions = await db.transaction.findMany({
      where: {
        cashierId,
        storeId,
        paymentMethod: "CASH",
        createdAt: {
          gte: shift.openedAt,
        },
      },
    });

    // For CASH transactions, the actual cash added to drawer is `total`
    const totalCashIncome = cashTransactions.reduce((acc: number, txn) => acc + Number(txn.total), 0);
    
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
    console.error("Failed to close shift:", error);
    return NextResponse.json({ message: "Failed to close shift" }, { status: 500 });
  }
}
