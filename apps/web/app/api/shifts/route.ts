import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { z } from "zod";
import { apiList, buildPaginationMeta, parsePagination } from "@/lib/api/responses";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:shifts");
export const dynamic = "force-dynamic";

const ALLOWED_SORT_FIELDS = ["openedAt", "closedAt", "openingBalance", "closingBalance", "expectedBalance", "discrepancy"] as const;
type SortField = (typeof ALLOWED_SORT_FIELDS)[number];

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
      return NextResponse.json({ data: shift });
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
    let enrichedShifts = shifts as (typeof shifts[number] & { expectedBalance: bigint | number | null })[];
    if (openShift) {
      const cashAgg = await db.transaction.aggregate({
        where: {
          storeId,
          paymentMethod: "CASH",
          status: { notIn: ["VOIDED", "REFUNDED"] },
          createdAt: { gte: openShift.openedAt },
        },
        _sum: { total: true },
      });
      const totalCash = Number(cashAgg._sum.total || 0);
      enrichedShifts = shifts.map((s) =>
        s.id === openShift.id
          ? { ...s, expectedBalance: Number(s.openingBalance) + totalCash }
          : s,
      );
    }

    return apiList(enrichedShifts, buildPaginationMeta(total, page, limit));
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
        { status: 422 },
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
