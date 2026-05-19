import { NextResponse } from "next/server";
import { after } from "next/server";
import { db, Prisma } from "@pos/db";
import { requirePermission, requireRole, AuthError, handleAuthError } from "@/lib/rbac/guard";
import { canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import type { Role } from "@/lib/rbac/permissions";
import { z } from "zod";
import { apiList, buildPaginationMeta, parsePagination } from "@/lib/api/responses";

import { getLogger } from "@/lib/logger";
import { buildStockDecrementParams } from "@/features/pos-checkout/stock-decrement";
import {
  buildCustomerUpdateArgs,
  buildInventoryLogRows,
} from "@/features/pos-checkout/post-commit";

const log = getLogger("api:transactions");
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
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 10,
      maxLimit: 100,
    });

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
      skip,
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

    return apiList(transactions, buildPaginationMeta(total, page, limit));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch transactions:", error);
    return NextResponse.json(
      { message: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

// POST /api/transactions - Create new transaction with stock deduction
export async function POST(request: Request) {
  try {
    // SALES role uses "transaction.request" resource; others use "transaction"
    const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES");
    const permissions = await getGlobalRolePermissions();
    const resource = user.role === "SALES" ? "transaction.request" : "transaction";
    if (!canRolePerformAction(user.role as Role, resource, "create", permissions)) {
      throw new AuthError(403, "Insufficient permissions");
    }
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
      return NextResponse.json({ message: "Cart is empty" }, { status: 422 });
    }

    // Parallel pre-validation: run independent lookups concurrently
    const uniqueProductIds = [...new Set(items.map((item) => item.productId))];

    // Compute the day window once so the daily-count query can join the
    // pre-validation parallel batch instead of running serially inside the
    // interactive transaction below. The retry loop on P2002 already covers
    // the rare race where two cashiers read the same count.
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [customerCheck, salespersonCheck, products, todayCount] = await Promise.all([
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
      db.transaction.count({
        where: { storeId, createdAt: { gte: dayStart } },
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
        return NextResponse.json({ message: "Pembayaran kurang" }, { status: 422 });
      }

      if (isDP && amountPaid <= 0) {
        return NextResponse.json(
          { message: "Jumlah DP harus lebih dari 0" },
          { status: 422 }
        );
      }
    }

    // Invoice number sequence is computed from the pre-fetched daily count.
    // We retry up to 5 times on a uniqueness collision (Prisma P2002) by
    // incrementing the suffix — cheap, and avoids holding the locked
    // interactive transaction open for an extra COUNT round-trip.
    const MAX_ATTEMPTS = 5;
    let transaction: any = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        transaction = await db.$transaction(async (tx: TxClient) => {
          const invoiceNumber = `INV-${dateStr}-${String(
            todayCount + 1 + attempt,
          ).padStart(4, "0")}`;

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
              productionStatus: isJobOrder ? "PRINTING" : null,
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
            // Batched stock decrement: a single UPDATE ... FROM (VALUES ...)
            // round-trip instead of N sequential updateMany calls. The
            // RETURNING clause lets us count matched rows so we can detect
            // insufficient stock without an extra read.
            const { values, expectedRowCount } = buildStockDecrementParams(
              serverItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
              storeId,
            );

            if (expectedRowCount > 0) {
              // unnest(text[], float8[]) gives Postgres the column types
              // up front, which a parameterized VALUES list cannot. This
              // is the standard pattern for batched Prisma raw upserts.
              const productIds = values.map(([id]) => id);
              const quantities = values.map(([, qty]) => qty);
              const updated = await tx.$queryRaw<Array<{ id: string }>>`
                UPDATE pos_products AS p
                SET stock = p.stock - v.qty
                FROM unnest(${productIds}::text[], ${quantities}::float8[])
                  AS v(id, qty)
                WHERE p.id = v.id
                  AND p."storeId" = ${storeId}
                  AND p.stock >= v.qty
                RETURNING p.id
              `;

              if (updated.length !== expectedRowCount) {
                // Either a row was missing (caught by pre-validation) or
                // its current stock fell below the requested quantity
                // between read and write. Treat both as insufficient stock
                // — the interactive transaction will roll back cleanly.
                throw new Error("INSUFFICIENT_STOCK");
              }
            }
            // Inventory logs are an audit trail — they are written *after*
            // the response (see `after()` below) so they don't extend the
            // cashier's wait time.
          }

          // Customer analytics are also written post-response (see
          // `after()` below). They're additive counters / a debt increment
          // that don't gate the receipt and don't need to share the txn.

          return txn;
        },
        {
          maxWait: 5000, // 5 seconds max wait to connect
          timeout: 15000, // 15 seconds timeout for the entire transaction
        });

        // Transaction succeeded â€” break out of retry loop
        break;
      } catch (err: any) {
        // P2002 = unique constraint violation on invoiceNumber â€” retry
        if (err?.code === "P2002" && attempt < MAX_ATTEMPTS - 1) {
          log.warn(
            `Invoice number collision on attempt ${attempt + 1}, retryingâ€¦`
          );
          continue;
        }
        throw err; // non-recoverable error or max retries exceeded
      }
    }

    // Schedule audit log + customer analytics writes to run AFTER the
    // response is sent. The cashier already has the receipt; these are
    // additive bookkeeping that doesn't need to gate UI latency.
    if (transaction && !isSalesRequest) {
      const invoiceNumber = transaction.invoiceNumber as string;
      const inventoryRows = buildInventoryLogRows({
        items: serverItems,
        invoiceNumber,
        userId: user.id,
        userName: user.name ?? null,
      });
      const customerArgs = buildCustomerUpdateArgs({
        customerId: customerId || null,
        isDP,
        total,
        amountPaid: amountPaidComputed,
      });

      after(async () => {
        try {
          await Promise.all([
            inventoryRows.length > 0
              ? db.inventoryLog.createMany({ data: inventoryRows })
              : Promise.resolve(),
            customerArgs ? db.customer.update(customerArgs) : Promise.resolve(),
          ]);
        } catch (sideEffectError) {
          // Log only — the transaction itself is already committed and the
          // cashier has been told the sale succeeded.
          log.error(
            `Post-commit side effects failed for ${invoiceNumber}:`,
            sideEffectError,
          );
        }
      });
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

    log.error("Failed to create transaction:", error);
    return NextResponse.json(
      { message: "Failed to create transaction" },
      { status: 500 }
    );
  }
}


