import { roundSellingPriceLine } from "@/features/product-price-rounding/rounding";
import { getPriceRoundingSettings } from "@/features/product-price-rounding/server/rounding-settings";
import { discountedLineSubtotal } from "@/features/pos-checkout/helpers/item-discount";
import { PRINTING_SUBCATEGORIES } from "@/features/printing-receipts/types";
import { loadProductBaseCosts } from "@/features/customer-category-pricing/helpers/base-cost";
import { calculateTransactionTax } from "@/features/transaction-tax/helpers/tax-calculation";
import { getInvoiceNow } from "@/features/invoice-date/services/internet-clock";
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
import { sendRolePushEvent } from "@/lib/push-events";
import {
  compactJakartaDateKey,
  jakartaDateKey,
  requiresInvoiceDateReason,
  resolveInvoiceDateTime,
} from "@/features/invoice-date/helpers/invoice-date-core";
import {
  buildCustomerUpdateArgs,
  buildInventoryLogRows,
  buildServiceMaterialInventoryLogRows,
} from "@/features/pos-checkout/post-commit";
import { buildTransactionStockJournal } from "@/features/transactions-stock/helpers/transaction-stock-journal";
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
  PRICING_PREFERENCES,
  type CustomerType,
} from "@/features/customer-category-pricing/helpers/pricing-rules";
import { assertTempoCustomer } from "@/features/customer-debt/helpers/payment-terms";
import {
  getPrintingReceiptCheckoutLines,
  MAX_PRINTING_RECEIPT_AMOUNT,
  parsePrintingReceiptDocument,
  PrintingReceiptValidationError,
} from "@/features/printing-receipts/domain";
import {
  assertPrintingReceiptStockUnits,
  PrintingReceiptStockChangedError,
} from "@/features/printing-receipts/server/stock-validation";

class PrintingReceiptCheckoutConflict extends Error {}

const receiptTransactionInclude = {
  items: { include: { product: { select: { unit: true } }, printingService: { select: { unit: true } } } },
  salesperson: { select: { name: true } },
  payments: { select: { amount: true, method: true } },
  printingReceipt: { select: { id: true, number: true, subcategory: true } },
} satisfies Prisma.TransactionInclude;

const log = getLogger("api:transactions");
const productTransactionItemSchema = z.object({
  lineType: z.literal("PRODUCT").optional().default("PRODUCT"),
  productId: z.string().min(1),
  name: z.string().optional(),
  size: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  price: z.number().min(0).optional(),
  quantity: z.number().int().min(1),
  discount: z.number().min(0).multipleOf(0.01).optional().default(0),
});

