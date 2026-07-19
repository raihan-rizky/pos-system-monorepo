import { db, Prisma } from "@pos/db";
import { resolveProductDisplayStock } from "@/features/product-stock-groups/stock-display";
import {
  calculateShoppingRequestStockPreview,
  type ShoppingRequestStockPreview,
  type ShoppingStockPreviewRowInput,
} from "../helpers/shopping-request-stock";
import type {
  ShoppingRequestDetail,
  ShoppingRequestItemRecord,
  ShoppingRequestListItem,
  ShoppingRequestStatus,
  ShoppingRequestActor,
  ShoppingRequestKpiSummary,
  ShoppingRequestStockMode,
} from "../types/shopping-request";

export type ShoppingRequestListFilters = {
  storeId: string;
  q?: string;
  status?: ShoppingRequestStatus;
  supplierId?: string;
  skip: number;
  take: number;
};

type PrismaCreateItem = {
  productId: string;
  productName: string;
  unit: string | null;
  stockOnHand: number;
  requestedQty: number;
  stockMode: ShoppingRequestStockMode;
};

export type CreateShoppingRequestInputRepo = {
  storeId: string;
  number: string;
  sequence: number;
  supplierId: string | null;
  requestedByName: string | null;
  note: string | null;
  items: PrismaCreateItem[];
};

export type UpdateShoppingRequestStatusInputRepo = {
  status: ShoppingRequestStatus;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  cancelledAt: Date | null;
};

