import { NextResponse } from "next/server";
import { db } from "@pos/db";
import type { Role } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:job-orders:id:status");
export const dynamic = "force-dynamic";

const updateStatusSchema = z.object({
  productionStatus: z.enum(["PRINTING", "READY_PICKUP", "DELIVERED"]),
});

const jobOrderInclude = {
  items: {
    include: {
      product: {
        select: { id: true, name: true, imageUrl: true },
      },
    },
  },
  salesperson: { select: { id: true, name: true } },
  customer: { select: { phone: true } },
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("production", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const body = await request.json();

    const validatedData = updateStatusSchema.safeParse(body);
    if (!validatedData.success) {
      return NextResponse.json(
        {
          message: "Invalid production status",
          errors: validatedData.error.flatten().fieldErrors,
        },
        { status: 422 },
      );
    }
    const { productionStatus } = validatedData.data;

    const updated = await db.$transaction(async (tx) => {
      const existing = await tx.transaction.findFirst({
        where: { id, storeId, isJobOrder: true },
        select: {
          id: true,
          invoiceNumber: true,
          customerName: true,
          productionStatus: true,
        },
      });

      if (!existing) {
        throw new Error("JOB_ORDER_NOT_FOUND");
      }

      if (existing.productionStatus === productionStatus) {
        return tx.transaction.findUniqueOrThrow({
          where: { id },
          include: jobOrderInclude,
        });
      }

      const moved = await tx.transaction.update({
        where: { id },
        data: { productionStatus },
        include: jobOrderInclude,
      });

      await tx.productionActivityLog.create({
        data: {
          transactionId: existing.id,
          storeId,
          invoiceNumber: existing.invoiceNumber,
          customerName: existing.customerName,
          fromStatus: existing.productionStatus,
          toStatus: productionStatus,
          actorId: user.id,
          actorName: user.name || user.username,
          actorRole: user.role as Role,
        },
      });

      return moved;
    });

    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof Error && error.message === "JOB_ORDER_NOT_FOUND") {
      return NextResponse.json(
        { message: "Job order not found" },
        { status: 404 },
      );
    }

    log.error("Failed to update job order status:", error);
    return NextResponse.json(
      { message: "Failed to update status" },
      { status: 500 },
    );
  }
}
