import { NextRequest, NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

type SalespersonWhereData = {
  storeId?: string;
  isActive?: boolean;
};

const createSalespersonSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be between 1 and 100 characters"),
  isActive: z.boolean().optional().default(true),
});

export const dynamic = 'force-dynamic';

// GET /api/salespersons
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("salesperson", "read");
    const { searchParams } = new URL(request.url);
    const storeId = user.storeId || "store-main";
    const activeOnly = searchParams.get("activeOnly") === "true";

    const whereClause: SalespersonWhereData = { storeId };
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
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to fetch salespersons:", error);
    return NextResponse.json({ message: "Failed to fetch salespersons" }, { status: 500 });
  }
}

// POST /api/salespersons
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("salesperson", "create");
    const body = await request.json();
    const validatedData = createSalespersonSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { message: "Validation error", errors: validatedData.error.issues },
        { status: 400 }
      );
    }
    
    const { name, isActive } = validatedData.data;
    const storeId = user.storeId || "store-main";
    const trimmedName = name.trim();

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
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to create salesperson:", error);
    return NextResponse.json({ message: "Failed to create salesperson" }, { status: 500 });
  }
}
