import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { z } from "zod";

const patchItemsSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().nullable().optional().transform(val => val === "" ? null : val),
      productName: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      appliedUnitPrice: z.number().nonnegative(),
      originalUnitPrice: z.number().nonnegative(),
      subtotal: z.number().nonnegative(),
    })
  ),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("transaction", "update");
    const id = (await params).id;

    const body = await request.json();
    const result = patchItemsSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ message: "Invalid payload", errors: result.error.issues }, { status: 400 });
    }

    const { items } = result.data;

    const existingTx = await db.transaction.findFirst({
      where: { id, storeId: user.storeId || undefined },
    });

    if (!existingTx) {
      return NextResponse.json({ message: "Transaction not found" }, { status: 404 });
    }



    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const discount = 0; // For now assume no global discount, or keep it 0 if not handled
    const tax = 0; // Assume 0 or compute if needed
    const total = subtotal - discount + tax;

    await db.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id },
        data: {
          subtotal,
          total,
          items: {
            deleteMany: {},
            create: items.map(item => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              appliedUnitPrice: item.appliedUnitPrice,
              originalUnitPrice: item.originalUnitPrice,
              subtotal: item.subtotal,
            }))
          }
        }
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    console.error("Failed to update transaction items:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
