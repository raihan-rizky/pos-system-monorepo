import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { z } from "zod";

export const dynamic = "force-dynamic";

// GET /api/shifts
// ?active=true -> Get current active shift
// else -> Get shift history
export async function GET(request: Request) {
  try {
    const user = await requirePermission("shift", "read");
    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active") === "true";
    const storeId = user.storeId || "store-main";
    
    if (active) {
      // Find ANY open shift in the store — shifts are shared across all roles
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
      return NextResponse.json({ data: shift });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10", 10));
    
    // Pagination
    const total = await db.cashierShift.count({ where: { storeId } });
    const shifts = await db.cashierShift.findMany({
      where: { storeId },
      orderBy: { openedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        cashier: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({
      data: shifts,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to fetch shifts:", error);
    return NextResponse.json({ message: "Failed to fetch shifts" }, { status: 500 });
  }
}



const openShiftSchema = z.object({
  openingBalance: z.number().min(0, "Saldo awalan invalid"),
  note: z.string().optional().nullable(),
});

// POST /api/shifts
// Open a new shift
export async function POST(request: Request) {
  try {
    const user = await requirePermission("shift", "create");
    const body = await request.json();
    const validatedData = openShiftSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { message: "Validation error", errors: validatedData.error.issues },
        { status: 400 }
      );
    }
    
    const { openingBalance, note } = validatedData.data;
    const cashierId = user.id;
    const storeId = user.storeId || "store-main";

    // Check if there is already an active shift in this store (store-wide)
    const existing = await db.cashierShift.findFirst({
      where: {
        storeId,
        status: "OPEN",
      },
    });

    if (existing) {
      return NextResponse.json({ message: "Masih ada shift yang terbuka di toko ini." }, { status: 400 });
    }

    const newShift = await db.cashierShift.create({
      data: {
        cashierId,
        storeId,
        openingBalance: Number(openingBalance),
        note: note || null,
        status: "OPEN",
      },
    });

    return NextResponse.json(newShift, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to open shift:", error);
    return NextResponse.json({ message: "Failed to open shift" }, { status: 500 });
  }
}

const updateShiftSchema = z.object({
  id: z.string(),
  openingBalance: z.number().optional(),
  closingBalance: z.number().optional(),
  note: z.string().optional().nullable(),
});

// PATCH /api/shifts
// Update an existing shift
export async function PATCH(request: Request) {
  try {
    const user = await requirePermission("shift", "update");
    const body = await request.json();
    const validatedData = updateShiftSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { message: "Validation error", errors: validatedData.error.issues },
        { status: 400 }
      );
    }

    const { id, openingBalance, closingBalance, note } = validatedData.data;
    const storeId = user.storeId || "store-main";

    // Find the shift to make sure it belongs to the store
    const shift = await db.cashierShift.findFirst({
      where: { id, storeId }
    });

    if (!shift) {
      return NextResponse.json({ message: "Shift tidak ditemukan" }, { status: 404 });
    }

    const updateData: any = {};
    if (openingBalance !== undefined) updateData.openingBalance = openingBalance;
    if (closingBalance !== undefined) updateData.closingBalance = closingBalance;
    if (note !== undefined) updateData.note = note;

    // If balances change and shift is closed, recalculate discrepancy using aggregate
    if (shift.status === "CLOSED" && (openingBalance !== undefined || closingBalance !== undefined)) {
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
      const newOpening = openingBalance !== undefined ? openingBalance : Number(shift.openingBalance);
      const newExpected = newOpening + totalCashIncome;
      const newClosing = closingBalance !== undefined ? closingBalance : Number(shift.closingBalance || 0);
      
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

    console.error("Failed to update shift:", error);
    return NextResponse.json({ message: "Failed to update shift" }, { status: 500 });
  }
}
