import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { z } from "zod";

const transactionItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  size: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  price: z.number().min(0),
  quantity: z.number().min(1),
});

const createTransactionSchema = z.object({
  items: z.array(transactionItemSchema).min(1, "Cart is empty"),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]).optional().default("CASH"),
  amountPaid: z.number().min(0),
  discount: z.number().min(0).optional().default(0),
  note: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  salesName: z.string().optional().nullable(),
  salespersonId: z.string().optional().nullable(),
  cashierId: z.string().optional().nullable(),
  paymentStatus: z.enum(["COMPLETED", "DP"]).optional().default("COMPLETED"),
  isJobOrder: z.boolean().optional().default(false),
  estimatedDoneAt: z.string().optional().nullable(),
});

type DateTimeFilter = { gte?: Date; lt?: Date };
type TxClient = Prisma.TransactionClient;
type ServerTransactionItem = {
  productId: string;
  name: string;
  size: string | null;
  material: string | null;
  price: number;
  costPrice: number | null;
  quantity: number;
};

export const dynamic = 'force-dynamic';

// GET /api/transactions
export async function GET(request: Request) {
  try {
    const user = await requirePermission("transaction", "read");
    const storeId = user.storeId || "store-main";

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const categoryId = searchParams.get("categoryId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10", 10)));

    // Build where clause
    const where: Prisma.TransactionWhereInput = {
      storeId,
    };
    const andConditions: Prisma.TransactionWhereInput[] = [];

    // Search filter (invoice, customer name, product name)
    if (search) {
      andConditions.push({
        OR: [
          { invoiceNumber: { contains: search, mode: "insensitive" } },
          { customerName: { contains: search, mode: "insensitive" } },
          { salesName: { contains: search, mode: "insensitive" } },
          { salesperson: { name: { contains: search, mode: "insensitive" } } },
          { items: { some: { productName: { contains: search, mode: "insensitive" } } } },
        ],
      });
    }

    // Date range filter
    if (dateFrom || dateTo) {
      const createdAtFilter: DateTimeFilter = {};
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
        salesperson: {
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
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

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
    const user = await requirePermission("transaction", "create");
    const storeId = user.storeId || "store-main";


    const body = await request.json();
    const parsed = createTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const {
      items,
      paymentMethod,
      amountPaid,
      discount,
      note,
      customerName,
      customerId,
      salesName,
      salespersonId,
      paymentStatus,
      isJobOrder,
      estimatedDoneAt,
    } = parsed.data;

    if (items.length === 0) {
      return NextResponse.json({ message: "Cart is empty" }, { status: 400 });
    }

    // Parallel pre-validation: run independent lookups concurrently
    const uniqueProductIds = [...new Set(items.map((item) => item.productId))];

    const [customerCheck, salespersonCheck, products] = await Promise.all([
      customerId
        ? db.customer.findFirst({
            where: { id: customerId, storeId },
            select: { id: true },
          })
        : Promise.resolve(true), // no customer to validate
      salespersonId
        ? db.salesperson.findFirst({
            where: { id: salespersonId, storeId },
            select: { id: true },
          })
        : Promise.resolve(true), // no salesperson to validate
      db.product.findMany({
        where: {
          id: { in: uniqueProductIds },
          storeId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          price: true,
          costPrice: true,
          size: true,
          material: true,
        },
      }),
    ]);

    if (customerId && !customerCheck) {
      return NextResponse.json({ message: "Customer not found" }, { status: 404 });
    }
    if (salespersonId && !salespersonCheck) {
      return NextResponse.json({ message: "Salesperson not found" }, { status: 404 });
    }

    const productById = new Map(products.map((product) => [product.id, product]));

    if (productById.size !== uniqueProductIds.length) {
      return NextResponse.json(
        { message: "One or more products were not found" },
        { status: 404 }
      );
    }

    const serverItems: ServerTransactionItem[] = items.map((item) => {
      const product = productById.get(item.productId);
      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      return {
        productId: product.id,
        name: product.name,
        size: product.size ?? item.size ?? null,
        material: product.material ?? item.material ?? null,
        price: Number(product.price),
        costPrice: product.costPrice ? Number(product.costPrice) : null,
        quantity: item.quantity,
      };
    });

    // Calculate totals
    const subtotal = serverItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const total = Math.max(0, subtotal - discount);

    const isDP = paymentStatus === "DP";
    const isSalesRequest = user.role === "SALES";

    // Wait, SALES role doesn't handle payment
    let amountPaidComputed = amountPaid;
    let changeComputed = 0;
    
    if (isSalesRequest) {
      amountPaidComputed = 0;
      changeComputed = 0;
    } else {
      changeComputed = isDP ? 0 : amountPaid - total;

      if (!isDP && amountPaid < total) {
        return NextResponse.json({ message: "Pembayaran kurang" }, { status: 400 });
      }

      if (isDP && amountPaid <= 0) {
        return NextResponse.json(
          { message: "Jumlah DP harus lebih dari 0" },
          { status: 400 }
        );
      }
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
        transaction = await db.$transaction(async (tx: TxClient) => {
          // Count today's transactions to build the sequence number.
          // Running inside the transaction gives us a consistent snapshot.
          const count = await tx.transaction.count({
            where: { storeId, createdAt: { gte: dayStart } },
          });
          const invoiceNumber = `INV-${dateStr}-${String(count + 1 + attempt).padStart(4, "0")}`;

          const txn = await tx.transaction.create({
            data: {
              invoiceNumber,
              storeId,
              cashierId: isSalesRequest ? null : user.id,
              requestedById: isSalesRequest ? user.id : null,
              customerId: customerId || null,
              subtotal,
              discount,
              tax: 0,
              total,
              paymentMethod: paymentMethod,
              amountPaid: amountPaidComputed,
              change: changeComputed,
              status: isSalesRequest ? "PENDING_APPROVAL" : (isDP ? "DP" : "COMPLETED"),
              note: note || null,
              customerName: customerName || null,
              salesName: salesName || null,
              salespersonId: salespersonId || null,
              isJobOrder,
              productionStatus: isJobOrder ? "PENDING" : null,
              estimatedDoneAt: estimatedDoneAt ? new Date(estimatedDoneAt) : null,
              items: {
                create: serverItems.map(
                  (item) => ({
                    productId: item.productId,
                    productName: item.name,
                    size: item.size || null,
                    material: item.material || null,
                    quantity: item.quantity,
                    unitPrice: item.price,
                    unitCost: item.costPrice,
                    discount: 0,
                    subtotal: item.price * item.quantity,
                  })
                ),
              },
            },
            include: { 
              items: true,
              salesperson: { select: { name: true } }
            },
          });

          // Deduct stock for each item only if it's not a sales request
          if (!isSalesRequest) {
            const stockUpdates = await Promise.all(
              serverItems.map((item) =>
                tx.product.updateMany({
                  where: {
                    id: item.productId,
                    storeId,
                    stock: { gte: item.quantity },
                  },
                  data: { stock: { decrement: item.quantity } },
                })
              )
            );

            if (stockUpdates.some((result) => result.count !== 1)) {
              throw new Error("INSUFFICIENT_STOCK");
            }

            await tx.inventoryLog.createMany({
              data: serverItems.map((item) => ({
                productId: item.productId,
                type: "OUT",
                quantity: item.quantity,
                note: `Penjualan ${invoiceNumber}`,
                createdBy: user.id,
              })),
            });
          }

          // Update customer analytics atomically (skip if it's a sales request since payment is pending)
          if (customerId && !isSalesRequest) {
            const debtIncrement = isDP ? total - amountPaidComputed : 0;
            await tx.customer.update({
              where: { id: customerId },
              data: {
                totalSpent: { increment: amountPaidComputed },
                totalOrders: { increment: 1 },
                totalDebt: debtIncrement > 0 ? { increment: debtIncrement } : undefined,
                lastVisitAt: new Date(),
              },
            });
          }

          return txn;
        },
        {
          maxWait: 5000, // 5 seconds max wait to connect
          timeout: 15000, // 15 seconds timeout for the entire transaction
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
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json(
        { message: "Stok produk tidak mencukupi" },
        { status: 409 }
      );
    }

    console.error("Failed to create transaction:", error);
    return NextResponse.json(
      { message: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
