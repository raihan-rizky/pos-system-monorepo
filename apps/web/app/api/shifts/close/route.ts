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

  const cashTransactions = await db.transaction.findMany({
    where: {
      storeId,
      paymentMethod: "CASH",
      status: { in: ["COMPLETED", "DP"] },
      createdAt: {
        gte: shift.openedAt,
      },
    },
    select: { total: true, amountPaid: true, status: true },
  });

  const totalCashTransactions = cashTransactions.reduce((acc, t) => {
    return acc + Number(t.status === "DP" ? t.amountPaid : t.total);
  }, 0);
  const openingBalance = Number(shift.openingBalance);
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

    // Guard the write on `status: "OPEN"` so a second concurrent close (or a
    // double-click) can't overwrite an already-closed shift's balances. The
    // summary read above is not atomic with this write, so two requests can
    // both pass the OPEN check; only the one whose updateMany matches the
    // still-open row wins. A zero match means the shift was already closed.
    const updateData = {
      closingBalance: actualClosing,
      expectedBalance: summary.expectedBalance,
      discrepancy,
      status: "CLOSED" as const,
      closedAt: new Date(),
      note: note || shift.note,
    };
    const guarded = await db.cashierShift.updateMany({
      where: { id: shift.id, storeId, status: "OPEN" },
      data: updateData,
    });

    if (guarded.count !== 1) {
      return NextResponse.json(
        { message: "Shift sudah ditutup oleh permintaan lain" },
        { status: 409 },
      );
    }

    return NextResponse.json({ ...shift, ...updateData }, { status: 200 });
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
