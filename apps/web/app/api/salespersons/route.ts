import { NextRequest, NextResponse } from "next/server";
import { db } from "@pos/db";
import { Prisma } from "@pos/db";

export const dynamic = 'force-dynamic';

// GET /api/salespersons
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const activeOnly = searchParams.get("activeOnly") === "true";

    const whereClause: Prisma.SalespersonWhereInput = {};
    if (storeId) whereClause.storeId = storeId;
    if (activeOnly) whereClause.isActive = true;

    const salespersons = await db.salesperson.findMany({
      where: whereClause,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { transactions: true } }
      }
    });

    return NextResponse.json(salespersons);
  } catch (error) {
    console.error("Failed to fetch salespersons:", error);
    return NextResponse.json({ message: "Failed to fetch salespersons" }, { status: 500 });
  }
}

// POST /api/salespersons
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, storeId, isActive } = body;

    // Input validation
    if (!name || typeof name !== "string") {
      return NextResponse.json({ message: "Name is required and must be a string" }, { status: 400 });
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 100) {
      return NextResponse.json({ message: "Name must be between 1 and 100 characters" }, { status: 400 });
    }

    if (!storeId || typeof storeId !== "string") {
      return NextResponse.json({ message: "storeId is required" }, { status: 400 });
    }

    // Verify storeId exists
    const store = await db.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return NextResponse.json({ message: "Store not found" }, { status: 404 });
    }

    const salesperson = await db.salesperson.create({
      data: {
        name: trimmedName,
        storeId,
        isActive: typeof isActive === "boolean" ? isActive : true,
      }
    });

    return NextResponse.json(salesperson, { status: 201 });
  } catch (error) {
    console.error("Failed to create salesperson:", error);
    return NextResponse.json({ message: "Failed to create salesperson" }, { status: 500 });
  }
}
