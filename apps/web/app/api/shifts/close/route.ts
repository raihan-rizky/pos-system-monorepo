import { NextResponse } from "next/server";
import { db, type Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { cashReceived } from "@/lib/shift/cash-summary";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:shifts:close");
export const dynamic = "force-dynamic";

const closeShiftSchema = z.object({
  shiftId: z.string().min(1),
  closingBalance: z.number(),
  note: z.string().optional().nullable(),
  closedAt: z.string().datetime().optional(),
});

const closeShiftSummarySchema = z.object({
  shiftId: z.string().min(1),
});

async function buildCloseShiftSummary(shiftId: string, storeId: string, closedAt?: Date, client: Pick<Prisma.TransactionClient, "cashierShift" | "transaction"> = db) {
  const shift = await client.cashierShift.findFirst({
    where: {
      id: shiftId,
      storeId,
      status: "OPEN",
    },
  });

  if (!shift) return null;

  const cashTransactions = await client.transaction.findMany({
    where: {
      storeId,
      status: { in: ["COMPLETED", "DP"] },
      createdAt: {
        gte: shift.openedAt,
        ...(closedAt ? { lte: closedAt } : {}),
      },
    },
    select: { total: true, amountPaid: true, status: true, paymentMethod: true, change: true,
      payments: { select: { method: true, amount: true } } },
  });

  const totalCashTransactions = cashTransactions.reduce((acc, transaction) => acc + cashReceived(transaction), 0);
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

    const { shiftId, closingBalance, note, closedAt } = parsed.data;
    const storeId = user.storeId || "store-main";
    const replayedClose = closedAt ? new Date(closedAt) : undefined;
    const effectiveClosedAt = replayedClose ?? new Date();
    return await db.$transaction(async (tx) => {
      // A no-op update holds the shift row lock until the summary and close
      // commit. Replayed sales acquire the same lock before inserting.
      const lock = await tx.cashierShift.updateMany({
        where: { id: shiftId, storeId, status: "OPEN" },
        data: { pausedDurationSeconds: { increment: 0 } },
      });

      if (lock.count !== 1) {
        if (replayedClose) {
          const existing = await tx.cashierShift.findFirst({
            where: { id: shiftId, storeId, cashierId: user.id, status: "CLOSED" },
          });
          if (existing && Number(existing.closingBalance) === closingBalance &&
              existing.closedAt?.getTime() === replayedClose.getTime()) {
            return NextResponse.json(existing, { status: 200 });
          }
        }
        return NextResponse.json(
          { message: "Shift aktif tidak ditemukan" },
          { status: 404 },
        );
      }

      let result = await buildCloseShiftSummary(shiftId, storeId, effectiveClosedAt, tx);
      if (!result) return NextResponse.json({ message: "Shift aktif tidak ditemukan" }, { status: 409 });

      const { shift } = result;
      if (replayedClose && (shift.cashierId !== user.id || replayedClose < shift.openedAt)) {
        return NextResponse.json({ message: "Waktu atau identitas penutupan shift tidak sesuai." }, { status: 409 });
      }
      const pendingSale = await tx.transaction.findFirst({
        where: {
          storeId,
          status: "PENDING_APPROVAL",
          offlineClientMutationId: { not: null },
          createdAt: { gte: shift.openedAt, lte: effectiveClosedAt },
        },
        select: { id: true },
      });
      if (pendingSale) {
        return NextResponse.json({ message: "Ada transaksi yang menunggu approval. Selesaikan approval sebelum sinkronisasi penutupan shift." }, { status: 409 });
      }
      // Approval may have completed between the first summary read and the
      // pending check. Refresh the summary before saving the balance.
      result = await buildCloseShiftSummary(shiftId, storeId, effectiveClosedAt, tx);
      if (!result) return NextResponse.json({ message: "Shift aktif tidak ditemukan" }, { status: 409 });
      const { summary } = result;
      const actualClosing = Number(closingBalance);
      const discrepancy = actualClosing - summary.expectedBalance;

      // Keep the status guard on the final write while the row lock is held.
      const updateData = {
        closingBalance: actualClosing,
        expectedBalance: summary.expectedBalance,
        discrepancy,
        status: "CLOSED" as const,
        closedAt: effectiveClosedAt,
        note: note || shift.note,
      };
      const guarded = await tx.cashierShift.updateMany({
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
    });
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
