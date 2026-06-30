import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import {
  handleAuthError,
  requirePermission,
} from "@/lib/rbac/guard";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import {
  buildSuratJalanNumber,
  calculateSuratJalanProgress,
  getSuratJalanEligibility,
  getSuratJalanRemainingItems,
  planSuratJalanCreation,
} from "@/features/surat-jalan";
import type {
  SuratJalanRecord,
  SuratJalanTransactionItem,
} from "@/features/surat-jalan";
import { resolveProductDisplayStock } from "@/features/product-stock-groups/stock-display";
import { applyProductStockDelta } from "@/features/product-stock-groups/stock-mutations";

const log = getLogger("api:transactions:surat-jalan");

export const dynamic = "force-dynamic";

const createSuratJalanSchema = z.object({
  recipientName: z.string().trim().min(1),
  quantities: z.record(z.string(), z.coerce.number().int().min(0)),
  keterangan: z.record(z.string(), z.string().trim().max(500)).optional().default({}),
  note: z.string().trim().max(500).optional().nullable(),
});

const MAX_ATTEMPTS = 5;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("surat_jalan", "read");
    const storeId = user.storeId || "store-main";
    const { id: transactionId } = await params;

    const bundle = await db.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { id: transactionId, storeId },
        include: {
          customer: { select: { type: true } },
          salesperson: { select: { name: true } },
          payments: {
            select: { amount: true, method: true },
          },
          debtPaymentLogs: {
            select: { id: true, createdAt: true, amount: true, paymentMethod: true },
            orderBy: { createdAt: "desc" },
          },
          items: {
            include: {
              product: {
                select: {
                  imageUrl: true,
                  stock: true,
                  unit: true,
                  unitMultiplierToBase: true,
                  category: { select: { name: true } },
                  stockGroup: { select: { baseStock: true } },
                },
              },
              printingService: { select: { unit: true } },
            },
          },
          suratJalan: {
            orderBy: { sequence: "asc" },
            include: { items: true },
          },
        },
      });

      if (!transaction) {
        throw new Error("TRANSACTION_NOT_FOUND");
      }

      const invoiceItems = transaction.items.map(toPlannerTransactionItem);
      const suratJalan = transaction.suratJalan.map(toPlannerSuratJalan);
      const remainingItems = getSuratJalanRemainingItems({
        invoiceItems,
        suratJalan,
      });

      return {
        transaction: {
          id: transaction.id,
          invoiceNumber: transaction.invoiceNumber,
          draftNumber: transaction.draftNumber ?? null,
          status: transaction.status,
          customerName: transaction.customerName,
          customerId: transaction.customerId ?? null,
          customerType: transaction.customer?.type ?? null,
          createdAt: transaction.createdAt.toISOString(),
          subtotal: Number(transaction.subtotal ?? 0),
          discount: Number(transaction.discount ?? 0),
          tax: Number(transaction.tax ?? 0),
          total: Number(transaction.total),
          paymentMethod: transaction.paymentMethod ?? "CASH",
          amountPaid: Number(transaction.amountPaid ?? 0),
          change: Number(transaction.change ?? 0),
          note: transaction.note ?? null,
          salesName: transaction.salesName ?? null,
          salespersonId: transaction.salespersonId ?? null,
          salesperson: transaction.salesperson ? { name: transaction.salesperson.name } : null,
          stockManagedBySuratJalan: transaction.stockManagedBySuratJalan,
          payments: (transaction.payments ?? []).map((payment) => ({
            amount: Number(payment.amount),
            method: payment.method,
          })),
          debtPaymentLogs: (transaction.debtPaymentLogs ?? []).map((payment) => ({
            id: payment.id,
            createdAt: payment.createdAt.toISOString(),
            amount: Number(payment.amount),
            paymentMethod: payment.paymentMethod,
          })),
          items: transaction.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            printingServiceId: item.printingServiceId,
            rawMaterialProductId: item.rawMaterialProductId,
            productName: item.productName,
            size: item.size,
            material: item.material,
            serviceNote: item.serviceNote,
            rawMaterialQuantity: item.rawMaterialQuantity === null || item.rawMaterialQuantity === undefined
              ? null
              : Number(item.rawMaterialQuantity),
            rawMaterialUnit: item.rawMaterialUnit,
            quantity: item.quantity,
            unit: item.product?.unit ?? item.printingService?.unit ?? item.rawMaterialUnit ?? null,
            unitPrice: Number(item.unitPrice),
            subtotal: Number(item.subtotal),
            product: item.product
              ? {
                unit: item.product.unit,
                imageUrl: item.product.imageUrl,
                category: item.product.category,
              }
              : null,
            printingService: item.printingService,
          })),
        },
        eligibility: getSuratJalanEligibility({
          status: transaction.status,
          items: invoiceItems,
          remainingItems,
        }),
        progress: calculateSuratJalanProgress({
          invoiceItems,
          suratJalan,
        }),
        remainingItems,
        suratJalan,
      };
    });

    return NextResponse.json({ data: bundle }, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof Error && error.message === "TRANSACTION_NOT_FOUND") {
      return apiError("Transaction not found", 404, { code: "NotFound" });
    }

    log.error("Failed to fetch surat jalan bundle", error);
    return apiError("Failed to fetch surat jalan bundle", 500, {
      code: "InternalError",
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("surat_jalan", "create");
    const storeId = user.storeId || "store-main";
    const { id: transactionId } = await params;
    const parsed = createSuratJalanSchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiValidationError(parsed.error);
    }

    const now = new Date();
    let created: unknown = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        created = await db.$transaction(async (tx) => {
          const transaction = await tx.transaction.findFirst({
            where: { id: transactionId, storeId },
            include: {
              items: {
                include: {
                  product: {
                    select: {
                      stock: true,
                      unit: true,
                      unitMultiplierToBase: true,
                      stockGroup: { select: { baseStock: true } },
                    },
                  },
                },
              },
              suratJalan: {
                orderBy: { sequence: "asc" },
                include: { items: true },
              },
            },
          });

          if (!transaction) {
            throw new Error("TRANSACTION_NOT_FOUND");
          }

          const datePrefix = buildSuratJalanNumber(now, 1).slice(0, -3);
          const todayCount = await tx.suratJalan.count({
            where: { storeId, number: { startsWith: datePrefix } },
          });
          const number = buildSuratJalanNumber(
            now,
            todayCount + 1 + attempt,
          );

          const plan = planSuratJalanCreation({
            transaction: {
              id: transaction.id,
              status: transaction.status,
              stockManagedBySuratJalan:
                transaction.stockManagedBySuratJalan,
              customerName: transaction.customerName,
              items: transaction.items.map(toPlannerTransactionItem),
            },
            existingSuratJalan: transaction.suratJalan.map(toPlannerSuratJalan),
            quantities: parsed.data.quantities,
            keterangan: parsed.data.keterangan,
            recipientName: parsed.data.recipientName,
            actor: {
              id: user.id,
              name: user.name ?? null,
              role: user.role,
            },
            number,
            now,
          });

          if (plan.shouldMarkTransactionManaged) {
            for (const movement of plan.invoiceReversalMovements) {
              await applyProductStockDelta(tx, {
                storeId,
                productId: movement.productId,
                delta: movement.quantity,
                allowNegative: true,
              });
            }
            await tx.transaction.update({
              where: { id: transaction.id },
              data: { stockManagedBySuratJalan: true },
            });
          }

          for (const movement of plan.deliveryStockMovements) {
            await applyProductStockDelta(tx, {
              storeId,
              productId: movement.productId,
              delta: -movement.quantity,
            });
          }

          const suratJalan = await tx.suratJalan.create({
            data: {
              transactionId: transaction.id,
              storeId,
              number: plan.number,
              recipientName: plan.recipientName,
              status: plan.status,
              sequence: plan.sequence,
              requestedById: plan.requestedById,
              requestedByName: plan.requestedByName,
              approvedById: plan.approvedById,
              approvedByName: plan.approvedByName,
              confirmedAt: plan.confirmedAt,
              note: parsed.data.note || null,
              items: {
                create: plan.items.map((item) => ({
                  transactionItemId: item.transactionItemId,
                  productId: item.productId,
                  productName: item.productName,
                  quantity: item.quantity,
                  unit: item.unit,
                  keterangan: item.keterangan,
                  stockBefore: item.stockBefore,
                  stockAfter: item.stockAfter,
                })),
              },
            },
            include: { items: true },
          });

          const inventoryRows = [
            ...plan.invoiceReversalMovements.map((movement) => ({
              productId: movement.productId,
              transactionId: transaction.id,
              suratJalanId: null,
              type: movement.type,
              reason: movement.reason,
              quantity: movement.quantity,
              note: movement.note,
              createdBy: user.id,
              person: user.name ?? null,
            })),
            ...plan.deliveryStockMovements.map((movement) => ({
              productId: movement.productId,
              transactionId: transaction.id,
              suratJalanId: suratJalan.id,
              type: movement.type,
              reason: movement.reason,
              quantity: movement.quantity,
              note: movement.note,
              createdBy: user.id,
              person: user.name ?? null,
            })),
          ];

          if (inventoryRows.length > 0) {
            await tx.inventoryLog.createMany({ data: inventoryRows });
          }

          return suratJalan;
        });
        break;
      } catch (error) {
        if (
          (error as { code?: string })?.code === "P2002" &&
          attempt < MAX_ATTEMPTS - 1
        ) {
          continue;
        }
        throw error;
      }
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof Error) {
      if (error.message === "TRANSACTION_NOT_FOUND") {
        return apiError("Transaction not found", 404, { code: "NotFound" });
      }
      if (
        [
          "STATUS_NOT_ELIGIBLE",
          "PRINTING_SERVICE_NOT_ELIGIBLE",
          "NO_PRODUCT_LINES",
          "FULLY_DELIVERED",
        ].includes(error.message)
      ) {
        return apiError("Transaction is not eligible for surat jalan", 409, {
          code: "Conflict",
          errors: { transaction: [error.message] },
        });
      }
      if (
        [
          "QUANTITY_EXCEEDS_REMAINING",
          "INSUFFICIENT_STOCK",
          "QUANTITY_REQUIRED",
        ].includes(error.message)
      ) {
        return apiError("Invalid surat jalan quantities", 422, {
          code: "ValidationError",
          errors: { quantities: [error.message] },
        });
      }
    }

    log.error("Failed to create surat jalan", error);
    return apiError("Failed to create surat jalan", 500, {
      code: "InternalError",
    });
  }
}

