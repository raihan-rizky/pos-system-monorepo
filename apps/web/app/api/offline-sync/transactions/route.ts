import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { buildOfflineSyncDecision } from "@/lib/offline/offline-sync-core";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:offline-sync:transactions");
export const dynamic = "force-dynamic";

const offlineItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  size: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  price: z.number().min(0),
  quantity: z.number().min(1),
});

const offlineTransactionSchema = z.object({
  clientMutationId: z.string().min(1),
  createdAt: z.string().datetime(),
  items: z.array(offlineItemSchema).min(1),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]),
  amountPaid: z.number().min(0),
  discount: z.number().min(0).default(0),
  note: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  salesName: z.string().optional().nullable(),
  salespersonId: z.string().optional().nullable(),
  paymentStatus: z.string().optional().default("COMPLETED"),
  isJobOrder: z.boolean().optional().default(false),
  estimatedDoneAt: z.string().optional().nullable(),
  originalSubtotal: z.number().min(0),
  originalTotal: z.number().min(0),
});

const syncSchema = z.object({
  transactions: z.array(offlineTransactionSchema).min(1).max(500),
});

type TxClient = Prisma.TransactionClient;
type OfflineTransactionInput = z.infer<typeof offlineTransactionSchema>;
type ServerOfflineItem = z.infer<typeof offlineItemSchema>;