export function buildShoppingRequestWhere(
  filters: ShoppingRequestListFilters,
): Prisma.ShoppingRequestWhereInput {
  const where: Prisma.ShoppingRequestWhereInput = { storeId: filters.storeId };
  if (filters.status) where.status = filters.status;
  if (filters.supplierId) where.supplierId = filters.supplierId;
  if (filters.q) {
    where.OR = [
      { number: { contains: filters.q, mode: "insensitive" } },
      { requestedByName: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  return where;
}

export function countShoppingRequests(
  filters: ShoppingRequestListFilters,
): Promise<number> {
  return db.shoppingRequest.count({ where: buildShoppingRequestWhere(filters) });
}

export function listShoppingRequests(
  filters: ShoppingRequestListFilters,
): Promise<ShoppingRequestListItem[]> {
  return db.shoppingRequest
    .findMany({
      where: buildShoppingRequestWhere(filters),
      include: {
        supplier: { select: { id: true, name: true } },
        _count: { select: { items: true } },
        items: {
          select: {
            requestedQty: true,
            approvedQty: true,
            decisionStatus: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: filters.skip,
      take: filters.take,
    })
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        number: row.number,
        status: row.status,
        supplierId: row.supplierId,
        supplierName: row.supplier?.name ?? null,
        requestedByName: row.requestedByName,
        approvedByName: row.approvedByName,
        itemCount: row._count.items,
        decidedItemCount: row.items.filter(
          (item) => item.decisionStatus !== "PENDING",
        ).length,
        pendingItemCount: row.items.filter(
          (item) => item.decisionStatus === "PENDING",
        ).length,
        totalRequestedQty: row.items.reduce(
          (sum, item) => sum + item.requestedQty,
          0,
        ),
        totalApprovedQty:
          row.approvedById === null &&
          row.items.every((item) => item.approvedQty === null)
            ? null
            : row.items.reduce(
                (sum, item) => sum + (item.approvedQty ?? 0),
                0,
              ),
        createdAt: row.createdAt.toISOString(),
        approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
        note: row.note,
        stockAppliedAt: row.stockAppliedAt ? row.stockAppliedAt.toISOString() : null,
      })),
    );
}

export async function getShoppingRequestKpiSummary(
  storeId: string,
): Promise<ShoppingRequestKpiSummary> {
  const [statusRows, pendingQuantity, approvedQuantity] = await Promise.all([
    db.shoppingRequest.groupBy({
      by: ["status"],
      where: { storeId },
      _count: { _all: true },
    }),
    db.shoppingRequestItem.aggregate({
      where: {
        shoppingRequest: { storeId },
        decisionStatus: "PENDING",
      },
      _sum: { requestedQty: true },
    }),
    db.shoppingRequestItem.aggregate({
      where: {
        shoppingRequest: { storeId },
        decisionStatus: { in: ["APPROVED", "REJECTED"] },
      },
      _sum: { requestedQty: true, approvedQty: true },
    }),
  ]);

  const countByStatus = new Map(
    statusRows.map((row) => [row.status, row._count._all]),
  );
  const approvedRequestedQty = approvedQuantity._sum.requestedQty ?? 0;
  const approvedQty = approvedQuantity._sum.approvedQty ?? 0;
  const fulfillmentRate =
    approvedRequestedQty > 0
      ? Math.round((approvedQty / approvedRequestedQty) * 1000) / 10
      : 0;

  return {
    pendingRequestCount: countByStatus.get("REQUESTED") ?? 0,
    pendingRequestedQty: pendingQuantity._sum.requestedQty ?? 0,
    approvedRequestCount: countByStatus.get("APPROVED") ?? 0,
    fulfillmentRate,
  };
}

export function findShoppingRequestById(
  id: string,
  storeId?: string,
): Promise<ShoppingRequestDetail | null> {
  return db.shoppingRequest
    .findFirst({
      where: { id, ...(storeId ? { storeId } : {}) },
      include: {
        supplier: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { name: true, sku: true, unit: true, imageUrl: true, costPrice: true, conversionNeedsReview: true, unitMultiplierToBase: true, stockGroup: { select: { id: true, displayName: true, baseUnit: true, baseStock: true } } } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    })
    .then((row) => {
      if (!row) return null;
      const items: ShoppingRequestItemRecord[] = row.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        productSku: item.product.sku,
        unit: item.unit ?? item.product.unit,
        stockOnHand: item.stockOnHand,
        requestedQty: item.requestedQty,
        approvedQty: item.approvedQty,
        stockMode: item.stockMode,
        decisionStatus: item.decisionStatus,
        decidedById: item.decidedById,
        decidedByName: item.decidedByName,
        decidedAt: item.decidedAt ? item.decidedAt.toISOString() : null,
        itemStockAppliedAt: item.stockAppliedAt
          ? item.stockAppliedAt.toISOString()
          : null,
        costPriceSnapshot: item.costPriceSnapshot?.toString() ?? null,
        imageUrl: item.product.imageUrl,
        product: {
          costPrice: item.product.costPrice?.toString() ?? null,
          unitMultiplierToBase: item.product.unitMultiplierToBase,
          conversionNeedsReview: item.product.conversionNeedsReview,
          stockGroup: item.product.stockGroup,
        },
      }));
      const totalRequestedQty = items.reduce(
        (sum, item) => sum + item.requestedQty,
        0,
      );
      const allApproved = items.every((item) => item.approvedQty !== null);
      const totalApprovedQty = allApproved
        ? items.reduce((sum, item) => sum + (item.approvedQty ?? 0), 0)
        : null;
      return {
        id: row.id,
        number: row.number,
        status: row.status,
        supplierId: row.supplierId,
        supplierName: row.supplier?.name ?? null,
        requestedByName: row.requestedByName,
        approvedByName: row.approvedByName,
        itemCount: items.length,
        decidedItemCount: items.filter(
          (item) => item.decisionStatus !== "PENDING",
        ).length,
        pendingItemCount: items.filter(
          (item) => item.decisionStatus === "PENDING",
        ).length,
        totalRequestedQty,
        totalApprovedQty,
        createdAt: row.createdAt.toISOString(),
        approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
        note: row.note,
        stockAppliedAt: row.stockAppliedAt ? row.stockAppliedAt.toISOString() : null,
        items,
      };
    });
}

export async function createShoppingRequestWithItems(
  input: CreateShoppingRequestInputRepo,
  tx: Prisma.TransactionClient = db,
): Promise<ShoppingRequestDetail> {
  const row = await tx.shoppingRequest.create({
    data: {
      storeId: input.storeId,
      number: input.number,
      sequence: input.sequence,
      supplierId: input.supplierId,
      requestedByName: input.requestedByName,
      note: input.note,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          unit: item.unit,
          stockOnHand: item.stockOnHand,
          requestedQty: item.requestedQty,
          stockMode: item.stockMode,
        })),
      },
    },
    include: {
      items: {
        include: {
          product: { select: { name: true, sku: true, unit: true, imageUrl: true, costPrice: true, conversionNeedsReview: true, unitMultiplierToBase: true, stockGroup: { select: { id: true, displayName: true, baseUnit: true, baseStock: true } } } },
        },
      },
      supplier: { select: { id: true, name: true } },
    },
  });
  return reify(row);
}