const printingServiceTransactionItemSchema = z
  .object({
    lineType: z.literal("PRINTING_SERVICE"),
    printingServiceId: z.string().min(1).nullable(),
    name: z.string().optional(),
    size: z.string().optional().nullable(),
    material: z.string().optional().nullable(),
    serviceNote: z.string().optional().nullable(),
    price: z.number().min(0),
    quantity: z.number().int().min(1),
    discount: z.number().min(0).multipleOf(0.01).optional().default(0),
    needsMaterial: z.boolean().optional().default(false),
    rawMaterialProductId: z.string().optional().nullable(),
    rawMaterialQuantity: z.number().positive().optional().nullable(),
    rawMaterialUnit: z.string().optional().nullable(),
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
  taxRate: z.number().min(0).max(100).multipleOf(0.01).optional().default(0),
  items: z.array(transactionItemSchema).min(1, "Cart is empty"),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER", "TEMPO"]).optional().default("CASH"),
  amountPaid: z.number().min(0),
  discount: z.number().min(0).optional().default(0),
  note: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  pricingPreference: z.enum(PRICING_PREFERENCES).optional().default("SPECIAL"),
  priceRoundingSettings: z.object({
    enabled: z.boolean(),
    increment: z.number().int().min(1).max(1_000_000_000),
    threshold: z.number().int().min(0),
  }).refine(settings => settings.threshold <= settings.increment, { path: ["threshold"] }).optional(),
  salesName: z.string().optional().nullable(),
  salespersonId: z.string().optional().nullable(),
  cashierId: z.string().optional().nullable(),
  paymentStatus: z.enum(["COMPLETED", "DP"]).optional().default("COMPLETED"),
  isJobOrder: z.boolean().optional().default(false),
  estimatedDoneAt: z.string().optional().nullable(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  invoiceTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional().nullable(),
  invoiceDateReason: z.string().optional().nullable(),
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
  discount: number;
  originalPrice: number;
  costPrice: number | null;
  quantity: number;
  appliedPricing: AppliedCategoryPricing | null;
};
type ServerPrintingServiceTransactionItem = {
  lineType: "PRINTING_SERVICE";
  printingServiceId: string | null;
  rawMaterialProductId: string | null;
  name: string;
  size: string | null;
  material: string | null;
  serviceNote: string | null;
  price: number;
  discount: number;
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
    const transactionCategory = searchParams.get("transactionCategory");
    const printingSubcategory = searchParams.get("printingSubcategory");
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
          { printingReceipt: { is: { number: { contains: search, mode: "insensitive" } } } },
          { customerName: { contains: search, mode: "insensitive" } },
          { salesName: { contains: search, mode: "insensitive" } },
          { salesperson: { name: { contains: search, mode: "insensitive" } } },
          { items: { some: { productName: { contains: search, mode: "insensitive" } } } },
        ],
      });
    }

    // Date range filter
    if (dateFrom || dateTo) {
      const invoiceDateFilter: DateTimeFilter = {};
      if (dateFrom) {
        invoiceDateFilter.gte = new Date(`${dateFrom}T00:00:00+07:00`);
      }
      if (dateTo) {
        // Include the entire "dateTo" day in Jakarta business time.
        const end = new Date(`${dateTo}T00:00:00+07:00`);
        end.setDate(end.getDate() + 1);
        invoiceDateFilter.lt = end;
      }
      andConditions.push({ invoiceDate: invoiceDateFilter });
    }

    if (transactionCategory === "ATK") {
      andConditions.push({
        OR: [{ transactionCategory: "ATK" }, { transactionCategory: null }],
        printingReceipt: { is: null },
        items: { none: { printingServiceId: { not: null } } },
      });
      if (categoryId) andConditions.push({ items: { some: { product: { categoryId } } } });
    } else if (transactionCategory === "PERCETAKAN") {
      andConditions.push({
        OR: [
          { transactionCategory: "PERCETAKAN" },
          { printingReceipt: { isNot: null } },
          { items: { some: { printingServiceId: { not: null } } } },
        ],
      });
      if (printingSubcategory && PRINTING_SUBCATEGORIES.includes(printingSubcategory as (typeof PRINTING_SUBCATEGORIES)[number])) {
        andConditions.push({ printingSubcategory });
      }
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
            OR: [
              { paymentMethod: "TEMPO" },
              { debtPaymentLogs: { some: {} } },
            ],
          },
        ],
      });
    } else if (status === "DEBT_HISTORY_COMPLETED") {
      andConditions.push({
        status: "COMPLETED",
        OR: [
          { paymentMethod: "TEMPO" },
          { debtPaymentLogs: { some: {} } },
        ],
      });
    } else if (status === "DEBT_HISTORY_ACTIVE") {
      andConditions.push({
        OR: [
          { status: "DP" },
          {
            status: "COMPLETED",
            paymentMethod: "TEMPO",
            amountPaid: { lt: db.transaction.fields.total },
          },
        ],
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
          orderBy: { invoiceDate: "desc" },
          skip,
          take: limit,
          include: {
            printingReceipt: { select: { id: true, subcategory: true, number: true } },
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
                discount: true,
                pricingRuleId: true,
                pricingCustomerType: true,
                pricingCategoryId: true,
                pricingCategoryName: true,
                pricingMode: true,
                pricingValue: true,
                pricingDiscountPercent: true,
                pricingUnit: true,
                pricingBrandId: true,
                pricingBrandName: true,
                originalUnitPrice: true,
                appliedUnitPrice: true,
                subtotal: true,
                product: {
                  select: {
                    unit: true,
                    imageUrl: true,
                    category: { select: { name: true } },
                  },
                },
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
            },
            invoiceDateChangeLogs: {
              take: 1,
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                oldInvoiceDate: true,
                newInvoiceDate: true,
                oldDocumentNumber: true,
                newDocumentNumber: true,
                reason: true,
                actorName: true,
                actorRole: true,
                createdAt: true,
              },
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

      const {
        suratJalan: _suratJalan,
        payments,
        debtPaymentLogs,
        invoiceDateChangeLogs,
        ...transactionPayload
      } = transaction;
      const latestInvoiceDateChange = (invoiceDateChangeLogs ?? [])[0] ?? null;
      return {
        ...transactionPayload,
        payments: (payments ?? []).map((payment) => ({
          amount: Number(payment.amount),
          method: payment.method,
        })),
        debtPaymentLogs: (debtPaymentLogs ?? []).map((payment) => ({
          id: payment.id,
          createdAt: payment.createdAt.toISOString(),
          amount: Number(payment.amount),
          paymentMethod: payment.paymentMethod,
        })),
        latestInvoiceDateChange: latestInvoiceDateChange
          ? {
              ...latestInvoiceDateChange,
              oldInvoiceDate: latestInvoiceDateChange.oldInvoiceDate.toISOString(),
              newInvoiceDate: latestInvoiceDateChange.newInvoiceDate.toISOString(),
              createdAt: latestInvoiceDateChange.createdAt.toISOString(),
            }
          : null,
        suratJalanSummary: summary,
      };
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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Data transaksi tidak valid." }, { status: 422 });
    }
    let printingReceipt: Awaited<ReturnType<typeof db.printingReceipt.findFirst>> = null;
    let receiptInvoiceDate: string | null = null;
    if (body.printingReceiptId !== undefined || body.printingReceiptRevision !== undefined) {
      const context = z.object({
        printingReceiptId: z.string().min(1),
        printingReceiptRevision: z.number().int().nonnegative(),
      }).safeParse(body);
      if (!context.success) {
        return NextResponse.json({ message: "Nota dan versi penyimpanannya wajib dikirim." }, { status: 422 });
      }
      printingReceipt = await db.printingReceipt.findFirst({
        where: { id: context.data.printingReceiptId, storeId },
      });
      if (!printingReceipt) {
        return NextResponse.json({ message: "Nota tidak ditemukan." }, { status: 404 });
      }
      // A retry after a lost response returns the original sale, including its
      // current payment state. It never creates another payment or stock entry.
      if (printingReceipt.transactionId) {
        const existing = await db.transaction.findFirst({
          where: { id: printingReceipt.transactionId, storeId }, include: receiptTransactionInclude,
        });
        if (!existing) throw new Error("PRINTING_RECEIPT_TRANSACTION_MISSING");
        return NextResponse.json(existing);
      }
      if (printingReceipt.revision !== context.data.printingReceiptRevision) {
        throw new PrintingReceiptCheckoutConflict("Nota sudah berubah. Muat ulang sebelum memproses pembayaran.");
      }
      const document = parsePrintingReceiptDocument(printingReceipt.document);
      receiptInvoiceDate = document.date;
      body.items = getPrintingReceiptCheckoutLines(document).map((line) => ({
        lineType: "PRINTING_SERVICE", printingServiceId: null,
        name: line.name, material: line.material, price: line.price, quantity: line.quantity,
        needsMaterial: Boolean(line.stockLink), rawMaterialProductId: line.stockLink?.productId ?? null,
        rawMaterialQuantity: line.stockLink?.quantity ?? null, rawMaterialUnit: line.stockLink?.unit ?? null,
      }));
      body.customerName = document.customerName;
      body.customerId = document.customerId;
      body.isJobOrder = true;
      body.note = body.note || document.note;
      if (document.completionDate) {
        body.estimatedDoneAt = `${document.completionDate}T${document.completionTime || "00:00"}:00+07:00`;
      }
    }
    const parsed = createTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    if (!printingReceipt && parsed.data.items.some(item => item.lineType === "PRINTING_SERVICE" && item.printingServiceId === null)) {
      return NextResponse.json({ message: "Item bebas hanya dapat diproses dari nota Percetakan tersimpan." }, { status: 422 });
    }

    const {
      items,
      paymentMethod,
      amountPaid,
      discount,
      taxRate,
      note,
      customerName,
      customerId,
      pricingPreference,
      priceRoundingSettings,
      salesName,
      salespersonId,
      paymentStatus,
      isJobOrder,
      estimatedDoneAt,
      invoiceDate,
      invoiceTime,
      invoiceDateReason,
      payments: rawPayments,
    } = parsed.data;
    const isTempo = paymentMethod === "TEMPO";

    if (isTempo) {
      try {
        assertTempoCustomer(paymentMethod, customerId);
      } catch (error) {
        return NextResponse.json(
          { message: error instanceof Error ? error.message : "Pilih pelanggan untuk transaksi Tempo." },
          { status: 422 },
        );
      }
      if (paymentStatus === "DP") {
        return NextResponse.json(
          { message: "Tempo/Tagihan merupakan metode pembayaran terpisah dari DP." },
          { status: 422 },
        );
      }
      if (!rawPayments?.length && amountPaid > 0) {
        return NextResponse.json(
          { message: "Metode pembayaran aktual wajib dicatat untuk pembayaran awal Tempo." },
          { status: 422 },
        );
      }
      if (rawPayments?.length) {
        const actualPaymentTotal = rawPayments.reduce((sum, payment) => sum + payment.amount, 0);
        if (Math.abs(actualPaymentTotal - amountPaid) > 0.01) {
          return NextResponse.json(
            { message: "Jumlah pembayaran awal Tempo tidak sesuai dengan metode pembayaran." },
            { status: 422 },
          );
        }
      }
    }
    const now = await getInvoiceNow();
    const requestedInvoiceDate = receiptInvoiceDate ?? invoiceDate;
    const hasCustomInvoiceDate = Boolean(invoiceDate || invoiceTime || (receiptInvoiceDate && receiptInvoiceDate !== jakartaDateKey(now)));

    if (hasCustomInvoiceDate && user.role !== "OWNER" && user.role !== "ADMIN") {
      return NextResponse.json(
        { message: "Hanya Owner atau Admin yang boleh mengatur tanggal invoice." },
        { status: 403 },
      );
    }

    const resolvedInvoiceDate = hasCustomInvoiceDate
      ? resolveInvoiceDateTime({
          mode: "create",
          date: requestedInvoiceDate ?? jakartaDateKey(now),
          time: invoiceTime,
          now,
        })
      : now;

    if (
      hasCustomInvoiceDate &&
      requiresInvoiceDateReason({ invoiceDate: resolvedInvoiceDate, now }) &&
      !invoiceDateReason?.trim()
    ) {
      return NextResponse.json(
        { message: "Alasan wajib diisi untuk tanggal invoice beda hari." },
        { status: 422 },
      );
    }

    // Resolve payments array: use explicit payments or fall back to single paymentMethod
    const resolvedPayments = rawPayments && rawPayments.length > 0
      ? rawPayments
      : isTempo
        ? []
        : [{ method: paymentMethod, amount: amountPaid }];

    // Determine primary payment method (largest amount) for backward-compatible field
    const primaryPaymentMethod = isTempo ? "TEMPO" : resolvedPayments.reduce((primary, p) =>
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
      ...new Set(serviceLineItems.map((item) => item.printingServiceId).filter((id): id is string => Boolean(id))),
    ];

    // Compute the day window once so the daily-count query can join the
    // pre-validation parallel batch instead of running serially inside the
    // interactive transaction below. The retry loop on P2002 already covers
    // the rare race where two cashiers read the same count.
    const dateStr = compactJakartaDateKey(resolvedInvoiceDate);

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
          storeId: true,
          stockGroupId: true,
          hargaDinas: true,
          hargaAgen: true,
          stock: true,
          unit: true,
          brandId: true,
          size: true,
          material: true,
          categoryId: true,
          category: { select: { name: true } },
          brand: { select: { name: true } },
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
        where: {
          storeId,
          invoiceNumber: { startsWith: `INV-${dateStr}-` },
        },
      }),
    ]);

    if (customerId && !customerCheck) {
      return NextResponse.json({ message: "Customer not found" }, { status: 404 });
    }
    if (salespersonId && !salespersonCheck) {
      return NextResponse.json({ message: "Salesperson not found" }, { status: 404 });
    }

    const baseCosts = await loadProductBaseCosts(db, products);
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
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
      },
    })).map((rule) => ({
      id: rule.id,
      categoryId: rule.categoryId,
      categoryName: rule.category.name,
      customerType: (rule.customerType ?? "ALL") as CategoryPricingRule["customerType"],
      customerTypes: rule.customerTypes,
      unit: rule.unit,
      brandId: rule.brandId,
      brandName: rule.brand?.name ?? null,
      mode: rule.mode,
      value: Number(rule.value),
      discountPercent: Number(rule.discountPercent ?? 0),
      isActive: rule.isActive,
      updatedAt: rule.updatedAt,
    })) satisfies CategoryPricingRule[];

    const roundingSettings = await getPriceRoundingSettings();
    if (priceRoundingSettings && (
      priceRoundingSettings.enabled !== roundingSettings.enabled ||
      priceRoundingSettings.increment !== roundingSettings.increment ||
      priceRoundingSettings.threshold !== roundingSettings.threshold
    )) {
      return NextResponse.json({ message: "Pengaturan pembulatan harga sudah berubah. Muat ulang harga sebelum melanjutkan transaksi." }, { status: 409 });
    }
    const serverItems: ServerTransactionItem[] = items.map((item) => {
      if (item.lineType === "PRINTING_SERVICE") {
        const service = item.printingServiceId ? printingServiceById.get(item.printingServiceId) : null;
        if (item.printingServiceId && !service) {
          throw new Error("PRINTING_SERVICE_NOT_FOUND");
        }
        const rawMaterial = item.rawMaterialProductId
          ? productById.get(item.rawMaterialProductId)
          : null;
        if (printingReceipt && rawMaterial && item.rawMaterialUnit !== rawMaterial.unit) {
          throw new PrintingReceiptValidationError("Satuan bahan stok sudah berubah. Pilih ulang bahan di nota.");
        }

        return {
          lineType: "PRINTING_SERVICE",
          printingServiceId: service?.id ?? null,
          rawMaterialProductId: rawMaterial?.id ?? null,
          name: service?.name ?? item.name ?? "",
          size: item.size ?? null,
          material: item.material ?? rawMaterial?.name ?? null,
          serviceNote: item.serviceNote ?? null,
          price: item.price,
          quantity: item.quantity,
          discount: item.discount,
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
              costPrice: product.costPrice == null ? null : Number(product.costPrice),
              ...baseCosts.get(product.id),
              hargaDinas: product.hargaDinas == null ? null : Number(product.hargaDinas),
              hargaAgen: product.hargaAgen == null ? null : Number(product.hargaAgen),
              unit: product.unit,
              brandId: product.brandId,
              brandName: product.brand?.name ?? null,
            },
            checkoutCustomerType,
            pricingRules,
            pricingPreference,
          );
          const roundedAutomatic = roundSellingPriceLine(priced, roundingSettings);
          const resolved = roundSellingPriceLine(resolveCustomPricedLine({
            pricedLine: priced,
            submittedPrice: item.price === roundedAutomatic.unitPrice ? undefined : item.price,
            role: user.role,
            customerType: checkoutCustomerType,
          }), roundingSettings);
          return {
            price: resolved.unitPrice,
            originalPrice: Number(product.price),
            appliedPricing: resolved.appliedPricing,
          };
        })(),
        costPrice: product.costPrice ? Number(product.costPrice) : null,
        quantity: item.quantity,
        discount: item.discount,
      };
    });

    // Calculate totals
    const subtotal = serverItems.reduce(
      (sum, item) => sum + discountedLineSubtotal(item.price, item.quantity, item.discount),
      0
    );
    const { tax, total } = calculateTransactionTax({ subtotal, discount, taxRate, taxMethod: "STANDARD" });
    if (printingReceipt && (!Number.isFinite(total) || total > MAX_PRINTING_RECEIPT_AMOUNT)) {
      return NextResponse.json({ message: "Total nota setelah pajak melebihi batas nilai transaksi. Sesuaikan harga atau pajak sebelum pembayaran." }, { status: 422 });
    }

    const isDP = paymentStatus === "DP";
    const autoApproveTransaction = canRolePerformAction(
      user.role as Role,
      "transaction.auto_approve",
      "create",
      permissions,
    );
    const requiresApproval = !autoApproveTransaction;

    const amountPaidComputed = resolvedPayments.reduce((sum, p) => sum + p.amount, 0);
    if (printingReceipt && (
      !Number.isFinite(discount) || discount > MAX_PRINTING_RECEIPT_AMOUNT ||
      !Number.isFinite(amountPaidComputed) || amountPaidComputed > MAX_PRINTING_RECEIPT_AMOUNT
    )) {
      return NextResponse.json({ message: "Diskon atau pembayaran melebihi batas nilai nota. Sesuaikan nilainya sebelum pembayaran." }, { status: 422 });
    }
    if (isTempo && amountPaidComputed >= total) {
      return NextResponse.json(
        { message: "Pembayaran Tempo harus menyisakan saldo tagihan." },
        { status: 422 },
      );
    }
    // Roles without transaction.auto_approve hold the invoice as
    // PENDING_APPROVAL. Until an authorized approver finalizes it, revenue and
    // stock stay untouched and no payment change is returned.
    const changeComputed =
      isDP || isTempo || requiresApproval ? 0 : amountPaidComputed - total;
    const finalStatus: "COMPLETED" | "DP" | "PENDING_APPROVAL" = requiresApproval
      ? "PENDING_APPROVAL"
      : isDP
        ? "DP"
        : "COMPLETED";

    if (!isDP && !isTempo && amountPaidComputed < total) {
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
    let receiptAlreadyProcessed = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        transaction = await db.$transaction(async (tx: TxClient) => {
          // The revision update locks this receipt before any financial side
          // effect. Concurrent saves/checkouts serialize on this single row.
          if (printingReceipt) {
            const claimed = await tx.printingReceipt.updateMany({
              where: { id: printingReceipt.id, storeId, revision: printingReceipt.revision, transactionId: null },
              data: { revision: { increment: 1 } },
            });
            if (claimed.count !== 1) {
              const current = await tx.printingReceipt.findFirst({ where: { id: printingReceipt.id, storeId } });
              if (current?.transactionId) {
                const existing = await tx.transaction.findFirst({
                  where: { id: current.transactionId, storeId }, include: receiptTransactionInclude,
                });
                if (existing) { receiptAlreadyProcessed = true; return existing; }
              }
              throw new PrintingReceiptCheckoutConflict("Nota sudah diproses atau diubah. Muat ulang untuk melanjutkan.");
            }
          }
          // Lock the customer before the invoice and stock rows. Counters must
          // roll back with the sale, so an immediate void can reverse them.
          const customerArgs = !requiresApproval ? buildCustomerUpdateArgs({
            customerId: customerId || null, isDP: isDP || isTempo,
            total, amountPaid: amountPaidComputed,
          }) : null;
          if (customerArgs) await tx.customer.update(customerArgs);
          const invoiceNumber = printingReceipt?.number ?? `INV-${dateStr}-${String(
            todayCount + 1 + attempt,
          ).padStart(4, "0")}`;

          const txn = await tx.transaction.create({
            data: {
              invoiceNumber,
              transactionCategory: printingReceipt || serviceLineItems.length > 0 ? "PERCETAKAN" : "ATK",
              printingSubcategory: printingReceipt?.subcategory ?? null,
              invoiceDate: resolvedInvoiceDate,
              storeId,
              cashierId: requiresApproval ? null : user.id,
              requestedById: requiresApproval ? user.id : null,
              customerId: customerId || null,
              subtotal,
              discount,
              tax,
              taxRate,
              taxMethod: "STANDARD",
              total,
              paymentMethod: primaryPaymentMethod,
              amountPaid: amountPaidComputed,
              change: changeComputed,
              status: finalStatus,
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
                          discount: item.discount,
                          subtotal: discountedLineSubtotal(item.price, item.quantity, item.discount),
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
                          discount: item.discount,
                          subtotal: discountedLineSubtotal(item.price, item.quantity, item.discount),
                          pricingRuleId: item.appliedPricing?.ruleId ?? null,
                          pricingCustomerType: item.appliedPricing?.customerType ?? null,
                          pricingCategoryId: item.appliedPricing?.categoryId ?? null,
                          pricingCategoryName: item.appliedPricing?.categoryName ?? null,
                          pricingMode: item.appliedPricing?.mode ?? null,
                          pricingValue: item.appliedPricing?.value ?? null,
                          pricingDiscountPercent: item.appliedPricing?.discountPercent ?? null,
                          pricingUnit: item.appliedPricing?.unit ?? null,
                          pricingBrandId: item.appliedPricing?.brandId ?? null,
                          pricingBrandName: item.appliedPricing?.brandName ?? null,
                          originalUnitPrice: item.appliedPricing?.originalUnitPrice ?? item.originalPrice,
                          appliedUnitPrice: item.appliedPricing?.appliedUnitPrice ?? item.price,
                        }
                ),
              },
              ...(resolvedPayments.length > 0
                ? {
                    payments: {
                      create: resolvedPayments.map((p) => ({
                        amount: p.amount,
                        method: p.method,
                      })),
                    },
                  }
                : {}),
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
                  discount: true,
                  pricingRuleId: true,
                  pricingCustomerType: true,
                  pricingCategoryId: true,
                  pricingCategoryName: true,
                  pricingMode: true,
                  pricingValue: true,
                  pricingDiscountPercent: true,
                  pricingUnit: true,
                  pricingBrandId: true,
                  pricingBrandName: true,
                  originalUnitPrice: true,
                  appliedUnitPrice: true,
                  subtotal: true,
                  product: {
                    select: {
                      unit: true,
                      imageUrl: true,
                      category: { select: { name: true } },
                    },
                  },
                  printingService: { select: { unit: true } },
                },
              },
              salesperson: { select: { name: true } },
              payments: { select: { amount: true, method: true } },
            },
          });

          if (printingReceipt) {
            await assertPrintingReceiptStockUnits(tx, { storeId, items: serverItems });
            await tx.printingReceipt.update({ where: { id: printingReceipt.id }, data: { transactionId: txn.id } });
          }

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
          if (!requiresApproval) {
            const stockMovements = await applyProductStockDeltas(tx, {
              storeId,
              items: stockDecrementItems.map((item) => ({
                productId: item.productId,
                delta: -item.quantity,
              })),
              allowNegative: true,
            });

            const inventoryRows = [
              ...buildInventoryLogRows({
                items: serverItems.filter(
                  (item): item is ServerProductTransactionItem =>
                    item.lineType === "PRODUCT",
                ),
                invoiceNumber,
                userId: user.id,
                userName: user.name ?? null,
              }),
              ...buildServiceMaterialInventoryLogRows({
                items: serverItems.filter(
                  (item): item is ServerPrintingServiceTransactionItem =>
                    item.lineType === "PRINTING_SERVICE",
                ),
                invoiceNumber,
                userId: user.id,
                userName: user.name ?? null,
              }),
            ];

            if (inventoryRows.length > 0) {
              const journalRows = buildTransactionStockJournal({
                transactionId: txn.id,
                inventoryRows,
                stockMovements,
              });
              await tx.inventoryLog.createMany({ data: journalRows });
            }
          }

          return txn;
        },
        {
          maxWait: 5000, // 5 seconds max wait to connect
          timeout: 15000, // 15 seconds timeout for the entire transaction
        });

        // Transaction succeeded â€” break out of retry loop
        break;
      } catch (err: any) {
        if (err?.code === "P2034" && printingReceipt) {
          throw new PrintingReceiptCheckoutConflict("Nota sedang diproses pengguna lain. Coba lagi untuk memuat transaksi tersimpan.");
        }
        // P2002 = unique constraint violation on invoiceNumber â€” retry
        if (err?.code === "P2002" && printingReceipt) {
          throw new PrintingReceiptCheckoutConflict("No. Nota sudah digunakan transaksi lain. Ubah nomor nota lalu coba lagi.");
        }
        if (err?.code === "P2002" && attempt < MAX_ATTEMPTS - 1) {
          log.warn(
            `Invoice number collision on attempt ${attempt + 1}, retryingâ€¦`
          );
          continue;
        }
        throw err; // non-recoverable error or max retries exceeded
      }
    }

    if (requiresApproval && !receiptAlreadyProcessed) {
      after(async () => {
        try {
          await sendRolePushEvent({
            eventName: "transaction.approval_requested",
            storeId,
            roles: ["OWNER", "ADMIN"],
            featureKey: "pendingTransactions",
            excludeUserIds: [user.id],
            payload: {
              title: "Persetujuan Transaksi",
              body: `${user.name ?? "Pengguna"} meminta persetujuan transaksi ${transaction.invoiceNumber} sejumlah Rp ${total.toLocaleString("id-ID")}`,
              url: "/dashboard/transactions?status=PENDING_APPROVAL",
              tag: `transaction-${transaction.id}`,
            },
          });
        } catch (pushErr) {
          log.warn("Failed to send approval-request push:", pushErr);
        }
      });
    }

    return NextResponse.json(printingReceipt ? {
      ...transaction,
      printingReceipt: { id: printingReceipt.id, number: printingReceipt.number, subcategory: printingReceipt.subcategory },
    } : transaction, { status: receiptAlreadyProcessed ? 200 : 201 });
  } catch (error) {    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof PrintingReceiptValidationError) {
      return NextResponse.json({ message: error.message }, { status: 422 });
    }
    if (error instanceof PrintingReceiptCheckoutConflict) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof PrintingReceiptStockChangedError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
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

    if (error instanceof Error && error.message === "ITEM_DISCOUNT_INVALID") {
      return NextResponse.json({ message: "Diskon item harus bernilai positif atau nol dan tidak melebihi total item." }, { status: 422 });
    }
    log.error("Failed to create transaction:", error);
    return NextResponse.json(
      { message: "Failed to create transaction" },
      { status: 500 }
    );
  }
}





