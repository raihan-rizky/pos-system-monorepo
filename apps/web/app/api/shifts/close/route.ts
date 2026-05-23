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

const closeShiftSummarySchema = z.object({
  shiftId: z.string().min(1),
});

async function buildCloseShiftSummary(shiftId: string, storeId: string) {
  const shift = await db.cashierShift.findFirst({
    where: {
      id: shiftId,
      storeId,
      status: "OPEN",
    },
  });

  if (!shift) return null;

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

  const openingBalance = Number(shift.openingBalance);
  const totalCashTransactions = Number(cashAgg._sum.total || 0);
  const expectedBalance = openingBalance + totalCashTransactions;

  return {
    shift,
    summary: {
      shiftId: shift.id,
      openingBalance,
      totalCashTransactions,
      expectedBalance,
    },
  };
}

// GET /api/shifts/close?shiftId=...
export async function GET(request: Request) {
  try {
    const user = await requirePermission("shift", "update");
    const { searchParams } = new URL(request.url);
    const parsed = closeShiftSummarySchema.safeParse({
      shiftId: searchParams.get("shiftId"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const storeId = user.storeId || "store-main";
    const result = await buildCloseShiftSummary(parsed.data.shiftId, storeId);

    if (!result) {
      return NextResponse.json(
        { message: "Shift aktif tidak ditemukan" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result.summary }, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch close shift summary:", error);
    return NextResponse.json(
      { message: "Failed to fetch close shift summary" },
      { status: 500 },
    );
  }
}

// POST /api/shifts/close
export async function POST(request: Request) {
  try {
    const user = await requirePermission("shift", "update");
    const body = await request.json();
    const parsed = closeShiftSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const { shiftId, closingBalance, note } = parsed.data;
    const storeId = user.storeId || "store-main";
    const result = await buildCloseShiftSummary(shiftId, storeId);

    if (!result) {
      return NextResponse.json(
        { message: "Shift aktif tidak ditemukan" },
        { status: 404 },
      );
    }

    const { shift, summary } = result;
    const actualClosing = Number(closingBalance);
    const discrepancy = actualClosing - summary.expectedBalance;

    const closedShift = await db.cashierShift.update({
      where: { id: shift.id },
      data: {
        closingBalance: actualClosing,
        expectedBalance: summary.expectedBalance,
        discrepancy,
        status: "CLOSED",
        closedAt: new Date(),
        note: note || shift.note,
      },
    });

    return NextResponse.json(closedShift, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to close shift:", error);
    return NextResponse.json(
      { message: "Failed to close shift" },
      { status: 500 },
    );
  }
}
