import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { z } from "zod";
import { apiList, buildPaginationMeta, parsePagination } from "@/lib/api/responses";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:shifts");
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
      // Find ANY open shift in the store â€” shifts are shared across all roles
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

    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 10,
      maxLimit: 100,
    });

    // Pagination
    const total = await db.cashierShift.count({ where: { storeId } });
    const shifts = await db.cashierShift.findMany({
      where: { storeId },
      orderBy: { openedAt: "desc" },
      skip,
      take: limit,
      include: {
        cashier: {
          select: { name: true },
        },
      },
    });

    return apiList(shifts, buildPaginationMeta(total, page, limit));
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
        { message: "Validation error", errors: validatedData.error.flatten().fieldErrors },
        { status: 422 }
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
      return NextResponse.json({ message: "Masih ada shift yang terbuka di toko ini." }, { status: 409 });
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

    log.error("Failed to open shift:", error);
    return NextResponse.json({ message: "Failed to open shift" }, { status: 500 });
  }
}
