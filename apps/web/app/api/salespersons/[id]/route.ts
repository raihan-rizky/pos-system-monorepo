import { NextRequest, NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

type SalespersonUpdateData = {
  name?: string;
  isActive?: boolean;
};

const updateSalespersonSchema = z.object({
  name: z.string().min(1, "Name must be between 1 and 100 characters").max(100).optional(),
  isActive: z.boolean().optional(),
}).refine(data => data.name !== undefined || data.isActive !== undefined, {
  message: "No valid fields to update"
});

export const dynamic = 'force-dynamic';

// PATCH /api/salespersons/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id = "";
  try {
    const user = await requirePermission("salesperson", "update");
    ({ id } = await params);
    const storeId = user.storeId || "store-main";
    const body = await request.json();
    
    const validatedData = updateSalespersonSchema.safeParse(body);
    if (!validatedData.success) {
      return NextResponse.json(
        { message: "Validation error", errors: validatedData.error.issues },
        { status: 400 }
      );
    }
    
    const updateData: SalespersonUpdateData = {};

    if (validatedData.data.name !== undefined) {
      updateData.name = validatedData.data.name.trim();
    }

    if (validatedData.data.isActive !== undefined) {
      updateData.isActive = validatedData.data.isActive;
    }

    // Verify salesperson exists before update
    const existing = await db.salesperson.findFirst({ where: { id, storeId } });
    if (!existing) {
      return NextResponse.json({ message: "Salesperson not found" }, { status: 404 });
    }

    const salesperson = await db.salesperson.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(salesperson);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error(`Failed to update salesperson ${id}:`, error);
    return NextResponse.json({ message: "Failed to update salesperson" }, { status: 500 });
  }
}

// DELETE /api/salespersons/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id = "";
  try {
    const user = await requirePermission("salesperson", "delete");
    ({ id } = await params);
    const storeId = user.storeId || "store-main";

    // Check if salesperson exists and has transactions
    const salesperson = await db.salesperson.findFirst({
      where: { id, storeId },
      include: {
        _count: {
          select: { transactions: true }
        }
      }
    });

    if (!salesperson) {
      return NextResponse.json({ message: "Salesperson not found" }, { status: 404 });
    }

    if (salesperson._count.transactions > 0) {
      return NextResponse.json(
        { message: "Cannot delete salesperson with existing transactions. Please deactivate instead." },
        { status: 400 }
      );
    }

    await db.salesperson.delete({
      where: { id }
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error(`Failed to delete salesperson ${id}:`, error);
    return NextResponse.json({ message: "Failed to delete salesperson" }, { status: 500 });
  }
}
