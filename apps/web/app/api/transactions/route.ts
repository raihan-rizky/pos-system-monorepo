import { NextResponse } from "next/server";
import { db } from "@pos/db";

export const dynamic = 'force-dynamic';

// GET /api/transactions
export async function GET() {
  try {
    const transactions = await db.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
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
        cashier: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json(transactions);
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
    return NextResponse.json(
      { message: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

// POST /api/transactions - Create new transaction with stock deduction
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { items, paymentMethod, amountPaid, discount = 0, note, customerName } = body;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { message: "Cart is empty" },
        { status: 400 }
      );
    }

    // Calculate totals
    const subtotal = items.reduce(
      (sum: number, item: { price: number; quantity: number }) =>
        sum + item.price * item.quantity,
      0
    );
    const total = subtotal - discount;
    const change = amountPaid - total;

    if (amountPaid < total) {
      return NextResponse.json(
        { message: "Pembayaran kurang" },
        { status: 400 }
      );
    }

    // Generate invoice number
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const count = await db.transaction.count({
      where: {
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
    });
    const invoiceNumber = `INV-${dateStr}-${String(count + 1).padStart(4, "0")}`;

    // Create transaction with items and deduct stock (in a transaction)
    const transaction = await db.$transaction(async (tx) => {
      // Create transaction
      const txn = await tx.transaction.create({
        data: {
          invoiceNumber,
          storeId: "store-main",
          cashierId: body.cashierId || "user-kasir1", // Default to Kasir 1 (will use auth later)
          subtotal,
          discount,
          tax: 0,
          total,
          paymentMethod: paymentMethod || "CASH",
          amountPaid,
          change,
          note: note || null,
          customerName: customerName || null,
          items: {
            create: items.map(
              (item: {
                productId: string;
                name: string;
                size?: string;
                material?: string;
                price: number;
                quantity: number;
              }) => ({
                productId: item.productId,
                productName: item.name,
                size: item.size || null,
                material: item.material || null,
                quantity: item.quantity,
                unitPrice: item.price,
                discount: 0,
                subtotal: item.price * item.quantity,
              })
            ),
          },
        },
        include: {
          items: true,
        },
      });

      // Deduct stock for each item
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { decrement: item.quantity },
          },
        });

        // Log inventory change
        await tx.inventoryLog.create({
          data: {
            productId: item.productId,
            type: "OUT",
            quantity: item.quantity,
            note: `Penjualan ${invoiceNumber}`,
          },
        });
      }

      return txn;
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error("Failed to create transaction:", error);
    return NextResponse.json(
      { message: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
