import { db, Prisma } from "@pos/db";
import {
  lockProductRow,
  lockProductStockGroupRow,
  lockStockMutationRows,
} from "@/features/product-stock-groups/stock-group-lock";
import { applyProductStockDelta } from "@/features/product-stock-groups/stock-mutations";
import {
  calculateInboundAvailability,
  getInboundStockQuantity,
} from "../helpers/inbound-receipt-rules";
import type {
  CreateInboundReceiptStockBundleInput,
  CreateInboundReceiptDraftInput,
  FinalizableInboundReceipt,
  GoodsPurchaseReceivingComparison,
  InboundReceiptStatus,
  InboundReceiptForApproval,
  InboundReceiptLineStatus,
  InventoryInboundReceiptRepository as InventoryInboundReceiptRepositoryContract,
  LockedInboundStockGroup,
  LockedSubmittedInboundReceipt,
  ReceivingQueueRepositoryRow,
} from "../types/inventory-management";

type Tx = Prisma.TransactionClient;

export class InventoryInboundReceiptRepository
  implements InventoryInboundReceiptRepositoryContract
{
  runInTransaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T> {
    return db.$transaction((tx) => callback(tx));
  }

  async lockSubmittedReceipt(
    tx: Tx,
    input: { storeId: string; receiptId: string },
  ): Promise<LockedSubmittedInboundReceipt | null> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "pos_inventory_inbound_receipts"
      WHERE "id" = ${input.receiptId}
        AND "storeId" = ${input.storeId}
        AND "status" = 'SUBMITTED'::"InventoryInboundReceiptStatus"
      FOR UPDATE
    `;
    if (locked.length !== 1) return null;

    return this.findReceiptForFinalization(tx, input);
  }

  async findReceiptForFinalization(
    tx: Tx,
    input: { storeId: string; receiptId: string },
  ): Promise<FinalizableInboundReceipt | null> {
    const receipt = await tx.inventoryInboundReceipt.findFirst({
      where: {
        id: input.receiptId,
        storeId: input.storeId,
        status: "SUBMITTED",
      },
      select: {
        id: true,
        storeId: true,
        status: true,
        goodsPurchaseId: true,
        stockBundleId: true,
        supplierId: true,
        supplier: { select: { name: true } },
        goodsPurchase: {
          select: {
            number: true,
            supplierNameSnapshot: true,
          },
        },
        lines: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productId: true,
            status: true,
            expectedQuantity: true,
            receivedQuantity: true,
            matchStatus: true,
            reviewStatus: true,
            approvedById: true,
            approvedByName: true,
            approvedAt: true,
            note: true,
            product: true,
            goodsPurchaseItem: {
              select: {
                id: true,
                goodsPurchaseId: true,
                productId: true,
                quantity: true,
                latestUnitPrice: true,
                inboundReceiptLines: {
                  where: {
                    receiptId: { not: input.receiptId },
                    receipt: {
                      storeId: input.storeId,
                      status: "APPROVED",
                    },
                  },
                  select: {
                    status: true,
                    receivedQuantity: true,
                  },
                },
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
      status: "SUBMITTED",
      goodsPurchaseId: receipt.goodsPurchaseId,
      goodsPurchaseNumber: receipt.goodsPurchase?.number ?? null,
      stockBundleId: receipt.stockBundleId,
      supplierId: receipt.supplierId,
      supplierName:
        receipt.goodsPurchase?.supplierNameSnapshot ??
        receipt.supplier?.name ??
        "Supplier",
      lines: receipt.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        status: line.status,
        expectedQuantity: line.expectedQuantity,
        receivedQuantity: line.receivedQuantity,
        matchStatus: line.matchStatus,
        reviewStatus: line.reviewStatus,
        approvedById: line.approvedById,
        approvedByName: line.approvedByName,
        approvedAt: line.approvedAt,
        note: line.note,
        product: line.product,
        stockGroupId: line.product.stockGroupId,
        unitMultiplierToBase: line.product.unitMultiplierToBase,
        conversionNeedsReview: line.product.conversionNeedsReview,
        goodsPurchaseItem: line.goodsPurchaseItem
          ? {
              id: line.goodsPurchaseItem.id,
              goodsPurchaseId: line.goodsPurchaseItem.goodsPurchaseId,
              productId: line.goodsPurchaseItem.productId,
              quantity: line.goodsPurchaseItem.quantity,
              latestUnitPrice: Number(
                line.goodsPurchaseItem.latestUnitPrice.toString(),
              ),
            }
          : null,
        approvedReceivedExcludingCurrentReceipt:
          line.goodsPurchaseItem?.inboundReceiptLines.reduce(
            (sum, approvedLine) =>
              sum +
              getInboundStockQuantity({
                status: approvedLine.status,
                receivedQuantity: approvedLine.receivedQuantity,
              }),
            0,
          ) ?? 0,
      })),
    };
  }

  async approveReceiptLine(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      itemId: string;
      reviewStatus: "APPROVED";
      approvedById: string;
      approvedByName: string | null;
      approvedAt: Date;
    },
  ): Promise<void> {
    const updated = await tx.inventoryInboundReceiptLine.updateMany({
      where: {
        id: input.itemId,
        receiptId: input.receiptId,
        receipt: {
          storeId: input.storeId,
          status: "SUBMITTED",
        },
      },
      data: {
        reviewStatus: input.reviewStatus,
        approvedById: input.approvedById,
        approvedByName: input.approvedByName,
        approvedAt: input.approvedAt,
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
  }

  async updateReceiptLine(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      itemId: string;
      matchStatus: "MATCHED" | "MISMATCHED";
      receivedQuantity: number;
      note: string | null;
      reviewStatus: "PENDING";
      approvedById: null;
      approvedByName: null;
      approvedAt: null;
    },
  ): Promise<void> {
    const updated = await tx.inventoryInboundReceiptLine.updateMany({
      where: {
        id: input.itemId,
        receiptId: input.receiptId,
        receipt: {
          storeId: input.storeId,
          status: "SUBMITTED",
        },
      },
      data: {
        matchStatus: input.matchStatus,
        receivedQuantity: input.receivedQuantity,
        receivedQuantitySnapshot: input.receivedQuantity,
        note: input.note,
        reviewStatus: input.reviewStatus,
        approvedById: input.approvedById,
        approvedByName: input.approvedByName,
        approvedAt: input.approvedAt,
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
  }

  async removeReceiptLine(
    tx: Tx,
    input: { storeId: string; receiptId: string; itemId: string },
  ): Promise<void> {
    const deleted = await tx.inventoryInboundReceiptLine.deleteMany({
      where: {
        id: input.itemId,
        receiptId: input.receiptId,
        receipt: {
          storeId: input.storeId,
          status: "SUBMITTED",
        },
      },
    });
    if (deleted.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
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
        goodsPurchaseId: true,
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
      goodsPurchaseId: receipt.goodsPurchaseId,
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

  async lockStockGroup(
    tx: Tx,
    input: { storeId: string; stockGroupId: string },
  ): Promise<LockedInboundStockGroup | null> {
    const locked = await lockProductStockGroupRow(tx, input);
    if (!locked) return null;

    const groupHint = await tx.productStockGroup.findFirst({
      where: {
        id: input.stockGroupId,
        storeId: input.storeId,
      },
      include: {
        products: {
          where: {
            storeId: input.storeId,
            isActive: true,
          },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!groupHint) return null;

    const candidateProductIds = groupHint.products
      .map((product) => product.id)
      .sort((left, right) => left.localeCompare(right));
    const locks = await lockStockMutationRows(tx, {
      storeId: input.storeId,
      stockGroupIds: [],
      productIds: candidateProductIds,
    });
    if (locks.lockedProductIds.length !== candidateProductIds.length) {
      return null;
    }

    const group = await tx.productStockGroup.findFirst({
      where: {
        id: input.stockGroupId,
        storeId: input.storeId,
      },
      include: {
        products: {
          where: {
            storeId: input.storeId,
            isActive: true,
          },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!group) return null;

    const currentProductIds = group.products
      .map((product) => product.id)
      .sort((left, right) => left.localeCompare(right));
    if (
      currentProductIds.length !== candidateProductIds.length ||
      currentProductIds.some(
        (productId, index) => productId !== candidateProductIds[index],
      ) ||
      group.products.some(
        (product) => product.stockGroupId !== input.stockGroupId,
      )
    ) {
      return null;
    }

    return {
      id: group.id,
      storeId: group.storeId,
      baseStock: group.baseStock,
      variants: group.products,
    };
  }

  async incrementStockGroupBase(
    tx: Tx,
    input: {
      storeId: string;
      stockGroupId: string;
      baseDelta: number;
    },
  ): Promise<void> {
    const updated = await tx.productStockGroup.updateMany({
      where: {
        id: input.stockGroupId,
        storeId: input.storeId,
      },
      data: {
        baseStock: { increment: input.baseDelta },
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
  }

  async incrementStandaloneProductStock(
    tx: Tx,
    input: {
      storeId: string;
      productId: string;
      quantity: number;
    },
  ) {
    const locked = await lockProductRow(tx, input);
    if (!locked) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }

    const product = await tx.product.findFirst({
      where: {
        id: input.productId,
        storeId: input.storeId,
        stockGroupId: null,
        isActive: true,
      },
    });
    if (!product) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }

    const mutation = await applyProductStockDelta(tx, {
      storeId: input.storeId,
      productId: input.productId,
      delta: input.quantity,
      productInfo: {
        id: product.id,
        stock: product.stock,
        stockGroupId: null,
        unitMultiplierToBase: product.unitMultiplierToBase,
        conversionNeedsReview: product.conversionNeedsReview,
        stockGroup: null,
      },
    });

    return {
      product,
      beforeStock: mutation.beforeStock,
      afterStock: mutation.afterStock,
    };
  }

  async createCanonicalInventoryLog(
    tx: Tx,
    input: {
      productId: string;
      supplierId: string | null;
      type: "IN";
      reason: "RESTOCK";
      quantity: number;
      unitCost: number;
      note: string;
      createdBy: string;
      person: string | null;
      status: "APPROVED";
      approvedBy: string;
      approverName: string | null;
      decidedAt: Date;
    },
  ): Promise<{ id: string }> {
    return tx.inventoryLog.create({
      data: input,
      select: { id: true },
    });
  }

  async createReceiptStockBundle(
    tx: Tx,
    input: CreateInboundReceiptStockBundleInput,
  ): Promise<{ id: string }> {
    const stockGroupIds = Array.from(
      new Set(
        input.variantImpacts.flatMap((impact) =>
          impact.stockGroupId ? [impact.stockGroupId] : [],
        ),
      ),
    );
    const batch = await tx.batchOperation.create({
      data: {
        type: input.type,
        status: input.status,
        storeId: input.storeId,
        createdBy: input.createdBy,
        summary: {
          source: "INBOUND_RECEIPT",
          title: input.title,
          receiptId: input.receiptId,
          goodsPurchaseId: input.goodsPurchaseId,
          goodsPurchaseNumber: input.goodsPurchaseNumber,
          supplierId: input.supplierId,
          supplierName: input.supplierName,
          type: "IN",
          totalCount: input.canonicalImpacts.length,
          approvedCount: input.canonicalImpacts.length,
          pendingCount: 0,
          rejectedCount: 0,
          stockGroupCount: stockGroupIds.length,
          variantImpactCount: input.variantImpacts.length,
          approvedByName: input.approvedByName,
          approvedAt: input.approvedAt.toISOString(),
        },
      },
      select: { id: true },
    });

    const items: Prisma.BatchOperationItemCreateManyInput[] = [
      ...input.canonicalImpacts.map((impact) => ({
        batchOperationId: batch.id,
        productId: impact.productId,
        sku: impact.sku,
        action: "STOCK_IN" as const,
        beforeSnapshot:
          impact.beforeSnapshot as unknown as Prisma.InputJsonValue,
        afterSnapshot:
          impact.afterSnapshot as unknown as Prisma.InputJsonValue,
        inventoryLogId: impact.inventoryLogId,
      })),
      ...input.variantImpacts.map((impact) => ({
        batchOperationId: batch.id,
        productId: impact.productId,
        sku: impact.sku,
        action: "STOCK_IN" as const,
        beforeSnapshot:
          impact.beforeSnapshot as unknown as Prisma.InputJsonValue,
        afterSnapshot:
          impact.afterSnapshot as unknown as Prisma.InputJsonValue,
        inventoryLogId: null,
      })),
    ];
    if (items.length > 0) {
      await tx.batchOperationItem.createMany({ data: items });
    }

    return batch;
  }

  async listGoodsPurchaseFulfillmentItems(
    tx: Tx,
    input: { storeId: string; goodsPurchaseId: string },
  ) {
    const items = await tx.goodsPurchaseItem.findMany({
      where: {
        goodsPurchaseId: input.goodsPurchaseId,
        goodsPurchase: {
          storeId: input.storeId,
          status: "APPROVED",
        },
      },
      select: {
        quantity: true,
        inboundReceiptLines: {
          where: {
            receipt: {
              storeId: input.storeId,
              goodsPurchaseId: input.goodsPurchaseId,
              status: "APPROVED",
            },
          },
          select: {
            status: true,
            receivedQuantity: true,
          },
        },
      },
    });

    return items.map((item) => ({
      orderedQuantity: item.quantity,
      approvedReceivedQuantity: item.inboundReceiptLines.reduce(
        (sum, line) =>
          sum +
          getInboundStockQuantity({
            status: line.status,
            receivedQuantity: line.receivedQuantity,
          }),
        0,
      ),
    }));
  }

  async updateGoodsPurchaseFulfillment(
    tx: Tx,
    input: {
      storeId: string;
      goodsPurchaseId: string;
      fulfillmentStatus: "NOT_RECEIVED" | "PARTIALLY_RECEIVED" | "RECEIVED";
    },
  ): Promise<void> {
    const updated = await tx.goodsPurchase.updateMany({
      where: {
        id: input.goodsPurchaseId,
        storeId: input.storeId,
        status: "APPROVED",
      },
      data: {
        fulfillmentStatus: input.fulfillmentStatus,
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }
  }

  async markReceiptApproved(
    tx: Tx,
    input: {
      storeId: string;
      receiptId: string;
      approvedBy: string;
      approvedAt: Date;
      stockBundleId?: string;
      legacyOnly?: boolean;
      lineLogIds: Array<{
        lineId: string;
        inventoryLogId: string;
        unitCost?: number;
      }>;
    },
  ) {
    const updated = await tx.inventoryInboundReceipt.updateMany({
      where: {
        id: input.receiptId,
        storeId: input.storeId,
        status: "SUBMITTED",
        ...(input.legacyOnly || !input.stockBundleId
          ? { goodsPurchaseId: null }
          : {}),
      },
      data: {
        status: "APPROVED",
        approvedBy: input.approvedBy,
        approvedAt: input.approvedAt,
        ...(input.stockBundleId
          ? { stockBundleId: input.stockBundleId }
          : {}),
      },
    });
    if (updated.count !== 1) {
      throw new Error("INBOUND_RECEIPT_CONFLICT");
    }

    for (const line of input.lineLogIds) {
      const updatedLine = await tx.inventoryInboundReceiptLine.updateMany({
        where: {
          id: line.lineId,
          receiptId: input.receiptId,
        },
        data: {
          inventoryLogId: line.inventoryLogId,
          ...(line.unitCost === undefined
            ? {}
            : { costPriceApplied: line.unitCost }),
        },
      });
      if (updatedLine.count !== 1) {
        throw new Error("INBOUND_RECEIPT_CONFLICT");
      }
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
        goodsPurchaseId: null,
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
        goodsPurchaseId: null,
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
        goodsPurchaseId: true,
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
        goodsPurchaseId: null,
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

  async lockGoodsPurchase(
    tx: Tx,
    input: { storeId: string; goodsPurchaseId: string },
  ): Promise<boolean> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "pos_goods_purchases"
      WHERE "id" = ${input.goodsPurchaseId}
        AND "storeId" = ${input.storeId}
      FOR UPDATE
    `;
    return locked.length === 1;
  }

  async findGoodsPurchaseForReceipt(
    tx: Tx,
    input: { storeId: string; goodsPurchaseId: string },
  ) {
    const purchase = await tx.goodsPurchase.findFirst({
      where: {
        id: input.goodsPurchaseId,
        storeId: input.storeId,
        status: "APPROVED",
      },
      select: {
        id: true,
        number: true,
        shoppingRequestId: true,
        supplierId: true,
        supplierNameSnapshot: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            shoppingRequestItemId: true,
            productId: true,
            productNameSnapshot: true,
            skuSnapshot: true,
            unitSnapshot: true,
            latestUnitPrice: true,
            quantity: true,
            inboundReceiptLines: {
              where: {
                receipt: {
                  storeId: input.storeId,
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
    if (!purchase) return null;

    return {
      ...purchase,
      items: purchase.items.map((item) => ({
        ...item,
        latestUnitPrice: Number(item.latestUnitPrice.toString()),
      })),
    };
  }

  async createSubmittedGoodsPurchaseReceipt(
    tx: Tx,
    input: {
      storeId: string;
      goodsPurchaseId: string;
      shoppingRequestId: string;
      supplierId: string | null;
      submittedBy: string;
      submittedAt: Date;
      note: string | null;
      lines: Array<{
        goodsPurchaseItemId: string;
        shoppingRequestItemId: string | null;
        productId: string;
        productNameSnapshot: string;
        skuSnapshot: string;
        unitSnapshot: string | null;
        costPriceSnapshot: number;
        supplierNameSnapshot: string;
        invoiceNumberSnapshot: string;
        expectedQuantity: number;
        receivedQuantity: number;
        status: "RECEIVED";
        matchStatus: "MATCHED" | "MISMATCHED";
        reviewStatus: "PENDING";
        note: string | null;
      }>;
    },
  ) {
    const receipt = await tx.inventoryInboundReceipt.create({
      data: {
        storeId: input.storeId,
        goodsPurchaseId: input.goodsPurchaseId,
        shoppingRequestId: input.shoppingRequestId,
        supplierId: input.supplierId,
        status: "SUBMITTED",
        submittedBy: input.submittedBy,
        submittedAt: input.submittedAt,
        note: input.note,
        lines: {
          create: input.lines.map((line) => ({
            goodsPurchaseItemId: line.goodsPurchaseItemId,
            shoppingRequestItemId: line.shoppingRequestItemId,
            productId: line.productId,
            productNameSnapshot: line.productNameSnapshot,
            skuSnapshot: line.skuSnapshot,
            unitSnapshot: line.unitSnapshot,
            costPriceSnapshot: line.costPriceSnapshot,
            supplierNameSnapshot: line.supplierNameSnapshot,
            invoiceNumberSnapshot: line.invoiceNumberSnapshot,
            status: line.status,
            matchStatus: line.matchStatus,
            reviewStatus: line.reviewStatus,
            expectedQuantity: line.expectedQuantity,
            receivedQuantity: line.receivedQuantity,
            expectedQuantitySnapshot: line.expectedQuantity,
            receivedQuantitySnapshot: line.receivedQuantity,
            note: line.note,
          })),
        },
      },
      select: { id: true, status: true },
    });

    return { id: receipt.id, status: receipt.status };
  }

  async listInboundReceipts(
    storeId: string,
    input: {
      status?: InboundReceiptStatus;
      goodsPurchaseId?: string | null;
    },
  ) {
    const receipts = await db.inventoryInboundReceipt.findMany({
      where: {
        storeId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.goodsPurchaseId
          ? { goodsPurchaseId: input.goodsPurchaseId }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        supplier: { select: { id: true, name: true } },
        goodsPurchase: { select: { number: true } },
        lines: {
          orderBy: { createdAt: "asc" },
          take: 100,
        },
      },
    });
    return receipts.map(({ goodsPurchase, ...receipt }) => ({
      ...receipt,
      goodsPurchaseNumber: goodsPurchase?.number ?? null,
    }));
  }

  async listReceivingQueue(
    storeId: string,
    input: {
      search?: string | null;
      take?: number;
      goodsPurchaseId?: string | null;
    },
  ): Promise<ReceivingQueueRepositoryRow[]> {
    const take = Math.min(Math.max(input.take ?? 50, 1), 100);
    const search = input.search?.trim();
    const purchases = await db.goodsPurchase.findMany({
      where: {
        storeId,
        status: "APPROVED",
        fulfillmentStatus: { not: "RECEIVED" },
        ...(input.goodsPurchaseId ? { id: input.goodsPurchaseId } : {}),
        ...(search
          ? {
              OR: [
                { number: { contains: search, mode: "insensitive" } },
                {
                  supplierNameSnapshot: {
                    contains: search,
                    mode: "insensitive",
                  },
                },
                {
                  items: {
                    some: {
                      OR: [
                        {
                          productNameSnapshot: {
                            contains: search,
                            mode: "insensitive",
                          },
                        },
                        {
                          skuSnapshot: {
                            contains: search,
                            mode: "insensitive",
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }],
      take,
      select: {
        id: true,
        number: true,
        supplierId: true,
        supplierNameSnapshot: true,
        fulfillmentStatus: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productId: true,
            productNameSnapshot: true,
            skuSnapshot: true,
            unitSnapshot: true,
            quantity: true,
            inboundReceiptLines: {
              where: {
                receipt: {
                  storeId,
                  status: { in: ["APPROVED", "SUBMITTED"] },
                },
              },
              select: {
                status: true,
                receivedQuantity: true,
                receipt: { select: { id: true, status: true } },
              },
            },
          },
        },
      },
    });

    return purchases.flatMap((purchase) =>
      purchase.items.map((item) => {
        const approvedReceivedQuantity = item.inboundReceiptLines
          .filter((line) => line.receipt.status === "APPROVED")
          .reduce(
            (sum, line) =>
              sum +
              getInboundStockQuantity({
                status: line.status,
                receivedQuantity: line.receivedQuantity,
              }),
            0,
          );
        const pendingLines = item.inboundReceiptLines.filter(
          (line) => line.receipt.status === "SUBMITTED",
        );
        const pendingReservedQuantity = pendingLines.reduce(
          (sum, line) =>
            sum +
            getInboundStockQuantity({
              status: line.status,
              receivedQuantity: line.receivedQuantity,
            }),
          0,
        );

        return {
          goodsPurchaseId: purchase.id,
          goodsPurchaseNumber: purchase.number,
          supplierId: purchase.supplierId,
          supplierName: purchase.supplierNameSnapshot,
          fulfillmentStatus: purchase.fulfillmentStatus,
          itemId: item.id,
          productId: item.productId,
          productName: item.productNameSnapshot,
          sku: item.skuSnapshot,
          unit: item.unitSnapshot,
          orderedQuantity: item.quantity,
          approvedReceivedQuantity,
          pendingReservedQuantity,
          pendingReceiptIds: Array.from(
            new Set(pendingLines.map((line) => line.receipt.id)),
          ),
        };
      }),
    );
  }

  async getGoodsPurchaseReceivingComparison(
    storeId: string,
    goodsPurchaseId: string,
  ): Promise<GoodsPurchaseReceivingComparison | null> {
    const purchase = await db.goodsPurchase.findFirst({
      where: { id: goodsPurchaseId, storeId },
      select: {
        id: true,
        number: true,
        supplierNameSnapshot: true,
        fulfillmentStatus: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            productNameSnapshot: true,
            skuSnapshot: true,
            unitSnapshot: true,
            quantity: true,
            inboundReceiptLines: {
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
        inboundReceipts: {
          where: { storeId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            createdAt: true,
            status: true,
            approvedAt: true,
            approver: { select: { name: true } },
            lines: {
              where: {
                goodsPurchaseItemId: { not: null },
                matchStatus: { not: null },
                goodsPurchaseItem: {
                  goodsPurchase: { storeId },
                },
              },
              orderBy: { createdAt: "asc" },
              select: {
                goodsPurchaseItemId: true,
                status: true,
                receivedQuantity: true,
                matchStatus: true,
                note: true,
              },
            },
          },
        },
      },
    });
    if (!purchase) return null;

    return {
      goodsPurchaseId: purchase.id,
      goodsPurchaseNumber: purchase.number,
      supplierName: purchase.supplierNameSnapshot,
      fulfillmentStatus: purchase.fulfillmentStatus,
      items: purchase.items.map((item) => {
        const approvedReceivedQuantity = item.inboundReceiptLines
          .filter((line) => line.receipt.status === "APPROVED")
          .reduce(
            (sum, line) =>
              sum +
              getInboundStockQuantity({
                status: line.status,
                receivedQuantity: line.receivedQuantity,
              }),
            0,
          );
        const pendingReservedQuantity = item.inboundReceiptLines
          .filter((line) => line.receipt.status === "SUBMITTED")
          .reduce(
            (sum, line) =>
              sum +
              getInboundStockQuantity({
                status: line.status,
                receivedQuantity: line.receivedQuantity,
              }),
            0,
          );
        const availability = calculateInboundAvailability({
          orderedQuantity: item.quantity,
          approvedReceivedQuantity,
          pendingReservedQuantity,
        });

        return {
          goodsPurchaseItemId: item.id,
          productName: item.productNameSnapshot,
          sku: item.skuSnapshot,
          unit: item.unitSnapshot,
          orderedQuantity: availability.orderedQuantity,
          approvedReceivedQuantity: availability.approvedReceivedQuantity,
          pendingReservedQuantity: availability.pendingReservedQuantity,
          remainingQuantity: availability.availableQuantity,
        };
      }),
      receipts: purchase.inboundReceipts.map((receipt) => ({
        id: receipt.id,
        createdAt: receipt.createdAt.toISOString(),
        status: receipt.status,
        approvedAt: receipt.approvedAt?.toISOString() ?? null,
        approverName: receipt.approver?.name ?? null,
        lines: receipt.lines.flatMap((line) =>
          line.goodsPurchaseItemId && line.matchStatus
            ? [
                {
                  goodsPurchaseItemId: line.goodsPurchaseItemId,
                  receivedQuantity: getInboundStockQuantity({
                    status: line.status,
                    receivedQuantity: line.receivedQuantity,
                  }),
                  matchStatus: line.matchStatus,
                  note: line.note,
                },
              ]
            : [],
        ),
      })),
    };
  }
}
