import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { z } from "zod";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:shifts:id");
export const dynamic = "force-dynamic";

const updateShiftSchema = z.object({
  openingBalance: z.number().optional(),
  closingBalance: z.number().optional(),
  note: z.string().optional().nullable(),
});

// PATCH /api/shifts/[id] — Update an existing shift
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("shift", "update");
    const { id } = await params;
    const body = await request.json();
    const validatedData = updateShiftSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        {
          message: "Validation error",
          errors: validatedData.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }

    const { openingBalance, closingBalance, note } = validatedData.data;
    const storeId = user.storeId || "store-main";

    // Find the shift to make sure it belongs to the store
    const shift = await db.cashierShift.findFirst({
      where: { id, storeId },
    });

    if (!shift) {
      return NextResponse.json(
        { message: "Shift tidak ditemukan" },
        { status: 404 },
      );
    }

    const updateData: any = {};
    if (openingBalance !== undefined) updateData.openingBalance = openingBalance;
    if (closingBalance !== undefined) updateData.closingBalance = closingBalance;
    if (note !== undefined) updateData.note = note;

    // If balances change and shift is closed, recalculate discrepancy using aggregate
    if (
      shift.status === "CLOSED" &&
      (openingBalance !== undefined || closingBalance !== undefined)
    ) {
      const cashAgg = await db.transaction.aggregate({
        where: {
          storeId,
          paymentMethod: "CASH",
          status: { notIn: ["VOIDED", "REFUNDED"] },
          createdAt: {
            gte: shift.openedAt,
            lte: shift.closedAt || new Date(),
          },
        },
        _sum: { total: true },
      });

      const totalCashIncome = Number(cashAgg._sum.total || 0);
      const newOpening =
        openingBalance !== undefined
          ? openingBalance
          : Number(shift.openingBalance);
      const newExpected = newOpening + totalCashIncome;
      const newClosing =
        closingBalance !== undefined
          ? closingBalance
          : Number(shift.closingBalance || 0);

      updateData.expectedBalance = newExpected;
      updateData.discrepancy = newClosing - newExpected;
    }

    const updatedShift = await db.cashierShift.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updatedShift);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to update shift:", error);
    return NextResponse.json(
      { message: "Failed to update shift" },
      { status: 500 },
    );
  }
}