export async function POST(request: Request) {
  try {
    const user = await requirePermission("transaction", "create");
    const storeId = user.storeId || "store-main";
    const body = await request.json();
    const parsed = syncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const results = [];

    for (const offlineTx of parsed.data.transactions) {
      const existing = await db.transaction.findUnique({
        where: { offlineClientMutationId: offlineTx.clientMutationId },
        select: { id: true, status: true },
      });

      if (existing) {
        results.push({
          clientMutationId: offlineTx.clientMutationId,
          status: existing.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : "SYNCED",
          serverTransactionId: existing.id,
          message: "Already synced",
        });
        continue;
      }

      const productIds = [...new Set(offlineTx.items.map((item) => item.productId))];
      const products = await db.product.findMany({
        where: {
          id: { in: productIds },
          storeId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          price: true,
          size: true,
          material: true,
          stock: true,
        },
      });
      const productById = new Map(products.map((product) => [product.id, product]));

      if (productById.size !== productIds.length) {
        results.push({
          clientMutationId: offlineTx.clientMutationId,
          status: "FAILED_FINAL",
          message: "One or more products were not found",
        });
        continue;
      }

      const serverItems: ServerOfflineItem[] = offlineTx.items.map((item) => {
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
          quantity: item.quantity,
        };
      });
      const stockByProductId = new Map(products.map((product) => [product.id, product.stock]));

      const decision = buildOfflineSyncDecision(
        {
          clientMutationId: offlineTx.clientMutationId,
          createdAt: offlineTx.createdAt,
          items: serverItems,
          discount: offlineTx.discount,
          originalTotal: offlineTx.originalTotal,
        },
        {
          now: new Date(),
          stockByProductId,
        },
      );

      if (decision.resultStatus === "FAILED_FINAL") {
        results.push({
          clientMutationId: offlineTx.clientMutationId,
          status: "FAILED_FINAL",
          message: "Tidak ada item yang tersedia untuk disinkronkan",
        });
        continue;
      }

      if (offlineTx.customerId) {
        const customer = await db.customer.findFirst({
          where: { id: offlineTx.customerId, storeId },
          select: { id: true },
        });
        if (!customer) {
          results.push({
            clientMutationId: offlineTx.clientMutationId,
            status: "FAILED_FINAL",
            message: "Customer not found",
          });
          continue;
        }
      }

      if (offlineTx.salespersonId) {
        const salesperson = await db.salesperson.findFirst({
          where: { id: offlineTx.salespersonId, storeId },
          select: { id: true },
        });
        if (!salesperson) {
          results.push({
            clientMutationId: offlineTx.clientMutationId,
            status: "FAILED_FINAL",
            message: "Salesperson not found",
          });
          continue;
        }
      }

      const serverOfflineTx: OfflineTransactionInput = {
        ...offlineTx,
        items: serverItems,
      };
      const finalDecision =
        decision.transactionStatus === "COMPLETED" && offlineTx.amountPaid < decision.total
          ? {
              ...decision,
              resultStatus: "PENDING_APPROVAL" as const,
              transactionStatus: "PENDING_APPROVAL" as const,
              reason: "ADJUSTED_TOTAL_CHANGED" as const,
            }
          : decision;

      const created = await createSyncedTransaction({
        txData: serverOfflineTx,
        decision: finalDecision,
        user,
        storeId,
      });

      results.push({
        clientMutationId: offlineTx.clientMutationId,
        status: finalDecision.resultStatus,
        serverTransactionId: created.id,
        message:
          finalDecision.resultStatus === "PENDING_APPROVAL"
            ? "Synced as pending approval"
            : "Synced",
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[POST /api/offline-sync/transactions]", error);
    return NextResponse.json(
      { message: "Failed to sync offline transactions" },
      { status: 500 },
    );
  }
}

async function createSyncedTransaction({
  txData,
  decision,
  user,
  storeId,
}: {
  txData: OfflineTransactionInput;
  decision: ReturnType<typeof buildOfflineSyncDecision>;
  user: Awaited<ReturnType<typeof requirePermission>>;
  storeId: string;
}) {
  return db.$transaction(async (tx: TxClient) => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const count = await tx.transaction.count({
      where: { storeId, createdAt: { gte: dayStart } },
    });
    const invoiceNumber = `INV-${dateStr}-${String(count + 1).padStart(4, "0")}`;
    const isPendingApproval = decision.transactionStatus === "PENDING_APPROVAL";
    const amountPaid = isPendingApproval ? 0 : Math.min(txData.amountPaid, decision.total);

    const transaction = await tx.transaction.create({
      data: {
        invoiceNumber,
        storeId,
        cashierId: user.role === "SALES" || isPendingApproval ? null : user.id,
        requestedById: user.role === "SALES" || isPendingApproval ? user.id : null,
        customerId: txData.customerId || null,
        subtotal: decision.subtotal,
        discount: txData.discount,
        tax: 0,
        total: decision.total,
        paymentMethod: txData.paymentMethod,
        amountPaid,
        change: isPendingApproval ? 0 : Math.max(0, amountPaid - decision.total),
        status: decision.transactionStatus || "PENDING_APPROVAL",
        note: buildOfflineNote(txData.note, decision),
        customerName: txData.customerName || null,
        salesName: txData.salesName || null,
        salespersonId: txData.salespersonId || null,
        isJobOrder: txData.isJobOrder,
        productionStatus: txData.isJobOrder ? "PRINTING" : null,
        estimatedDoneAt: txData.estimatedDoneAt ? new Date(txData.estimatedDoneAt) : null,
        offlineClientMutationId: txData.clientMutationId,
        offlineOriginalPayload: txData as Prisma.JsonObject,
        offlineSyncMetadata: {
          reason: decision.reason,
          removedItems: decision.removedItems,
          originalTotal: txData.originalTotal,
          adjustedTotal: decision.total,
        } as Prisma.JsonObject,
        items: {
          create: decision.items.map((item) => ({
            productId: item.productId,
            productName: item.name,
            size: item.size || null,
            material: item.material || null,
            quantity: item.quantity,
            unitPrice: item.price,
            discount: 0,
            subtotal: item.price * item.quantity,
          })),
        },
      },
      include: { items: true },
    });

    if (!isPendingApproval) {
      const updates = await Promise.all(
        decision.items.map((item) =>
          tx.product.updateMany({
            where: {
              id: item.productId,
              storeId,
              stock: { gte: item.quantity },
            },
            data: { stock: { decrement: item.quantity } },
          }),
        ),
      );

      if (updates.some((update) => update.count !== 1)) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      const productIds = decision.items.map((item) => item.productId);
      const productCosts = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, costPrice: true },
      });
      const costById = new Map(
        productCosts.map((p) => [
          p.id,
          p.costPrice === null ? null : Number(p.costPrice.toString()),
        ]),
      );

      await tx.inventoryLog.createMany({
        data: decision.items.map((item) => ({
          productId: item.productId,
          type: "OUT",
          reason: "SALE",
          quantity: item.quantity,
          unitCost: costById.get(item.productId) ?? null,
          note: `Offline sync ${invoiceNumber}`,
          createdBy: user.id,
          person: user.name,
        })),
      });
    }

    return transaction;
  });
}

function buildOfflineNote(
  note: string | null | undefined,
  decision: ReturnType<typeof buildOfflineSyncDecision>,
) {
  const auditNote = `Offline sync: ${decision.reason}`;
  return note ? `${note} | ${auditNote}` : auditNote;
}


