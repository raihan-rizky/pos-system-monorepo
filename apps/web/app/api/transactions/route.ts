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
import {
  buildCustomerUpdateArgs,
  buildInventoryLogRows,
  buildServiceMaterialInventoryLogRows,
} from "@/features/pos-checkout/post-commit";
import {
  applyProductStockDeltas,
  StockMutationError,
} from "@/features/product-stock-groups/stock-mutations";
import { fetchTransactionsAndCount } from "@/features/transaction-history/helpers/fetch-transactions";
import {
  priceProductForCustomerType,
  resolveCustomPricedLine,
  type AppliedCategoryPricing,
  type CategoryPricingRule,
  CUSTOMER_TYPES,
  type CustomerType,
} from "@/features/customer-category-pricing/helpers/pricing-rules";

const log = getLogger("api:transactions");
const productTransactionItemSchema = z.object({
  lineType: z.literal("PRODUCT").optional().default("PRODUCT"),
  productId: z.string().min(1),
  name: z.string().optional(),
  size: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  price: z.number().min(0).optional(),
  quantity: z.number().int().min(1),
});

const printingServiceTransactionItemSchema = z
  .object({
    lineType: z.literal("PRINTING_SERVICE"),
    printingServiceId: z.string().min(1),
    name: z.string().optional(),
    size: z.string().optional().nullable(),
    material: z.string().optional().nullable(),
    serviceNote: z.string().optional().nullable(),
    price: z.number().min(0),
    quantity: z.number().int().min(1),
    needsMaterial: z.boolean().optional().default(false),
    rawMaterialProductId: z.string().optional().nullable(),
    rawMaterialQuantity: z.number().positive().optional().nullable(),
  })
  .superRefine((item, ctx) => {
    if (!item.needsMaterial) return;

    if (!item.rawMaterialProductId) {
      ctx.addIssue({
        code: "custom",
        path: ["rawMaterialProductId"],
        message: "Raw material is required when service needs material",
      });
    }
    if (!item.rawMaterialQuantity) {
      ctx.addIssue({
        code: "custom",
        path: ["rawMaterialQuantity"],
        message: "Raw material quantity is required when service needs material",
      });
    }
  });

const transactionItemSchema = z.union([
  printingServiceTransactionItemSchema,
  productTransactionItemSchema,
]);

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
  payments: z.array(z.object({
    method: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]),
    amount: z.number().min(0),
  })).optional(),
});

