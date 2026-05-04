import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";

const updateTransactionSchema = z.object({
  salesName: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]).optional(),
  status: z.enum(["COMPLETED", "DP", "VOIDED", "REFUNDED"]).optional(),
});

// PATCH /api/transactions/[id]
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const parsed = updateTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { salesName, customerName, paymentMethod, status } = parsed.data;

    // Build update payload — only include defined fields
    const updateData: Record<string, any> = {};
    if (salesName !== undefined) updateData.salesName = salesName || null;
    if (customerName !== undefined) updateData.customerName = customerName || null;
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { message: "Tidak ada field yang diubah" },
        { status: 400 }
      );
    }

    const updated = await db.transaction.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          select: {
            id: true,
            productName: true,
            size: true,
            material: true,
            quantity: true,
            unitPrice: true,
            subtotal: true,
          },
        },
        cashier: { select: { name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update transaction:", error);
    if (error?.code === "P2025") {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { message: "Failed to update transaction" },
      { status: 500 }
    );
  }
}

// DELETE /api/transactions/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Delete items first (referential integrity), then the transaction
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.transactionItem.deleteMany({ where: { transactionId: id } });
      await tx.transaction.delete({ where: { id } });
    });

    return NextResponse.json({ message: "Transaction deleted" });
  } catch (error: any) {
    console.error("Failed to delete transaction:", error);
    if (error?.code === "P2025") {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { message: "Failed to delete transaction" },
      { status: 500 }
    );
  }
}
