import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

export const dynamic = 'force-dynamic';

const updateStatusSchema = z.object({
  productionStatus: z.enum(["PENDING", "DESIGNING", "PRINTING", "FINISHING", "READY_PICKUP", "DELIVERED"]),
});

// PATCH /api/job-orders/[id]/status — Move a job order to a new production status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("production", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const body = await request.json();
    
    const validatedData = updateStatusSchema.safeParse(body);
    if (!validatedData.success) {
      return NextResponse.json(
        { message: "Invalid production status", errors: validatedData.error.issues },
        { status: 400 }
      );
    }
    const { productionStatus } = validatedData.data;

    // Verify the transaction exists and is a job order
    const existing = await db.transaction.findFirst({
      where: { id, storeId, isJobOrder: true },
      select: { id: true },
    });
    if (!existing) {
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
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to update job order status:", error);
    return NextResponse.json(
      { message: "Failed to update status" },
      { status: 500 }
    );
  }
}
