import { NextResponse } from "next/server";
import { db } from "@pos/db";

export const dynamic = 'force-dynamic';

// GET /api/transactions
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const categoryId = searchParams.get("categoryId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10", 10)));

    // Build where clause
    const where: any = {};
    const andConditions: any[] = [];

    // Search filter (invoice, customer name, product name)
    if (search) {
      andConditions.push({
        OR: [
          { invoiceNumber: { contains: search, mode: "insensitive" } },
          { customerName: { contains: search, mode: "insensitive" } },
          { items: { some: { productName: { contains: search, mode: "insensitive" } } } },
        ],
      });
    }

    // Date range filter
    if (dateFrom || dateTo) {
      const createdAtFilter: any = {};
      if (dateFrom) {
        const [year, month, day] = dateFrom.split("-");
        createdAtFilter.gte = new Date(Number(year), Number(month) - 1, Number(day));
      }
      if (dateTo) {
        // Include the entire "dateTo" day in local time
        const [year, month, day] = dateTo.split("-");
        const end = new Date(Number(year), Number(month) - 1, Number(day));
        end.setDate(end.getDate() + 1);
        createdAtFilter.lt = end;
      }
      andConditions.push({ createdAt: createdAtFilter });
    }

    // Category filter (transactions containing products in this category)
    if (categoryId) {
      andConditions.push({
        items: { some: { product: { categoryId } } },
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    // Get total count for pagination
    const total = await db.transaction.count({ where });

    const transactions = await db.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
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

    return NextResponse.json({
      data: transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
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
    const {
      items,
      paymentMethod,
      amountPaid,
      discount = 0,
      note,
      customerName,
      customerId,
      salesName,
      salespersonId,
      paymentStatus = "COMPLETED",
      isJobOrder = false,
      estimatedDoneAt,
    } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ message: "Cart is empty" }, { status: 400 });
    }

    // Calculate totals
    const subtotal = items.reduce(
      (sum: number, item: { price: number; quantity: number }) =>
        sum + item.price * item.quantity,
      0
    );
    const total = subtotal - discount;

    // For DP (down payment), allow partial payment.
    const isDP = paymentStatus === "DP";
    const change = isDP ? 0 : amountPaid - total;

    if (!isDP && amountPaid < total) {
      return NextResponse.json({ message: "Pembayaran kurang" }, { status: 400 });
    }

    if (isDP && amountPaid <= 0) {
      return NextResponse.json(
        { message: "Jumlah DP harus lebih dari 0" },
        { status: 400 }
      );
    }

    // Invoice number is generated INSIDE the DB transaction so the count
    // and insert are atomic. We retry up to 5 times on a uniqueness collision
    // (Prisma P2002) by incrementing the daily sequence suffix.
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const MAX_ATTEMPTS = 5;
    let transaction: any = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        transaction = await db.$transaction(async (tx: any) => {
          // Count today's transactions to build the sequence number.
          // Running inside the transaction gives us a consistent snapshot.
          const count = await tx.transaction.count({
            where: { createdAt: { gte: dayStart } },
          });
          const invoiceNumber = `INV-${dateStr}-${String(count + 1 + attempt).padStart(4, "0")}`;

          const txn = await tx.transaction.create({
            data: {
              invoiceNumber,
              storeId: "store-main",
              cashierId: body.cashierId || "user-kasir1",
              customerId: customerId || null,
              subtotal,
              discount,
              tax: 0,
              total,
              paymentMethod: paymentMethod || "CASH",
              amountPaid,
              change,
              status: isDP ? "DP" : "COMPLETED",
              note: note || null,
              customerName: customerName || null,
              salesName: salesName || null,
              salespersonId: salespersonId || null,
              isJobOrder,
              productionStatus: isJobOrder ? "PENDING" : null,
              estimatedDoneAt: estimatedDoneAt ? new Date(estimatedDoneAt) : null,
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
            include: { items: true },
          });

          // Deduct stock for each item
          for (const item of items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { decrement: item.quantity } },
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

          // Update customer analytics atomically
          if (customerId) {
            const debtIncrement = isDP ? total - amountPaid : 0;
            await tx.customer.update({
              where: { id: customerId },
              data: {
                totalSpent: { increment: amountPaid },
                totalOrders: { increment: 1 },
                totalDebt: debtIncrement > 0 ? { increment: debtIncrement } : undefined,
                lastVisitAt: new Date(),
              },
            });
          }

          return txn;
        });

        // Transaction succeeded — break out of retry loop
        break;
      } catch (err: any) {
        // P2002 = unique constraint violation on invoiceNumber — retry
        if (err?.code === "P2002" && attempt < MAX_ATTEMPTS - 1) {
          console.warn(
            `Invoice number collision on attempt ${attempt + 1}, retrying…`
          );
          continue;
        }
        throw err; // non-recoverable error or max retries exceeded
      }
    }

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error("Failed to create transaction:", error);
    return NextResponse.json(
      { message: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