export async function updateShoppingRequestWithItems(input: {
  id: string;
  actor: ShoppingRequestActor;
  supplierId: string;
  note: string | null;
  items: PrismaCreateItem[];
}): Promise<ShoppingRequestDetail> {
  return db.$transaction(async (tx) => {
    const lock = await tx.shoppingRequest.updateMany({
      where: {
        id: input.id,
        storeId: input.actor.storeId,
        status: "REQUESTED",
      },
      data: { updatedAt: new Date() },
    });
    if (lock.count !== 1) throw new Error("ALREADY_DECIDED");

    const request = await tx.shoppingRequest.findFirst({
      where: { id: input.id, storeId: input.actor.storeId },
      select: {
        id: true,
        items: {
          select: {
            id: true,
            productId: true,
            requestedQty: true,
            decisionStatus: true,
          },
        },
      },
    });
    if (!request) throw new Error("NOT_FOUND");
    if (request.items.some((item) => item.decisionStatus !== "PENDING")) {
      throw new Error("ALREADY_DECIDED");
    }

    const existingByProduct = new Map(
      request.items.map((item) => [item.productId, item]),
    );
    const nextProductIds = new Set(input.items.map((item) => item.productId));
    if (nextProductIds.size !== input.items.length) {
      throw new Error("INVALID_ITEMS");
    }
    const removedIds = request.items
      .filter((item) => !nextProductIds.has(item.productId))
      .map((item) => item.id);
    if (removedIds.length > 0) {
      const removed = await tx.shoppingRequestItem.deleteMany({
        where: {
          shoppingRequestId: input.id,
          id: { in: removedIds },
          decisionStatus: "PENDING",
        },
      });
      if (removed.count !== removedIds.length) throw new Error("ALREADY_DECIDED");
    }

    for (const item of input.items) {
      const existing = existingByProduct.get(item.productId);
      if (!existing) {
        await tx.shoppingRequestItem.create({
          data: {
            shoppingRequestId: input.id,
            productId: item.productId,
            productName: item.productName,
            unit: item.unit,
            stockOnHand: item.stockOnHand,
            requestedQty: item.requestedQty,
            approvedQty: null,
            stockMode: item.stockMode,
            decisionStatus: "PENDING",
          },
        });
        continue;
      }
      const updated = await tx.shoppingRequestItem.updateMany({
        where: {
          id: existing.id,
          shoppingRequestId: input.id,
          decisionStatus: "PENDING",
        },
        data: {
          productName: item.productName,
          unit: item.unit,
          stockOnHand: item.stockOnHand,
          requestedQty: item.requestedQty,
          ...(existing.requestedQty !== item.requestedQty
            ? { approvedQty: null }
            : {}),
          stockMode: item.stockMode,
        },
      });
      if (updated.count !== 1) throw new Error("ALREADY_DECIDED");
    }

    const row = await tx.shoppingRequest.update({
      where: { id: input.id },
      data: { supplierId: input.supplierId, note: input.note },
      include: {
        supplier: { select: { id: true, name: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                sku: true,
                unit: true,
                imageUrl: true,
                conversionNeedsReview: true,
                unitMultiplierToBase: true,
                stockGroup: {
                  select: {
                    id: true,
                    displayName: true,
                    baseUnit: true,
                    baseStock: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return reify(row);
  });
}

export async function updateShoppingRequestItems(
  id: string,
  items: { id: string; approvedQty: number }[],
  tx: Prisma.TransactionClient = db,
): Promise<void> {
  await Promise.all(
    items.map((item) =>
      tx.shoppingRequestItem.update({
        where: { id: item.id },
        data: { approvedQty: item.approvedQty },
      }),
    ),
  );
}

export async function updateShoppingRequestStatus(
  id: string,
  data: UpdateShoppingRequestStatusInputRepo,
  tx: Prisma.TransactionClient = db,
): Promise<ShoppingRequestDetail> {
  const row = await tx.shoppingRequest.update({
    where: { id },
    data: {
      status: data.status,
      approvedById: data.approvedById,
      approvedByName: data.approvedByName,
      approvedAt: data.approvedAt,
      cancelledAt: data.cancelledAt,
    },
    include: {
      items: {
        include: {
          product: { select: { name: true, sku: true, unit: true, imageUrl: true, costPrice: true, conversionNeedsReview: true, unitMultiplierToBase: true, stockGroup: { select: { id: true, displayName: true, baseUnit: true, baseStock: true } } } },
        },
      },
      supplier: { select: { id: true, name: true } },
    },
  });
  return reify(row);
}

export async function cancelShoppingRequestIfUndecided(input: {
  id: string;
  actor: ShoppingRequestActor;
}): Promise<ShoppingRequestDetail> {
  return db.$transaction(async (tx) => {
    const lock = await tx.shoppingRequest.updateMany({
      where: {
        id: input.id,
        storeId: input.actor.storeId,
        status: "REQUESTED",
      },
      data: { updatedAt: new Date() },
    });
    if (lock.count !== 1) throw new Error("ALREADY_DECIDED");

    const decidedItemCount = await tx.shoppingRequestItem.count({
      where: {
        shoppingRequestId: input.id,
        decisionStatus: { not: "PENDING" },
      },
    });
    if (decidedItemCount > 0) throw new Error("ALREADY_DECIDED");

    await tx.shoppingRequest.update({
      where: { id: input.id },
      data: {
        status: "CANCELLED",
        approvedById: null,
        approvedByName: input.actor.name,
        approvedAt: null,
        cancelledAt: new Date(),
      },
    });
    const row = await loadShoppingRequestDetailRow(
      tx,
      input.id,
      input.actor.storeId,
    );
    if (!row) throw new Error("NOT_FOUND");
    return reify(row);
  });
}

function toShoppingStockProduct(product: {
  id: string;
  name: string;
  sku: string;
  unit: string;
  stock: number;
  imageUrl: string | null;
  stockGroupId: string | null;
  unitMultiplierToBase: number;
  conversionNeedsReview: boolean;
  stockGroup: { baseStock: number } | null;
}) {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    unit: product.unit,
    stock: resolveProductDisplayStock(product),
    imageUrl: product.imageUrl,
    stockGroupId: product.stockGroupId,
    unitMultiplierToBase: product.unitMultiplierToBase,
    conversionNeedsReview: product.conversionNeedsReview,
  };
}

export async function buildShoppingRequestStockPreview(
  storeId: string,
  rows: ShoppingStockPreviewRowInput[],
  tx: Prisma.TransactionClient = db,
): Promise<ShoppingRequestStockPreview> {
  const productIds = Array.from(new Set(rows.map((row) => row.productId)));
  const selectedProducts = await tx.product.findMany({
    where: { id: { in: productIds }, storeId, isActive: true },
    include: { stockGroup: { select: { baseStock: true } } },
  });
  if (selectedProducts.length !== productIds.length) {
    throw new Error("PRODUCT_NOT_FOUND");
  }

  const stockGroupIds = Array.from(
    new Set(
      selectedProducts
        .map((product) => product.stockGroupId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const groups = stockGroupIds.length
    ? await tx.productStockGroup.findMany({
        where: { id: { in: stockGroupIds }, storeId },
        include: { products: { where: { isActive: true } } },
      })
    : [];

  return calculateShoppingRequestStockPreview({
    rows,
    products: selectedProducts.map(toShoppingStockProduct),
    groups: groups.map((group) => ({
      id: group.id,
      displayName: group.displayName,
      baseUnit: group.baseUnit,
      baseStock: group.baseStock,
      variants: group.products.map((product) =>
        toShoppingStockProduct({
          ...product,
          stockGroup: { baseStock: group.baseStock },
        }),
      ),
    })),
  });
}

export async function saveShoppingRequestApprovedQuantities(input: {
  id: string;
  actor: ShoppingRequestActor;
  items: Array<{ id: string; approvedQty: number }>;
}): Promise<ShoppingRequestDetail> {
  return db.$transaction(async (tx) => {
    const lock = await tx.shoppingRequest.updateMany({
      where: {
        id: input.id,
        storeId: input.actor.storeId,
        status: "REQUESTED",
      },
      data: { updatedAt: new Date() },
    });
    if (lock.count !== 1) throw new Error("ALREADY_DECIDED");

    const request = await tx.shoppingRequest.findFirst({
      where: { id: input.id, storeId: input.actor.storeId },
      select: {
        id: true,
        items: { select: { id: true, decisionStatus: true } },
      },
    });
    if (!request) throw new Error("NOT_FOUND");
    const itemIds = new Set(request.items.map((item) => item.id));

    for (const item of input.items) {
      if (!itemIds.has(item.id)) throw new Error("INVALID_ITEMS");
      const updated = await tx.shoppingRequestItem.updateMany({
        where: {
          id: item.id,
          shoppingRequestId: input.id,
          decisionStatus: "PENDING",
        },
        data: { approvedQty: item.approvedQty },
      });
      if (updated.count !== 1) throw new Error("ALREADY_DECIDED");
    }

    const row = await loadShoppingRequestDetailRow(
      tx,
      input.id,
      input.actor.storeId,
    );
    if (!row) throw new Error("NOT_FOUND");
    return reify(row);
  });
}

export async function approveShoppingRequestItemsWithStock(input: {
  id: string;
  actor: ShoppingRequestActor;
  items: Array<{ id: string; stockMode: ShoppingRequestStockMode }>;
  approveAllPending: boolean;
}): Promise<ShoppingRequestDetail> {
  return db.$transaction(async (tx) => {
    const lock = await tx.shoppingRequest.updateMany({
      where: {
        id: input.id,
        storeId: input.actor.storeId,
        status: "REQUESTED",
      },
      data: { updatedAt: new Date() },
    });
    if (lock.count !== 1) throw new Error("ALREADY_DECIDED");

    const request = await tx.shoppingRequest.findFirst({
      where: { id: input.id, storeId: input.actor.storeId },
      include: {
        supplier: { select: { id: true, name: true, isActive: true } },
        inboundReceipts: {
          where: { status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
          select: { id: true },
          take: 1,
        },
        items: {
          select: {
            id: true,
            productId: true,
            productName: true,
            requestedQty: true,
            approvedQty: true,
            stockMode: true,
            decisionStatus: true,
            costPriceSnapshot: true,
            product: { select: { costPrice: true } },
          },
        },
      },
    });
    if (!request) throw new Error("NOT_FOUND");
    if (!request.supplier?.isActive) throw new Error("SUPPLIER_INACTIVE");
    if (request.inboundReceipts.length > 0) throw new Error("RECEIPT_CONFLICT");
    if (request.status !== "REQUESTED" || request.stockAppliedAt) {
      throw new Error("ALREADY_DECIDED");
    }
    const requestItemsById = new Map(request.items.map((item) => [item.id, item]));
    const pendingItems = request.items.filter(
      (item) => item.decisionStatus === "PENDING",
    );
    if (input.approveAllPending && input.items.length !== pendingItems.length) {
      throw new Error("INVALID_ITEMS");
    }
    const seen = new Set<string>();
    const previewRows = input.items.map((item) => {
      const requestItem = requestItemsById.get(item.id);
      if (
        !requestItem ||
        requestItem.decisionStatus !== "PENDING" ||
        seen.has(item.id)
      ) {
        throw new Error("INVALID_ITEMS");
      }
      seen.add(item.id);
      if (requestItem.approvedQty === null) {
        throw new Error("APPROVED_QTY_REQUIRED");
      }
      return {
        itemId: item.id,
        productId: requestItem.productId,
        stockMode: item.stockMode,
        quantity: requestItem.approvedQty,
      };
    });
    if (
      input.approveAllPending &&
      pendingItems.some((item) => !seen.has(item.id))
    ) {
      throw new Error("INVALID_ITEMS");
    }

    const decidedAt = new Date();
    for (const item of input.items) {
      const requestItem = requestItemsById.get(item.id)!;
      const approvedQty = requestItem.approvedQty!;
      const claim = await tx.shoppingRequestItem.updateMany({
        where: {
          id: item.id,
          shoppingRequestId: input.id,
          decisionStatus: "PENDING",
          approvedQty: { not: null },
        },
        data: {
          decisionStatus: approvedQty === 0 ? "REJECTED" : "APPROVED",
          decidedById: input.actor.id,
          decidedByName: input.actor.name,
          decidedAt,
          stockAppliedAt: approvedQty > 0 ? decidedAt : null,
          stockMode: item.stockMode,
        },
      });
      if (claim.count !== 1) throw new Error("ALREADY_DECIDED");
    }

    const preview = await buildShoppingRequestStockPreview(
      input.actor.storeId,
      previewRows,
      tx,
    );

    for (const groupRow of preview.groupRows) {
      if (groupRow.baseDelta === 0) continue;
      const updated = await tx.productStockGroup.updateMany({
        where: { id: groupRow.stockGroupId, storeId: input.actor.storeId },
        data: { baseStock: { increment: groupRow.baseDelta } },
      });
      if (updated.count !== 1) throw new Error("GROUP_NOT_FOUND");
    }
    for (const productRow of preview.productRows) {
      if (productRow.delta === 0) continue;
      const updated = await tx.product.updateMany({
        where: { id: productRow.productId, storeId: input.actor.storeId },
        data: { stock: { increment: productRow.delta } },
      });
      if (updated.count !== 1) throw new Error("PRODUCT_NOT_FOUND");
    }

    for (const item of input.items) {
      const requestItem = requestItemsById.get(item.id)!;
      const approvedQty = requestItem.approvedQty!;
      const costPriceSnapshot = requestItem.product.costPrice;
      await tx.shoppingRequestItem.update({
        where: { id: item.id },
        data: { costPriceSnapshot },
      });
      if (approvedQty > 0) {
        await tx.inventoryLog.create({
          data: {
            productId: requestItem.productId,
            type: "IN",
            reason: "RESTOCK",
            quantity: approvedQty,
            note: `Permohonan Belanja ${request.number}\nMode: ${
              item.stockMode === "GROUP_STOCK" ? "Stok Bersama" : "Stok Produk Ini"
            }`,
            supplierId: request.supplierId,
            createdBy: input.actor.id,
            person: input.actor.name,
            status: "APPROVED",
            approvedBy: input.actor.id,
            approverName: input.actor.name,
            decidedAt,
            unitCost: costPriceSnapshot,
          },
        });
      }
    }

    const pendingCount = await tx.shoppingRequestItem.count({
      where: {
        shoppingRequestId: request.id,
        decisionStatus: "PENDING",
      },
    });

    if (pendingCount > 0) {
      const row = await loadShoppingRequestDetailRow(
        tx,
        input.id,
        input.actor.storeId,
      );
      if (!row) throw new Error("NOT_FOUND");
      return reify(row);
    }

    const currentIds = new Set(input.items.map((item) => item.id));
    let expenseAmount = new Prisma.Decimal(0);
    let hasMissingCostSnapshot = false;
    for (const item of request.items) {
      const approvedQty = item.approvedQty ?? 0;
      if (approvedQty <= 0) continue;
      const costPriceSnapshot = currentIds.has(item.id)
        ? item.product.costPrice
        : item.costPriceSnapshot;
      if (costPriceSnapshot === null) hasMissingCostSnapshot = true;
      if (costPriceSnapshot !== null) {
        expenseAmount = expenseAmount.add(
          new Prisma.Decimal(costPriceSnapshot)
            .mul(new Prisma.Decimal(String(approvedQty)))
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        );
      }
    }

    await tx.expense.create({
      data: {
        storeId: input.actor.storeId,
        recordedById: input.actor.id,
        shoppingRequestId: request.id,
        applicantName: request.supplier.name,
        category: "SUPPLIES",
        description: `Permohonan Belanja ${request.number} - ${request.items.length} item`,
        amount: expenseAmount,
        changeAmount: 0,
        occurredAt: request.createdAt,
        hasMissingCostSnapshot,
      },
    });

    const row = await tx.shoppingRequest.update({
      where: { id: input.id },
      data: {
        status: "APPROVED",
        approvedById: input.actor.id,
        approvedByName: input.actor.name,
        approvedAt: decidedAt,
        stockAppliedAt: decidedAt,
        cancelledAt: null,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        items: {
          include: {
            product: {
              select: {
                name: true,
                sku: true,
                unit: true,
                imageUrl: true,
                costPrice: true,
                conversionNeedsReview: true,
                unitMultiplierToBase: true,
                stockGroup: {
                  select: {
                    id: true,
                    displayName: true,
                    baseUnit: true,
                    baseStock: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    return reify(row);
  });
}

function loadShoppingRequestDetailRow(
  client: Prisma.TransactionClient,
  id: string,
  storeId: string,
) {
  return client.shoppingRequest.findFirst({
    where: { id, storeId },
    include: {
      supplier: { select: { id: true, name: true } },
      items: {
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              unit: true,
              imageUrl: true,
              conversionNeedsReview: true,
              unitMultiplierToBase: true,
              stockGroup: {
                select: {
                  id: true,
                  displayName: true,
                  baseUnit: true,
                  baseStock: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

function reify(row: {
  id: string;
  number: string;
  status: ShoppingRequestStatus;
  supplierId: string | null;
  requestedByName: string | null;
  approvedByName: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  note: string | null;
  stockAppliedAt: Date | null;
  createdAt: Date;
  supplier: { id: string; name: string } | null;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    unit: string | null;
    stockOnHand: number;
    requestedQty: number;
    approvedQty: number | null;
    stockMode: ShoppingRequestStockMode;
    decisionStatus: "PENDING" | "APPROVED" | "REJECTED";
    decidedById: string | null;
    decidedByName: string | null;
    decidedAt: Date | null;
    stockAppliedAt: Date | null;
    costPriceSnapshot: { toString(): string } | null;
    product: { name: string; sku: string; unit: string; imageUrl: string | null; costPrice?: { toString(): string } | null; conversionNeedsReview: boolean; unitMultiplierToBase?: number | null; stockGroup?: { id: string; displayName: string; baseUnit: string | null; baseStock: number } | null };
  }>;
}): ShoppingRequestDetail {
  const items: ShoppingRequestItemRecord[] = row.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    productSku: item.product.sku,
    unit: item.unit ?? item.product.unit,
    stockOnHand: item.stockOnHand,
    requestedQty: item.requestedQty,
    approvedQty: item.approvedQty,
    stockMode: item.stockMode,
    decisionStatus: item.decisionStatus,
    decidedById: item.decidedById,
    decidedByName: item.decidedByName,
    decidedAt: item.decidedAt ? item.decidedAt.toISOString() : null,
    itemStockAppliedAt: item.stockAppliedAt
      ? item.stockAppliedAt.toISOString()
      : null,
    costPriceSnapshot: item.costPriceSnapshot?.toString() ?? null,
    imageUrl: item.product.imageUrl,
    product: {
      costPrice: item.product.costPrice?.toString() ?? null,
      unitMultiplierToBase: item.product.unitMultiplierToBase,
      conversionNeedsReview: item.product.conversionNeedsReview,
      stockGroup: item.product.stockGroup,
    },
  }));
  const totalRequestedQty = items.reduce(
    (sum, item) => sum + item.requestedQty,
    0,
  );
  const allApproved = items.every((item) => item.approvedQty !== null);
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    requestedByName: row.requestedByName,
    approvedByName: row.approvedByName,
    itemCount: items.length,
    decidedItemCount: items.filter(
      (item) => item.decisionStatus !== "PENDING",
    ).length,
    pendingItemCount: items.filter(
      (item) => item.decisionStatus === "PENDING",
    ).length,
    totalRequestedQty,
    totalApprovedQty: allApproved
      ? items.reduce((sum, item) => sum + (item.approvedQty ?? 0), 0)
      : null,
    createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    note: row.note,
    stockAppliedAt: row.stockAppliedAt ? row.stockAppliedAt.toISOString() : null,
    items,
  };
}