function toPlannerTransactionItem(item: {
  id: string;
  productId: string | null;
  printingServiceId: string | null;
  productName: string;
  quantity: number;
  product: {
    stock: number;
    unit: string;
    unitMultiplierToBase?: number | null;
    stockGroup?: { baseStock: number } | null;
  } | null;
}): SuratJalanTransactionItem {
  return {
    id: item.id,
    productId: item.productId,
    printingServiceId: item.printingServiceId,
    productName: item.productName,
    quantity: item.quantity,
    unit: item.product?.unit ?? null,
    currentStock: item.product ? resolveProductDisplayStock(item.product) : null,
  };
}

function toPlannerSuratJalan(suratJalan: {
  id: string;
  number: string;
  status: string;
  recipientName: string;
  sequence: number;
  requestedByName: string | null;
  approvedByName: string | null;
  markingStatus: string;
  markedByName: string | null;
  markedAt: Date | null;
  markingNote: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  items: Array<{
    id: string;
    transactionItemId: string;
    productId: string;
    productName: string;
    quantity: number;
    unit: string | null;
    keterangan: string | null;
    stockBefore: number | null;
    stockAfter: number | null;
  }>;
}): SuratJalanRecord {
  return {
    id: suratJalan.id,
    number: suratJalan.number,
    status: suratJalan.status as SuratJalanRecord["status"],
    recipientName: suratJalan.recipientName,
    sequence: suratJalan.sequence,
    requestedByName: suratJalan.requestedByName,
    approvedByName: suratJalan.approvedByName,
    markingStatus: suratJalan.markingStatus as SuratJalanRecord["markingStatus"],
    markedByName: suratJalan.markedByName,
    markedAt: suratJalan.markedAt?.toISOString() ?? null,
    markingNote: suratJalan.markingNote,
    createdAt: suratJalan.createdAt.toISOString(),
    confirmedAt: suratJalan.confirmedAt?.toISOString() ?? null,
    items: suratJalan.items.map((item) => ({
      id: item.id,
      transactionItemId: item.transactionItemId,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit,
      keterangan: item.keterangan ?? "",
      stockBefore: item.stockBefore,
      stockAfter: item.stockAfter,
    })),
  };
}
