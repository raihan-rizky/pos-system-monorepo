import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

// GET /api/shifts
// ?active=true -> Get current active shift
// else -> Get shift history
export async function GET(request: Request) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER");
    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active") === "true";
    const cashierId = user.id; // Using real user id
    const storeId = user.storeId || "store-main";
    
    if (active) {
      const shift = await db.cashierShift.findFirst({
        where: {
          cashierId,
          storeId,
          status: "OPEN",
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

import { z } from "zod";

const openShiftSchema = z.object({
  openingBalance: z.number().min(0, "Saldo awalan invalid"),
  note: z.string().optional().nullable(),
});

// POST /api/shifts
// Open a new shift
export async function POST(request: Request) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER");
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

    // Check if there is already an active shift for this cashier
    const existing = await db.cashierShift.findFirst({
      where: {
        cashierId,
        storeId,
        status: "OPEN",
      },
    });

    if (existing) {
      return NextResponse.json({ message: "Anda masih memiliki shift yang terbuka." }, { status: 400 });
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
