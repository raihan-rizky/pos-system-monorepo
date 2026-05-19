import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:shifts:close");
export const dynamic = "force-dynamic";

const closeShiftSchema = z.object({
  shiftId: z.string().min(1),
  closingBalance: z.number(),
  note: z.string().optional().nullable(),
});

// POST /api/shifts/close
export async function POST(request: Request) {
  try {
    const user = await requirePermission("shift", "update");
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

    // Find the shift â€” store-wide, not tied to the closing user
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
    
    const cashAgg = await db.transaction.aggregate({
      where: {
        storeId,
        paymentMethod: "CASH",
        status: { notIn: ["VOIDED", "REFUNDED"] },
        createdAt: {
          gte: shift.openedAt,
        },
      },
      _sum: { total: true },
    });

    // For CASH transactions, the actual cash added to drawer is `total`
    const totalCashIncome = Number(cashAgg._sum.total || 0);
    
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

    log.error("Failed to close shift:", error);
    return NextResponse.json({ message: "Failed to close shift" }, { status: 500 });
  }
}