type DateTimeFilter = { gte?: Date; lt?: Date };
type TxClient = Prisma.TransactionClient;
type ServerProductTransactionItem = {
  lineType: "PRODUCT";
  productId: string;
  name: string;
  size: string | null;
  material: string | null;
  price: number;
  originalPrice: number;
  costPrice: number | null;
  quantity: number;
  appliedPricing: AppliedCategoryPricing | null;
};
type ServerPrintingServiceTransactionItem = {
  lineType: "PRINTING_SERVICE";
  printingServiceId: string;
  rawMaterialProductId: string | null;
  name: string;
  size: string | null;
  material: string | null;
  serviceNote: string | null;
  price: number;
  quantity: number;
  rawMaterialQuantity: number | null;
  rawMaterialUnit: string | null;
  rawMaterialCostPrice: number | null;
};
type ServerTransactionItem =
  | ServerProductTransactionItem
  | ServerPrintingServiceTransactionItem;

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
    const status = searchParams.get("status");
    const salespersonId = searchParams.get("salespersonId");
    const suratJalan = searchParams.get("suratJalan");
    const customerType = searchParams.get("customerType");
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

    // Status filter. The history "Pending" tab also tracks regular invoices
    // submitted by SALES, while keeping their payment status printable as
    // COMPLETED/DP.
    if (status === "PENDING_APPROVAL") {
      andConditions.push({
        OR: [
          { status: "PENDING_APPROVAL" },
          {
            requestedById: { not: null },
            status: { in: ["COMPLETED", "DP"] },
          },
        ],
      });
    } else if (status === "DEBT_HISTORY") {
      andConditions.push({
        OR: [
          { status: "DP" },
          {
            status: "COMPLETED",
            debtPaymentLogs: { some: {} },
          },
        ],
      });
    } else if (status === "DEBT_HISTORY_COMPLETED") {
      andConditions.push({
        status: "COMPLETED",
        debtPaymentLogs: { some: {} },
      });
    } else if (status) {
      andConditions.push({ status: status as Prisma.EnumTransactionStatusFilter["equals"] });
    }

    // Salesperson filter
    if (salespersonId) {
      andConditions.push({ salespersonId });
    }

    if (suratJalan === "bundled") {
      andConditions.push({ suratJalan: { some: {} } });
    }

    if (customerType && CUSTOMER_TYPES.includes(customerType as CustomerType)) {
      if (customerType === "UMUM") {
        andConditions.push({
          OR: [{ customer: { type: "UMUM" } }, { customerId: null }],
        });
      } else {
        andConditions.push({ customer: { type: customerType as CustomerType } });
      }
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    // Run count + findMany in parallel — they're fully independent and the
    // serial version paid full latency twice on every history poll.
    const { items: transactions, total } = await fetchTransactionsAndCount({
      count: () => db.transaction.count({ where }),
      findMany: () =>
        db.transaction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            items: {
              select: {
                id: true,
                productId: true,
                printingServiceId: true,
                rawMaterialProductId: true,
                productName: true,
                size: true,
                material: true,
                serviceNote: true,
                rawMaterialQuantity: true,
                rawMaterialUnit: true,
                quantity: true,
                unitPrice: true,
                pricingRuleId: true,
                pricingCustomerType: true,
                pricingCategoryId: true,
                pricingCategoryName: true,
                pricingMode: true,
                pricingValue: true,
                originalUnitPrice: true,
                appliedUnitPrice: true,
                subtotal: true,
                product: { select: { unit: true } },
                printingService: { select: { unit: true } },
              },
            },
            suratJalan: {
              select: {
                id: true,
                status: true,
                items: {
                  select: {
                    quantity: true,
                  },
                },
              },
            },
            cashier: {
              select: { name: true },
            },
            salesperson: {
              select: { name: true },
            },
            payments: {
              select: { amount: true, method: true },
            },
            debtPaymentLogs: {
              select: { id: true, createdAt: true, amount: true, paymentMethod: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        }),
    });
    const transactionsWithSuratJalanSummary = transactions.map((transaction) => {
      const totalQuantity = transaction.items
        .filter((item) => item.productId)
        .reduce((sum, item) => sum + item.quantity, 0);
      const deliveredQuantity = transaction.suratJalan
        .filter((item) => item.status === "CONFIRMED")
        .flatMap((item) => item.items)
        .reduce((sum, item) => sum + Number(item.quantity), 0);
      const summary = {
        count: transaction.suratJalan.length,
        confirmedCount: transaction.suratJalan.filter(
          (item) => item.status === "CONFIRMED",
        ).length,
        pendingCount: transaction.suratJalan.filter(
          (item) => item.status === "PENDING",
        ).length,
        deliveredQuantity,
        totalQuantity,
      };

      const { suratJalan: _suratJalan, ...transactionPayload } = transaction;
      return { ...transactionPayload, suratJalanSummary: summary };
    });

    return apiList(
      transactionsWithSuratJalanSummary,
      buildPaginationMeta(total, page, limit),
    );
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
      payments: rawPayments,
    } = parsed.data;

    // Resolve payments array: use explicit payments or fall back to single paymentMethod
    const resolvedPayments = rawPayments && rawPayments.length > 0
      ? rawPayments
      : [{ method: paymentMethod, amount: amountPaid }];

    // Determine primary payment method (largest amount) for backward-compatible field
    const primaryPaymentMethod = resolvedPayments.reduce((primary, p) =>
      p.amount > primary.amount ? p : primary,
      resolvedPayments[0],
    ).method;

    if (items.length === 0) {
      return NextResponse.json({ message: "Cart is empty" }, { status: 422 });
    }

    // Parallel pre-validation: run independent lookups concurrently
    const productLineItems = items.filter(
      (item): item is z.infer<typeof productTransactionItemSchema> =>
        item.lineType === "PRODUCT",
    );
    const serviceLineItems = items.filter(
      (item): item is z.infer<typeof printingServiceTransactionItemSchema> =>
        item.lineType === "PRINTING_SERVICE",
    );
    const uniqueProductIds = [
      ...new Set([
        ...productLineItems.map((item) => item.productId),
        ...serviceLineItems
          .map((item) => item.rawMaterialProductId)
          .filter((id): id is string => Boolean(id)),
      ]),
    ];
    const uniquePrintingServiceIds = [
      ...new Set(serviceLineItems.map((item) => item.printingServiceId)),
    ];

    // Compute the day window once so the daily-count query can join the
    // pre-validation parallel batch instead of running serially inside the
    // interactive transaction below. The retry loop on P2002 already covers
    // the rare race where two cashiers read the same count.
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      customerCheck,
      salespersonCheck,
      products,
      printingServices,
      todayCount,
    ] = await Promise.all([
      customerId
        ? db.customer.findFirst({
            where: { id: customerId, storeId },
            select: { id: true, type: true },
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
        },
        select: {
          id: true,
          name: true,
          price: true,
          costPrice: true,
          hargaDinas: true,
          stock: true,
          unit: true,
          size: true,
          material: true,
          categoryId: true,
          category: { select: { name: true } },
        },
      }),
      uniquePrintingServiceIds.length > 0
        ? db.printingService.findMany({
            where: {
              id: { in: uniquePrintingServiceIds },
              storeId,
              isActive: true,
            },
            select: {
              id: true,
              name: true,
              basePrice: true,
              unit: true,
            },
          })
        : Promise.resolve([]),
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

    const printingServiceById = new Map(
      printingServices.map((service) => [service.id, service]),
    );

    if (printingServiceById.size !== uniquePrintingServiceIds.length) {
      return NextResponse.json(
        { message: "One or more printing services were not found" },
        { status: 404 }
      );
    }

    const checkoutCustomerType: CustomerType =
      customerId && customerCheck && customerCheck !== true
        ? (customerCheck.type as CustomerType)
        : "UMUM";
    const pricingRules = (await db.categoryCustomerPricingRule.findMany({
      where: { storeId, isActive: true },
      include: { category: { select: { name: true } } },
    })).map((rule) => ({
      id: rule.id,
      categoryId: rule.categoryId,
      categoryName: rule.category.name,
      customerType: rule.customerType as CustomerType,
      mode: rule.mode,
      value: Number(rule.value),
      isActive: rule.isActive,
    })) satisfies CategoryPricingRule[];

    const serverItems: ServerTransactionItem[] = items.map((item) => {
      if (item.lineType === "PRINTING_SERVICE") {
        const service = printingServiceById.get(item.printingServiceId);
        if (!service) {
          throw new Error("PRINTING_SERVICE_NOT_FOUND");
        }
        const rawMaterial = item.rawMaterialProductId
          ? productById.get(item.rawMaterialProductId)
          : null;

        return {
          lineType: "PRINTING_SERVICE",
          printingServiceId: service.id,
          rawMaterialProductId: rawMaterial?.id ?? null,
          name: service.name,
          size: item.size ?? null,
          material: item.material ?? rawMaterial?.name ?? null,
          serviceNote: item.serviceNote ?? null,
          price: item.price,
          quantity: item.quantity,
          rawMaterialQuantity: item.rawMaterialQuantity ?? null,
          rawMaterialUnit: rawMaterial?.unit ?? null,
          rawMaterialCostPrice: rawMaterial?.costPrice
            ? Number(rawMaterial.costPrice)
            : null,
        };
      }

      const product = productById.get(item.productId);
      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      return {
        lineType: "PRODUCT",
        productId: product.id,
        name: product.name,
        size: item.size ?? product.size ?? null,
        material: item.material ?? product.material ?? null,
        ...(() => {
          const priced = priceProductForCustomerType(
            {
              categoryId: product.categoryId,
              categoryName: product.category.name,
              price: Number(product.price),
              hargaDinas: product.hargaDinas == null ? null : Number(product.hargaDinas),
            },
            checkoutCustomerType,
            pricingRules,
          );
          const resolved = resolveCustomPricedLine({
            pricedLine: priced,
            submittedPrice: item.price,
            role: user.role,
            customerType: checkoutCustomerType,
          });
          return {
            price: resolved.unitPrice,
            originalPrice: Number(product.price),
            appliedPricing: resolved.appliedPricing,
          };
        })(),
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

    const amountPaidComputed = resolvedPayments.reduce((sum, p) => sum + p.amount, 0);
    const changeComputed = isDP ? 0 : amountPaidComputed - total;

    if (!isDP && amountPaidComputed < total) {
      return NextResponse.json(
        { message: `Pembayaran kurang dari total belanja (Total: Rp ${total.toLocaleString("id-ID")}, Terbayar: Rp ${amountPaidComputed.toLocaleString("id-ID")})` },
        { status: 422 }
      );
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
              paymentMethod: primaryPaymentMethod,
              amountPaid: amountPaidComputed,
              change: changeComputed,
              status: isDP ? "DP" : "COMPLETED",
              note: note || null,
              customerName: customerName || null,
              salesName: salesName || null,
              salespersonId: salespersonId || null,
              isJobOrder,
              productionStatus: isJobOrder ? "PRINTING" : null,
              estimatedDoneAt: estimatedDoneAt ? new Date(estimatedDoneAt) : null,
              items: {
                create: serverItems.map(
                  (item) =>
                    item.lineType === "PRINTING_SERVICE"
                      ? {
                          productId: null,
                          printingServiceId: item.printingServiceId,
                          rawMaterialProductId: item.rawMaterialProductId,
                          productName: item.name,
                          size: item.size || null,
                          material: item.material || null,
                          serviceNote: item.serviceNote,
                          rawMaterialQuantity: item.rawMaterialQuantity,
                          rawMaterialUnit: item.rawMaterialUnit,
                          quantity: item.quantity,
                          unitPrice: item.price,
                          unitCost: item.rawMaterialCostPrice,
                          discount: 0,
                          subtotal: item.price * item.quantity,
                        }
                      : {
                          productId: item.productId,
                          printingServiceId: null,
                          rawMaterialProductId: null,
                          productName: item.name,
                          size: item.size || null,
                          material: item.material || null,
                          serviceNote: null,
                          rawMaterialQuantity: null,
                          rawMaterialUnit: null,
                          quantity: item.quantity,
                          unitPrice: item.price,
                          unitCost: item.costPrice,
                          discount: 0,
                          subtotal: item.price * item.quantity,
                          pricingRuleId: item.appliedPricing?.ruleId ?? null,
                          pricingCustomerType: item.appliedPricing?.customerType ?? null,
                          pricingCategoryId: item.appliedPricing?.categoryId ?? null,
                          pricingCategoryName: item.appliedPricing?.categoryName ?? null,
                          pricingMode: item.appliedPricing?.mode ?? null,
                          pricingValue: item.appliedPricing?.value ?? null,
                          originalUnitPrice: item.appliedPricing?.originalUnitPrice ?? item.originalPrice,
                          appliedUnitPrice: item.appliedPricing?.appliedUnitPrice ?? item.price,
                        }
                ),
              },
              payments: {
                create: resolvedPayments.map((p) => ({
                  amount: p.amount,
                  method: p.method,
                })),
              },
            },
            include: { 
              items: {
                select: {
                  id: true,
                  productId: true,
                  printingServiceId: true,
                  rawMaterialProductId: true,
                  productName: true,
                  size: true,
                  material: true,
                  serviceNote: true,
                  rawMaterialQuantity: true,
                  rawMaterialUnit: true,
                  quantity: true,
                  unitPrice: true,
                  pricingRuleId: true,
                  pricingCustomerType: true,
                  pricingCategoryId: true,
                  pricingCategoryName: true,
                  pricingMode: true,
                  pricingValue: true,
                  originalUnitPrice: true,
                  appliedUnitPrice: true,
                  subtotal: true,
                  product: { select: { unit: true } },
                  printingService: { select: { unit: true } },
                },
              },
              salesperson: { select: { name: true } },
              payments: { select: { amount: true, method: true } },
            },
          });

          // Batched stock decrement: a single UPDATE ... FROM (VALUES ...)
          // round-trip instead of N sequential updateMany calls. The
          // RETURNING clause lets us count matched rows so we can detect
          // insufficient stock without an extra read.
          const stockDecrementItems = serverItems.flatMap((item) => {
            if (item.lineType === "PRINTING_SERVICE") {
              if (!item.rawMaterialProductId || !item.rawMaterialQuantity) {
                return [];
              }
              return [
                {
                  productId: item.rawMaterialProductId,
                  quantity: item.rawMaterialQuantity,
                },
              ];
            }

            return [
              {
                productId: item.productId,
                quantity: item.quantity,
              },
            ];
          });
          if (!isSalesRequest) {
            await applyProductStockDeltas(tx, {
              storeId,
              items: stockDecrementItems.map((item) => ({
                productId: item.productId,
                delta: -item.quantity,
              })),
            });
          }

          // Inventory logs are an audit trail — they are written *after*
          // the response (see `after()` below) so they don't extend the
          // cashier's wait time.
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
      const productInventoryRows = buildInventoryLogRows({
        items: serverItems.filter(
          (item): item is ServerProductTransactionItem =>
            item.lineType === "PRODUCT",
        ),
        invoiceNumber,
        userId: user.id,
        userName: user.name ?? null,
      });
      const serviceMaterialInventoryRows = buildServiceMaterialInventoryLogRows({
        items: serverItems.filter(
          (item): item is ServerPrintingServiceTransactionItem =>
            item.lineType === "PRINTING_SERVICE",
        ),
        invoiceNumber,
        userId: user.id,
        userName: user.name ?? null,
      });
      const inventoryRows = [
        ...productInventoryRows,
        ...serviceMaterialInventoryRows,
      ];
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

    if (
      error instanceof StockMutationError &&
      error.message === "INSUFFICIENT_STOCK"
    ) {
      return NextResponse.json(
        { message: "Stok produk tidak mencukupi" },
        { status: 409 }
      );
    }
    if (
      error instanceof StockMutationError &&
      error.message === "CONVERSION_NEEDS_REVIEW"
    ) {
      return NextResponse.json(
        { message: "Konversi unit produk perlu direview sebelum stok bisa diproses" },
        { status: 422 },
      );
    }

    log.error("Failed to create transaction:", error);
    return NextResponse.json(
      { message: "Failed to create transaction" },
      { status: 500 }
    );
  }
}





