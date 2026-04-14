import { NextResponse } from "next/server";
import { db } from "@pos/db";

// PATCH /api/transactions/[id]
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const { salesName, customerName, paymentMethod, status } = body;

    // Validate status if provided
    const allowedStatuses = ["COMPLETED", "DP", "VOIDED", "REFUNDED"];
    if (status && !allowedStatuses.includes(status)) {
      return NextResponse.json(
        { message: `Status tidak valid. Gunakan: ${allowedStatuses.join(", ")}` },
        { status: 400 }
      );
    }

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
    await db.$transaction(async (tx) => {
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
