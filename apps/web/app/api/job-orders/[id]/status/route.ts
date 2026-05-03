import { NextResponse } from "next/server";
import { db } from "@pos/db";

export const dynamic = 'force-dynamic';

// PATCH /api/job-orders/[id]/status — Move a job order to a new production status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { productionStatus } = body;

    const validStatuses = [
      "PENDING", "DESIGNING", "PRINTING", "FINISHING", "READY_PICKUP", "DELIVERED",
    ];

    if (!productionStatus || !validStatuses.includes(productionStatus)) {
      return NextResponse.json(
        { message: "Invalid production status" },
        { status: 400 }
      );
    }

    // Verify the transaction exists and is a job order
    const existing = await db.transaction.findUnique({ where: { id } });
    if (!existing || !existing.isJobOrder) {
      return NextResponse.json(
        { message: "Job order not found" },
        { status: 404 }
      );
    }

    const updated = await db.transaction.update({
      where: { id },
      data: { productionStatus },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, imageUrl: true },
            },
          },
        },
        salesperson: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update job order status:", error);
    return NextResponse.json(
      { message: "Failed to update status" },
      { status: 500 }
    );
  }
}
