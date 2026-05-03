import { NextRequest, NextResponse } from "next/server";
import { db } from "@pos/db";
import { Prisma } from "@pos/db";

export const dynamic = 'force-dynamic';

// PATCH /api/salespersons/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, isActive } = body;

    const updateData: Prisma.SalespersonUpdateInput = {};

    if (name !== undefined) {
      if (typeof name !== "string") {
        return NextResponse.json({ message: "Name must be a string" }, { status: 400 });
      }
      const trimmedName = name.trim();
      if (trimmedName.length === 0 || trimmedName.length > 100) {
        return NextResponse.json({ message: "Name must be between 1 and 100 characters" }, { status: 400 });
      }
      updateData.name = trimmedName;
    }

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return NextResponse.json({ message: "isActive must be a boolean" }, { status: 400 });
      }
      updateData.isActive = isActive;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ message: "No valid fields to update" }, { status: 400 });
    }

    // Verify salesperson exists before update
    const existing = await db.salesperson.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ message: "Salesperson not found" }, { status: 404 });
    }

    const salesperson = await db.salesperson.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(salesperson);
  } catch (error) {
    console.error(`Failed to update salesperson ${params.id}:`, error);
    return NextResponse.json({ message: "Failed to update salesperson" }, { status: 500 });
  }
}

// DELETE /api/salespersons/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Check if salesperson exists and has transactions
    const salesperson = await db.salesperson.findUnique({
      where: { id },
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
    console.error(`Failed to delete salesperson ${params.id}:`, error);
    return NextResponse.json({ message: "Failed to delete salesperson" }, { status: 500 });
  }
}
