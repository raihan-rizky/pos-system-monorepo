import { db, Prisma } from "@pos/db";
import { applyProductStockDelta } from "@/features/product-stock-groups/stock-mutations";
import type {
  CreateInboundReceiptDraftInput,
  InboundReceiptStatus,
  InboundReceiptForApproval,
  InboundReceiptLineStatus,
  InventoryInboundReceiptRepository as InventoryInboundReceiptRepositoryContract,
  ReceivingQueueRepositoryRow,
} from "../types/inventory-management";

type Tx = Prisma.TransactionClient;

export class InventoryInboundReceiptRepository
  implements InventoryInboundReceiptRepositoryContract
{
  runInTransaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T> {
    return db.$transaction((tx) => callback(tx));
  }

  async findReceiptForApproval(
    tx: Tx,
    input: { storeId: string; receiptId: string },
  ): Promise<InboundReceiptForApproval | null> {
    const receipt = await tx.inventoryInboundReceipt.findFirst({
      where: { id: input.receiptId, storeId: input.storeId },
      select: {
        id: true,
        storeId: true,
        supplierId: true,
        status: true,
        lines: {
          select: {
            id: true,
            productId: true,
            status: true,
            receivedQuantity: true,
            product: {
              select: {
                isActive: true,
                costPrice: true,
              },
            },
          },
        },
      },
    });
    if (!receipt) return null;

    return {
      id: receipt.id,
      storeId: receipt.storeId,
      supplierId: receipt.supplierId,
      status: receipt.status,
      lines: receipt.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        status: line.status,
        receivedQuantity: line.receivedQuantity,
        latestCostPrice:
          line.product.costPrice === null
            ? null
            : Number(line.product.costPrice.toString()),
        productIsActive: line.product.isActive,
      })),
    };
  }

  async createInboundStockLog(
    tx: Tx,
    input: {
      productId: string;
      quantity: number;
      unitCost: number;
      supplierId?: string | null;
      createdBy: string;
      person: string | null;
      note: string | null;
    },
  ): Promise<{ id: string }> {
    return tx.inventoryLog.create({
      data: {
        productId: input.productId,
        type: "IN",
        reason: "RESTOCK",
        supplierId: input.supplierId ?? null,
        quantity: input.quantity,
        unitCost: input.unitCost,
        note: input.note,
        createdBy: input.createdBy,
        person: input.person,
        status: "APPROVED",
        approvedBy: input.createdBy,
        approverName: input.person,
        decidedAt: new Date(),
      },
      select: { id: true },
    });
  }

  applyProductStockDelta(
    tx: Tx,
    input: { storeId: string; productId: string; delta: number },
  ): Promise<unknown> {
    return applyProductStockDelta(tx, input);
  }

  async markReceiptApproved(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      approvedBy: string;
      approvedAt: Date;
      lineLogIds: Array<{ lineId: string; inventoryLogId: string }>;
    },
  ) {
    const updated = await tx.inventoryInboundReceipt.updateMany({
      where: {
        id: input.receiptId,
        storeId: input.storeId,
        status: "SUBMITTED",
      },
      data: {
        status: "APPROVED",
        approvedBy: input.approvedBy,
        approvedAt: input.approvedAt,
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }

    for (const line of input.lineLogIds) {
      await tx.inventoryInboundReceiptLine.update({
        where: { id: line.lineId },
        data: { inventoryLogId: line.inventoryLogId },
      });
    }

    return { id: input.receiptId, status: "APPROVED" as const };
  }

  async markReceiptRejected(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      rejectedBy: string;
      rejectionReason: string;
    },
  ) {
    const updated = await tx.inventoryInboundReceipt.updateMany({
      where: {
        id: input.receiptId,
        storeId: input.storeId,
        status: "SUBMITTED",
      },
      data: {
        status: "REJECTED",
        approvedBy: input.rejectedBy,
        approvedAt: new Date(),
        rejectionReason: input.rejectionReason,
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
    return { id: input.receiptId, status: "REJECTED" as const };
  }

  async markReceiptNeedsRevision(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      revisedBy: string;
      revisionReason: string;
    },
  ) {
    const updated = await tx.inventoryInboundReceipt.updateMany({
      where: {
        id: input.receiptId,
        storeId: input.storeId,
        status: "SUBMITTED",
      },
      data: {
        status: "NEEDS_REVISION",
        approvedBy: input.revisedBy,
        approvedAt: new Date(),
        revisionReason: input.revisionReason,
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
    return { id: input.receiptId, status: "NEEDS_REVISION" as const };
  }

  async markReceiptSubmitted(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      submittedBy: string;
      submittedAt: Date;
    },
  ) {
    const updated = await tx.inventoryInboundReceipt.updateMany({
      where: {
        id: input.receiptId,
        storeId: input.storeId,
        status: { in: ["DRAFT", "NEEDS_REVISION"] },
      },
      data: {
        status: "SUBMITTED",
        submittedBy: input.submittedBy,
        submittedAt: input.submittedAt,
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
    return { id: input.receiptId, status: "SUBMITTED" as const };
  }

  async findReceiptForEdit(
    tx: Tx,
    input: { storeId: string; receiptId: string },
  ) {
    const receipt = await tx.inventoryInboundReceipt.findFirst({
      where: { id: input.receiptId, storeId: input.storeId },
      select: {
        id: true,
        storeId: true,
        status: true,
        submittedBy: true,
      },
    });
    if (!receipt) return null;
    return receipt;
  }

  async updateReceiptDraft(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      note?: string | null;
      lines: Array<{
        id: string;
        productId: string;
        expectedQuantity: number;
        receivedQuantity: number;
        status: InboundReceiptLineStatus;
        note?: string | null;
      }>;
    },
  ) {
    const updatedReceipt = await tx.inventoryInboundReceipt.updateMany({
      where: {
        id: input.receiptId,
        storeId: input.storeId,
        status: { in: ["DRAFT", "NEEDS_REVISION"] },
      },
      data: {
        note: input.note ?? null,
      },
    });
    if (updatedReceipt.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }

    for (const line of input.lines) {
      const updatedLine = await tx.inventoryInboundReceiptLine.updateMany({
        where: {
          id: line.id,
          receiptId: input.receiptId,
          productId: line.productId,
        },
        data: {
          status: line.status,
          expectedQuantity: line.expectedQuantity,
          receivedQuantity: line.receivedQuantity,
          expectedQuantitySnapshot: line.expectedQuantity,
          receivedQuantitySnapshot: line.receivedQuantity,
          note: line.note ?? null,
        },
      });
      if (updatedLine.count !== 1) {
        throw new Error("INBOUND_RECEIPT_CONFLICT");
      }
    }

    return { id: input.receiptId, status: "NEEDS_REVISION" as const };
  }

  async createInboundReceiptDraft(
    tx: Tx,
    input: CreateInboundReceiptDraftInput,
  ) {
    const productIds = Array.from(new Set(input.lines.map((line) => line.productId)));
    const products = await tx.product.findMany({
      where: {
        id: { in: productIds },
        storeId: input.storeId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        costPrice: true,
      },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    if (productById.size !== productIds.length) {
      throw new Error("INBOUND_RECEIPT_PRODUCT_NOT_FOUND");
    }

    const supplier = input.supplierId
      ? await tx.supplier.findFirst({
          where: { id: input.supplierId },
          select: { name: true },
        })
      : null;

    const receipt = await tx.inventoryInboundReceipt.create({
      data: {
        storeId: input.storeId,
        supplierId: input.supplierId ?? null,
        shoppingRequestId: input.shoppingRequestId ?? null,
        status: "DRAFT",
        note: input.note ?? null,
        submittedBy: input.createdBy,
        lines: {
          create: input.lines.map((line) => {
            const product = productById.get(line.productId);
            if (!product) throw new Error("INBOUND_RECEIPT_PRODUCT_NOT_FOUND");
            const costPrice =
              product.costPrice === null
                ? null
                : Number(product.costPrice.toString());
            return {
              productId: line.productId,
              shoppingRequestItemId: line.shoppingRequestItemId ?? null,
              status: line.status,
              expectedQuantity: line.expectedQuantity,
              receivedQuantity: line.receivedQuantity,
              expectedQuantitySnapshot: line.expectedQuantity,
              receivedQuantitySnapshot: line.receivedQuantity,
              productNameSnapshot: product.name,
              skuSnapshot: product.sku,
              unitSnapshot: product.unit,
              costPriceSnapshot: costPrice,
              supplierNameSnapshot: supplier?.name ?? null,
              invoiceNumberSnapshot: input.shoppingRequestId ?? null,
              note: line.note ?? null,
            };
          }),
        },
      },
      select: { id: true, status: true },
    });

    return { id: receipt.id, status: receipt.status };
  }

  async listInboundReceipts(
    storeId: string,
    input: { status?: InboundReceiptStatus },
  ) {
    return db.inventoryInboundReceipt.findMany({
      where: {
        storeId,
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        supplier: { select: { id: true, name: true } },
        lines: {
          orderBy: { createdAt: "asc" },
          take: 100,
        },
      },
    });
  }

  async listReceivingQueue(
    storeId: string,
    input: { search?: string | null; take?: number },
  ): Promise<ReceivingQueueRepositoryRow[]> {
    const take = Math.min(Math.max(input.take ?? 50, 1), 100);
    const search = input.search?.trim();
    const requests = await db.shoppingRequest.findMany({
      where: {
        storeId,
        status: "APPROVED",
        stockAppliedAt: null,
        ...(search
          ? {
              OR: [
                { number: { contains: search, mode: "insensitive" } },
                { supplier: { name: { contains: search, mode: "insensitive" } } },
                { items: { some: { productName: { contains: search, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }],
      take,
      select: {
        id: true,
        number: true,
        supplier: { select: { name: true } },
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productId: true,
            productName: true,
            unit: true,
            approvedQty: true,
            inboundLines: {
              where: {
                receipt: {
                  storeId,
                  status: { in: ["APPROVED", "SUBMITTED"] },
                },
              },
              select: {
                status: true,
                receivedQuantity: true,
                receipt: { select: { status: true } },
              },
            },
          },
        },
      },
    });

    return requests.flatMap((request) =>
      request.items.map((item) => ({
        shoppingRequestId: request.id,
        shoppingRequestNumber: request.number,
        supplierName: request.supplier?.name ?? null,
        itemId: item.id,
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        expectedQuantity: item.approvedQty ?? 0,
        receiptLines: item.inboundLines.map((line) => ({
          receiptStatus: line.receipt.status,
          lineStatus: line.status as InboundReceiptLineStatus,
          receivedQuantity: line.receivedQuantity,
        })),
      })),
    );
  }
}
