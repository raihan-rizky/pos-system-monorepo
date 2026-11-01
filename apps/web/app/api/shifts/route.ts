import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { z } from "zod";
import { apiList, buildPaginationMeta, parsePagination } from "@/lib/api/responses";
import { getShiftSettings } from "@/lib/shift/shift-settings-server";
import { cashReceived } from "@/lib/shift/cash-summary";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:shifts");
export const dynamic = "force-dynamic";

const ALLOWED_SORT_FIELDS = ["openedAt", "closedAt", "openingBalance", "closingBalance", "expectedBalance", "discrepancy"] as const;
type SortField = (typeof ALLOWED_SORT_FIELDS)[number];
type ShiftWithCashier = Prisma.CashierShiftGetPayload<{
  include: { cashier: { select: { name: true } } };
}>;

function serializeShift(
  shift: ShiftWithCashier,
  overrides: { expectedBalance?: number } = {},
) {
  return {
    ...shift,
    openingBalance: Number(shift.openingBalance),
    closingBalance:
      shift.closingBalance === null ? null : Number(shift.closingBalance),
    expectedBalance:
      overrides.expectedBalance ??
      (shift.expectedBalance === null ? null : Number(shift.expectedBalance)),
    discrepancy: shift.discrepancy === null ? null : Number(shift.discrepancy),
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt?.toISOString() ?? null,
    pausedAt: shift.pausedAt?.toISOString() ?? null,
    pausedDurationSeconds: shift.pausedDurationSeconds ?? 0,
  };
}

// GET /api/shifts
// ?active=true -> Get current active shift
// ?sortBy=openedAt&sortOrder=desc -> Get shift history with sorting
// else -> Get shift history (default sort: openedAt desc)
export async function GET(request: Request) {
  try {
    const user = await requirePermission("shift", "read");
    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active") === "true";
    const storeId = user.storeId || "store-main";

    if (active) {
      const shift = await db.cashierShift.findFirst({
        where: {
          storeId,
          status: "OPEN",
        },
        include: {
          cashier: {
            select: { name: true },
          },
        },
      });
      return NextResponse.json({ data: shift ? serializeShift(shift) : null });
    }

    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 10,
      maxLimit: 100,
    });

    const rawSortBy = searchParams.get("sortBy") ?? "openedAt";
    const sortBy: SortField = (ALLOWED_SORT_FIELDS as readonly string[]).includes(rawSortBy)
      ? (rawSortBy as SortField)
      : "openedAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    const total = await db.cashierShift.count({ where: { storeId } });
    const shifts = await db.cashierShift.findMany({
      where: { storeId },
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: limit,
      include: {
        cashier: {
          select: { name: true },
        },
      },
    });

    // Compute expectedBalance for OPEN shifts (modal + cash transactions within shift period)
    const openShift = shifts.find((s) => s.status === "OPEN" && s.expectedBalance === null);
    let computedExpectedBalance: number | null = null;
    if (openShift) {
      const cashTransactions = await db.transaction.findMany({
        where: {
          storeId,
          status: { in: ["COMPLETED", "DP"] },
          createdAt: { gte: openShift.openedAt },
        },
        select: { total: true, amountPaid: true, status: true, paymentMethod: true, change: true,
          payments: { select: { method: true, amount: true } } },
      });
      const totalCash = cashTransactions.reduce((acc, transaction) => acc + cashReceived(transaction), 0);
      computedExpectedBalance = Number(openShift.openingBalance) + totalCash;
    }

    const serializedShifts = shifts.map((shift) =>
      shift.id === openShift?.id && computedExpectedBalance !== null
        ? serializeShift(shift, { expectedBalance: computedExpectedBalance })
        : serializeShift(shift),
    );

    return apiList(serializedShifts, buildPaginationMeta(total, page, limit));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch shifts:", error);
    return NextResponse.json({ message: "Failed to fetch shifts" }, { status: 500 });
  }
}


const openShiftSchema = z.object({
  openingBalance: z.number().min(0, "Saldo awalan invalid"),
  note: z.string().optional().nullable(),
  clientShiftId: z.string().min(1).max(200).optional(),
  openedAt: z.string().datetime().optional(),
  originCashierId: z.string().min(1).optional(),
  originStoreId: z.string().min(1).optional(),
}).refine((value) => !value.openedAt || Boolean(value.clientShiftId), {
  message: "ID shift diperlukan untuk menyimpan waktu pembukaan offline.",
  path: ["clientShiftId"],
}).refine((value) => !value.openedAt || Boolean(value.originCashierId && value.originStoreId), {
  message: "Identitas kasir dan toko asal diperlukan untuk menyinkronkan shift offline.",
  path: ["originCashierId"],
});

class ShiftConflictError extends Error {
  constructor(message = "Masih ada shift yang terbuka di toko ini.") {
    super(message);
    this.name = "ShiftConflictError";
  }
}

// POST /api/shifts
// Open a new shift
export async function POST(request: Request) {
  try {
    const user = await requirePermission("shift", "create");
    const body = await request.json();
    const validatedData = openShiftSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { message: "Validation error", errors: validatedData.error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    const { openingBalance, note, clientShiftId, openedAt, originCashierId, originStoreId } = validatedData.data;
    const cashierId = user.id;
    const storeId = user.storeId || "store-main";
    if ((originCashierId !== undefined || originStoreId !== undefined) &&
        (originCashierId !== cashierId || originStoreId !== storeId)) {
      return NextResponse.json({ message: "Kasir atau toko berubah. Masuk kembali sebagai kasir asal untuk menyinkronkan shift." }, { status: 403 });
    }

    const newShift = await db.$transaction(async (transaction) => {
      const [{ enabled: shiftEnabled }, existing] = await Promise.all([
        getShiftSettings(),
        transaction.cashierShift.findFirst({
          where: {
            storeId,
            status: "OPEN",
          },
        }),
      ]);

      if (existing) {
        if (clientShiftId && existing.id === clientShiftId && existing.cashierId === cashierId && Number(existing.openingBalance) === openingBalance) {
          return { shift: existing, replayed: true };
        }
        throw new ShiftConflictError();
      }

      if (openedAt) {
        // A backdated local shift must not overlap a shift already closed on
        // another device; its end time is not yet known during the open replay.
        const overlap = await transaction.cashierShift.findFirst({
          where: { storeId, status: "CLOSED", closedAt: { gte: new Date(openedAt) } },
          select: { id: true },
        });
        if (overlap) throw new ShiftConflictError("Waktu shift offline bertabrakan dengan waktu shift lain. Periksa bersama pengelola.");
      }

      const shift = await transaction.cashierShift.create({
        data: {
          ...(clientShiftId ? { id: clientShiftId } : {}),
          ...(openedAt ? { openedAt: new Date(openedAt) } : {}),
          cashierId,
          storeId,
          openingBalance: Number(openingBalance),
          note: note || null,
          status: "OPEN",
          pausedAt: shiftEnabled ? null : new Date(),
          pausedDurationSeconds: 0,
        },
      });
      return { shift, replayed: false };
    }, { isolationLevel: "Serializable" });

    return NextResponse.json(newShift.shift, { status: newShift.replayed ? 200 : 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof ShiftConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }

    log.error("Failed to open shift:", error);
    return NextResponse.json({ message: "Failed to open shift" }, { status: 500 });
  }
}
